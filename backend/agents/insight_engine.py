"""
Insight Engine — Deterministic Preprocessing Layer
═══════════════════════════════════════════════════
Runs BEFORE any LLM agent. Pure Python math + rule matching.
Replaces card_agent, offer_agent, emi_agent, wallet_agent with ~0ms computation.

Output: InsightBundle dict consumed by conflict_resolver + decision_agent.
"""

import json, logging, math
from typing import Optional

logger = logging.getLogger(__name__)


# ── Card BIN → Bank Lookup (extend as needed) ────────────────────────────────
CARD_BIN_DB = {
    "401200": {"bank": "HDFC Bank", "network": "Visa", "tier": "Platinum", "base_reward_pct": 1.5},
    "414720": {"bank": "HDFC Bank", "network": "Visa", "tier": "Millennia", "base_reward_pct": 5.0},
    "454365": {"bank": "HDFC Bank", "network": "Visa", "tier": "Regalia", "base_reward_pct": 4.0},
    "521234": {"bank": "SBI Bank", "network": "Mastercard", "tier": "SimplyCLICK", "base_reward_pct": 2.5},
    "524094": {"bank": "SBI Bank", "network": "Mastercard", "tier": "Prime", "base_reward_pct": 1.0},
    "421653": {"bank": "Axis Bank", "network": "Visa", "tier": "Flipkart", "base_reward_pct": 5.0},
    "462273": {"bank": "Axis Bank", "network": "Visa", "tier": "MY Zone", "base_reward_pct": 2.0},
}


def run_insight_engine(
    amount_paise: int,
    card_bin: str,
    card_type: str,
    wallet_balances: dict,
    offers_data: dict,
) -> dict:
    """
    Pure-Python preprocessing. Returns structured InsightBundle.
    Takes ~0ms vs ~60s for 4 LLM agents.
    """
    logger.info(f"[InsightEngine] Processing: card={card_bin} amount=₹{amount_paise/100} type={card_type}")

    card_insight = _analyse_card(card_bin, card_type, amount_paise)
    offer_insights = _analyse_offers(offers_data, card_bin, card_type, amount_paise)
    emi_insights = _analyse_emi(offers_data, amount_paise)
    wallet_insight = _analyse_wallet(wallet_balances, amount_paise, offer_insights)

    # Rank all options by net_saving_paise descending
    all_options = []
    for offer in offer_insights:
        all_options.append({
            "type": "INSTANT_DISCOUNT" if offer["discount_type"] == "INSTANT" else "CASHBACK",
            "method": "CARD",
            "bank": offer["bank"],
            "offer_id": offer["offer_id"],
            "tenure_id": offer["tenure_id"],
            "net_saving_paise": offer["discount_paise"],
            "effective_amount_paise": amount_paise - offer["discount_paise"],
            "eligible": offer["eligible"],
            "reason": offer["reason"],
        })
    for emi in emi_insights:
        saving_vs_upfront = amount_paise - emi["total_emi_paise"]  # negative = costs more
        all_options.append({
            "type": "EMI",
            "method": "CREDIT_EMI",
            "bank": emi["bank"],
            "offer_id": emi["offer_id"],
            "tenure_id": emi["tenure_id"],
            "net_saving_paise": max(saving_vs_upfront, 0),
            "effective_amount_paise": emi["total_emi_paise"],
            "monthly_paise": emi["monthly_paise"],
            "tenure_months": emi["tenure_months"],
            "interest_rate": emi["interest_rate"],
            "no_cost": emi["no_cost"],
            "eligible": True,
            "reason": emi["reason"],
        })

    # Sort by net_saving descending, then eligible first
    all_options.sort(key=lambda x: (-int(x["eligible"]), -x["net_saving_paise"]))

    bundle = {
        "card": card_insight,
        "offers": offer_insights,
        "emi_options": emi_insights,
        "wallet": wallet_insight,
        "ranked_options": all_options[:5],  # Top 5 for LLM to reason about
        "best_option": all_options[0] if all_options else None,
        "total_options_found": len(all_options),
    }

    logger.info(f"[InsightEngine] Done: {len(offer_insights)} offers, {len(emi_insights)} EMI options, "
                f"best saving=₹{(all_options[0]['net_saving_paise']/100 if all_options else 0):.0f}")
    return bundle


# ── Card Analysis (replaces card_agent) ───────────────────────────────────────

def _analyse_card(card_bin: str, card_type: str, amount_paise: int) -> dict:
    card_info = CARD_BIN_DB.get(card_bin, {
        "bank": "Unknown",
        "network": "Unknown",
        "tier": "Standard",
        "base_reward_pct": 1.0,
    })
    estimated_reward = int(amount_paise * card_info["base_reward_pct"] / 100)
    return {
        "card_bin": card_bin,
        "card_type": card_type,
        "bank": card_info["bank"],
        "network": card_info["network"],
        "tier": card_info["tier"],
        "base_reward_pct": card_info["base_reward_pct"],
        "estimated_reward_paise": estimated_reward,
    }


# ── Offer Eligibility (replaces offer_agent) ─────────────────────────────────

