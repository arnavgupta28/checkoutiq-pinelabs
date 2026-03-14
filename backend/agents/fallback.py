"""
Fallback Logic — Hardcoded recommendations when LLM is unavailable or too slow.
═════════════════════════════════════════════════════════════════════════════════
Used when:
  1. LLM fails / times out / context overflow
  2. LM Studio not running
  3. All agents fail in Wave 1

Strategy:
  - Use InsightEngine's pre-computed ranked_options (no LLM needed)
  - Enrich with offer_popularity stats from JSON DB (most-chosen by other users)
  - Generate deterministic reason_trail from computed data
"""

import logging
from backend.agents.insights_db import get_popular_offers

logger = logging.getLogger(__name__)


async def build_fallback_recommendation(
    insight_bundle: dict,
    amount_paise: int,
) -> dict:
    """
    Build recommendation purely from InsightEngine output + popularity data.
    No LLM required. Returns same schema as agent pipeline.
    """
    best = insight_bundle.get("best_option")
    ranked = insight_bundle.get("ranked_options", [])
    card = insight_bundle.get("card", {})
    wallet = insight_bundle.get("wallet", {})

    # Enrich with popularity stats
    popular = await get_popular_offers(3)
    popular_ids = {p["offer_id"] for p in popular}

    if best and best.get("eligible"):
        reason_trail = _build_reason_trail(best, card, wallet, popular_ids)
        return {
            "recommended_method": best.get("method", "CARD"),
            "offer_id": best.get("offer_id"),
            "tenure_id": best.get("tenure_id"),
            "net_saving_paise": best.get("net_saving_paise", 0),
            "effective_amount_paise": best.get("effective_amount_paise", amount_paise),
            "reason_trail": reason_trail,
            "alternatives": [
                {
                    "method": opt.get("method", "CARD"),
                    "offer_id": opt.get("offer_id"),
                    "tenure_id": opt.get("tenure_id"),
                    "net_saving_paise": opt.get("net_saving_paise", 0),
                    "reason": opt.get("reason", ""),
                }
                for opt in ranked[1:3]
                if opt.get("eligible")
            ],
            "source": "fallback_insight_engine",
            "popularity_boost": bool(best.get("offer_id") in popular_ids),
        }

    # No eligible offers found — plain card payment
    return {
        "recommended_method": "CARD",
        "offer_id": None,
        "tenure_id": None,
        "net_saving_paise": card.get("estimated_reward_paise", 0),
        "effective_amount_paise": amount_paise,
        "reason_trail": [
            f"Pay with {card.get('bank', 'your')} {card.get('tier', '')} {card.get('network', '')} card",
            f"Estimated reward: ₹{card.get('estimated_reward_paise', 0)/100:.0f} ({card.get('base_reward_pct', 0)}% base rewards)",
            "No special offers available for this card/amount combination",
        ],
        "alternatives": [],
        "source": "fallback_no_offers",
    }


def _build_reason_trail(best: dict, card: dict, wallet: dict, popular_ids: set) -> list:
    """Generate human-readable reason_trail from computed insight data."""
    trail = []

    # Main recommendation
    if best["type"] == "EMI":
        trail.append(
            f"✅ {best['bank']} {best.get('tenure_months', 0)}-month "
            f"{'No-Cost ' if best.get('no_cost') else ''}EMI at "
            f"₹{best.get('monthly_paise', 0)/100:.0f}/month"
        )
        if best.get("no_cost"):
            trail.append("💰 Zero interest — total cost equals cart value")
        else:
            trail.append(f"📊 Interest rate: {best.get('interest_rate', 0)}% p.a.")
    else:
        trail.append(
            f"✅ {best['bank']} {best.get('type', 'discount').replace('_', ' ').title()} — "
            f"save ₹{best['net_saving_paise']/100:.0f}"
        )
        trail.append(f"💰 {best.get('reason', '')}")

    # Card info
    trail.append(
        f"💳 Using {card.get('bank', '')} {card.get('tier', '')} {card.get('network', '')} — "
        f"base rewards {card.get('base_reward_pct', 0)}%"
    )

    # Wallet info
    if wallet.get("use_wallet"):
        trail.append(
            f"👛 Split: ₹{wallet['wallet_amount_paise']/100:.0f} from {wallet['wallet_code']}, "
            f"₹{wallet['card_amount_paise']/100:.0f} on card"
        )

    # Popularity signal
    if best.get("offer_id") in popular_ids:
        trail.append("🔥 Most popular offer — chosen by majority of users")

    return trail