def _analyse_offers(offers_data: dict, card_bin: str, card_type: str, amount_paise: int) -> list:
    """Parse Pine Labs offer-discovery response and check eligibility."""
    results = []
    issuers = offers_data.get("issuers", [])

    for issuer in issuers:
        bank_name = issuer.get("name", "Unknown")
        card_bins = issuer.get("card_bins", [])
        card_types = issuer.get("card_types", [])

        # Check card eligibility
        bin_match = card_bin in card_bins or not card_bins  # empty = all bins
        type_match = card_type in card_types or not card_types

        for tenure in issuer.get("tenures", []):
            tenure_value = tenure.get("tenure_value", 0)
            if tenure_value > 0:
                continue  # Skip EMI tenures — handled in _analyse_emi

            for detail in tenure.get("details", []):
                discount = detail.get("discount", {})
                discount_type = discount.get("discount_type", "NONE")
                pct = discount.get("percentage", 0)
                flat_paise = discount.get("amount", {}).get("value", 0)

                if pct == 0 and flat_paise == 0:
                    continue  # No discount

                # Calculate actual discount
                pct_discount = int(amount_paise * pct / 100)
                actual_discount = min(pct_discount, flat_paise) if flat_paise > 0 else pct_discount

                eligible = bin_match and type_match
                offer_params = tenure.get("issuer_offer_parameters", [{}])[0]

                results.append({
                    "bank": bank_name,
                    "offer_name": tenure.get("name", ""),
                    "offer_id": offer_params.get("offer_id", ""),
                    "tenure_id": tenure.get("tenure_id", ""),
                    "program_type": offer_params.get("program_type", ""),
                    "discount_type": discount_type,
                    "discount_pct": pct,
                    "discount_cap_paise": flat_paise,
                    "discount_paise": actual_discount if eligible else 0,
                    "eligible": eligible,
                    "reason": (
                        f"{bank_name} {pct}% {discount_type.lower()} (max ₹{flat_paise/100:.0f})"
                        if eligible else
                        f"Not eligible — card BIN {card_bin} not in {bank_name} bins"
                    ),
                })

    return results


# ── EMI Analysis (replaces emi_agent) ─────────────────────────────────────────

def _analyse_emi(offers_data: dict, amount_paise: int) -> list:
    """Extract and evaluate EMI tenures."""
    if amount_paise < 300000:  # Skip EMI for orders < Rs.3000
        return []

    results = []
    for issuer in offers_data.get("issuers", []):
        bank_name = issuer.get("name", "Unknown")
        for tenure in issuer.get("tenures", []):
            months = tenure.get("tenure_value", 0)
            if months <= 0:
                continue  # Not an EMI tenure

            for detail in tenure.get("details", []):
                interest = detail.get("interest_rate", 0)
                monthly = detail.get("monthly_emi_amount", {}).get("value", 0)
                total = detail.get("total_emi_amount", {}).get("value", 0)
                no_cost = interest == 0

                if monthly == 0:
                    # Calculate from amount + interest
                    if no_cost:
                        monthly = amount_paise // months
                        total = amount_paise
                    else:
                        r = interest / 12 / 100
                        monthly = int(amount_paise * r * (1 + r)**months / ((1 + r)**months - 1))
                        total = monthly * months

                offer_params = tenure.get("issuer_offer_parameters", [{}])[0]
                extra_cost = total - amount_paise

                results.append({
                    "bank": bank_name,
                    "offer_id": offer_params.get("offer_id", ""),
                    "tenure_id": tenure.get("tenure_id", ""),
                    "tenure_months": months,
                    "interest_rate": interest,
                    "monthly_paise": monthly,
                    "total_emi_paise": total,
                    "extra_cost_paise": extra_cost,
                    "no_cost": no_cost,
                    "reason": (
                        f"{bank_name} {months}mo No-Cost EMI @ ₹{monthly/100:.0f}/mo"
                        if no_cost else
                        f"{bank_name} {months}mo EMI @ {interest}% = ₹{monthly/100:.0f}/mo (extra ₹{extra_cost/100:.0f})"
                    ),
                })

    results.sort(key=lambda x: x["extra_cost_paise"])
    return results


# ── Wallet Optimisation (replaces wallet_agent) ──────────────────────────────

def _analyse_wallet(wallet_balances: dict, amount_paise: int, offers: list) -> dict:
    """Determine if using wallet creates a better split."""
    if not wallet_balances:
        return {"use_wallet": False, "reason": "No wallet balances provided"}

    best_wallet = None
    best_saving_boost = 0

    for wallet_code, balance_paise in wallet_balances.items():
        if balance_paise <= 0:
            continue

        usable = min(balance_paise, amount_paise)
        card_remainder = amount_paise - usable

        # Check if wallet split changes offer eligibility (future enhancement)
        # For now, just suggest using biggest wallet to reduce card exposure
        if usable > best_saving_boost:
            best_saving_boost = usable
            best_wallet = {
                "use_wallet": True,
                "wallet_code": wallet_code,
                "wallet_amount_paise": usable,
                "card_amount_paise": card_remainder,
                "reason": f"Use ₹{usable/100:.0f} from {wallet_code}, card pays ₹{card_remainder/100:.0f}",
            }

    return best_wallet or {"use_wallet": False, "reason": "Wallet balances too low to be useful"}
