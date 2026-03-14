"""
Layer 1 — Smart Checkout Agent Pipeline
Triggered: when user reaches payment screen (POST /checkout/smart-apply)
Input:     Pine Labs offer-discovery response + user's card/wallet data
Output:    Single PaymentRecommendation with reason_trail

Agent execution order:
  [card_agent + offer_agent + emi_agent + wallet_agent]  ← run in parallel (CrewAI parallel tasks)
                         ↓
                 conflict_resolver                        ← sequential
                         ↓
                  decision_agent                          ← sequential → final output
"""

from crewai import Agent, Task, Crew, Process
from backend.integrations.bedrock import get_llm
from backend.integrations.pine_labs import pine_labs
from backend.models.checkout import PaymentRecommendation
import json, logging

logger = logging.getLogger(__name__)


def build_crew() -> Crew:
    llm = get_llm()

    # ── 1. Card Selection Agent ───────────────────────────────────────────────
    card_agent = Agent(
        role="Card Selection Specialist",
        goal=(
            "Identify the single best card from the user's wallet for this transaction. "
            "Consider cashback rates, reward points, card-specific offer eligibility, and "
            "network benefits (Visa/Mastercard/Rupay). Output the recommended card with "
            "justification and estimated reward value in paise."
        ),
        backstory=(
            "You are a fintech expert with deep knowledge of Indian credit and debit card "
            "reward structures. You know that HDFC Millennia gives 5% cashback on Amazon, "
            "Axis Flipkart gives 5% on Flipkart, and SBI SimplyCLICK gives 10x rewards on "
            "partner sites. You always recommend the card that maximises net benefit for the "
            "specific cart and merchant combination."
        ),
        llm=llm,
        verbose=True,
    )

    # ── 2. Offer Eligibility Agent ────────────────────────────────────────────
    offer_agent = Agent(
        role="Offer Eligibility Analyst",
        goal=(
            "Parse ALL active offers from the Pine Labs offer-discovery API response. "
            "For each offer check: is the user's card eligible? Is minimum order value met? "
            "Is the offer still within expiry? Output a ranked list of valid offers with "
            "their exact discount amounts in paise."
        ),
        backstory=(
            "You specialize in Indian bank and merchant offer terms. You know that HDFC "
            "10% off has a max cap of Rs.1500, SBI offers require minimum Rs.2000, and "
            "many offers cannot be stacked with other bank offers. You read offer "
            "parameters precisely from API responses and never assume eligibility."
        ),
        llm=llm,
        verbose=True,
    )

    # ── 3. EMI Analysis Agent ─────────────────────────────────────────────────
    emi_agent = Agent(
        role="EMI Cost-Benefit Analyst",
        goal=(
            "For orders above Rs.3000, calculate the effective cost of each available EMI "
            "tenure from the Pine Labs offer-discovery response. Compare: "
            "(upfront amount - cashback) vs (total EMI cost). "
            "Factor in no-cost EMI (0% interest) vs standard EMI. "
            "Output the best EMI option if it saves money, or recommend upfront if it doesn't."
        ),
        backstory=(
            "You are a financial analyst who calculates the true cost of EMI for Indian "
            "consumers. You know that 'no-cost EMI' is often subsidised by the brand "
            "reducing the MRP, and standard EMI at 15% p.a. on Rs.10000 over 6 months "
            "actually costs Rs.469 extra. You do the math precisely from API data."
        ),
        llm=llm,
        verbose=True,
    )

    # ── 4. Wallet Optimisation Agent ──────────────────────────────────────────
    wallet_agent = Agent(
        role="Wallet & Split Payment Optimiser",
        goal=(
            "Given the user's wallet balances (PhonePe, Paytm, Amazon Pay etc.), determine "
            "if partial wallet payment reduces the card charge enough to unlock a lower "
            "card offer tier. Calculate the optimal split: wallet_amount + card_amount = total. "
            "Only recommend a split if it results in a net saving."
        ),
        backstory=(
            "You understand that Indian consumers often have small wallet balances (Rs.50-500) "
            "that can be tactically used to push the remaining card amount below an offer "
            "threshold. For example, using Rs.200 Paytm to bring card amount from Rs.2100 "
            "to Rs.1900 might unlock a HDFC offer that requires minimum Rs.1500 card payment."
        ),
        llm=llm,
        verbose=True,
    )

    # ── 5. Conflict Resolver ──────────────────────────────────────────────────
    conflict_resolver = Agent(
        role="Payment Offer Conflict Resolver",
        goal=(
            "Review the outputs of card_agent, offer_agent, emi_agent, and wallet_agent. "
            "Identify mutually exclusive offer combinations. An offer from HDFC and an offer "
            "from SBI cannot both apply. No-cost EMI and instant cashback often can't stack. "
            "Resolve conflicts by ranking all valid combinations and selecting the top 3 "
            "non-conflicting configurations by net saving."
        ),
        backstory=(
            "You've seen every edge case in Indian payment offer stacking. You know Pine Labs "
            "offer_parameter_id rules, that BRAND_EMI and BRAND_OFFER can sometimes stack but "
            "two BANK_OFFER entries from different banks never can. You reason carefully before "
            "declaring conflict vs compatibility."
        ),
        llm=llm,
        verbose=True,
    )

    # ── 6. Decision Agent ─────────────────────────────────────────────────────
    decision_agent = Agent(
        role="Final Payment Decision Synthesiser",
        goal=(
            "Take the top 3 conflict-free payment configurations from the Conflict Resolver. "
            "Select the single best one based on maximum net saving for the user. "
            "Output a structured JSON with: recommended_method, offer_id, tenure_id, "
            "net_saving_paise, effective_amount_paise, and a reason_trail list of "
            "3-5 human-readable bullet points explaining exactly what was chosen and why. "
            "This is what the user sees as the Smart Apply recommendation."
        ),
        backstory=(
            "You synthesise complex financial reasoning into clear, trustworthy explanations. "
            "You know that users need to understand WHY a payment method was chosen — "
            "not just what. Your reason_trail is the key differentiator of CheckoutIQ: "
            "it shows the user exactly what offer was applied and how much they saved."
        ),
        llm=llm,
        verbose=True,
    )

    return Crew(
        agents=[card_agent, offer_agent, emi_agent, wallet_agent, conflict_resolver, decision_agent],
        tasks=[],   # tasks are built per-session in run_pipeline()
        process=Process.sequential,
        verbose=True,
    )


async def run_pipeline(
    session_id: str,
    order_id: str,
    amount_paise: int,
    card_bin: str,
    card_type: str,
    wallet_balances: dict,
    use_mock: bool = False,
) -> dict:
    """
    Main entry point for Layer 1.
    1. Calls Pine Labs offer-discovery to get live offers
    2. Passes data to CrewAI pipeline
    3. Returns structured recommendation dict
    """
    logger.info(f"[Layer1] Starting pipeline for session={session_id}")

    # Step 1: fetch live offers from Pine Labs
    try:
        if use_mock:
            offers_data = await pine_labs.discover_offers_mock(card_bin, amount_paise)
        else:
            offers_data = await pine_labs.discover_offers(order_id, card_bin, card_type, amount_paise)
    except Exception as e:
        logger.warning(f"Pine Labs offer-discovery failed ({e}), using mock")
        offers_data = await pine_labs.discover_offers_mock(card_bin, amount_paise)

    context = json.dumps({
        "session_id": session_id,
        "order_id": order_id,
        "amount_paise": amount_paise,
        "amount_rupees": amount_paise / 100,
        "card_bin": card_bin,
        "card_type": card_type,
        "wallet_balances": wallet_balances,
        "pine_labs_offers": offers_data,
    }, indent=2)

    llm = get_llm()

    # Build tasks inline (per-session context)
    card_task = Task(
        description=f"Analyse user's card ({card_bin}, {card_type}) against this data and identify the best card for this Rs.{amount_paise/100} transaction.\n\nDATA:\n{context}",
        expected_output="JSON: {recommended_card, bank, estimated_reward_paise, reason}",
        agent=_make_card_agent(llm),
    )
    offer_task = Task(
        description=f"Find all valid, eligible offers for this session from the Pine Labs offer data.\n\nDATA:\n{context}",
        expected_output="JSON array of valid_offers: [{offer_id, tenure_id, bank, discount_paise, discount_percent, eligible: true}]",
        agent=_make_offer_agent(llm),
    )
    emi_task = Task(
        description=f"Calculate EMI vs upfront cost comparison for this Rs.{amount_paise/100} order.\n\nDATA:\n{context}",
        expected_output="JSON: {best_emi: {tenure_months, monthly_paise, total_paise, interest_paise, net_saving_vs_upfront_paise}, recommendation: 'emi'|'upfront', reason}",
        agent=_make_emi_agent(llm),
    )
    wallet_task = Task(
        description=f"Determine optimal wallet usage given these balances: {wallet_balances}. Cart total: Rs.{amount_paise/100}.\n\nDATA:\n{context}",
        expected_output="JSON: {use_wallet: bool, wallet_code: str, wallet_amount_paise: int, card_amount_paise: int, saving_rationale: str}",
        agent=_make_wallet_agent(llm),
    )
    conflict_task = Task(
        description="Review outputs of previous agents. Identify and resolve offer conflicts. Output top 3 non-conflicting payment configurations ranked by net saving.",
        expected_output="JSON array top_configs: [{method, offer_id, tenure_id, wallet_split, net_saving_paise, conflict_notes}]",
        agent=_make_conflict_agent(llm),
        context=[card_task, offer_task, emi_task, wallet_task],
    )
    decision_task = Task(
        description="Select the single best payment configuration. Output as structured recommendation with reason_trail.",
        expected_output='JSON: {"recommended_method":"CARD"|"CREDIT_EMI", "offer_id":"...", "tenure_id":"...", "net_saving_paise":500, "effective_amount_paise":9500, "reason_trail":["Applied HDFC 10% instant discount...","..."], "alternatives":[...]}',
        agent=_make_decision_agent(llm),
        context=[conflict_task],
    )

    crew = Crew(
        agents=[],
        tasks=[card_task, offer_task, emi_task, wallet_task, conflict_task, decision_task],
        process=Process.sequential,
        verbose=True,
    )

    result = crew.kickoff()

    # Parse result — CrewAI returns string, we expect JSON from decision_task
    try:
        raw = str(result)
        # Find JSON block in output
        import re
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception:
        pass

    # Fallback if parsing fails
    return {
        "recommended_method": "CARD",
        "offer_id": None,
        "tenure_id": None,
        "net_saving_paise": 0,
        "effective_amount_paise": amount_paise,
        "reason_trail": ["Could not fully analyse offers — showing best available option."],
        "alternatives": [],
    }


# ── Agent factory helpers (avoid pickling issues with Crew) ──────────────────

def _make_card_agent(llm):
    return Agent(role="Card Selection Specialist",
        goal="Identify the optimal card for this transaction maximising cashback and rewards.",
        backstory="Expert in Indian credit/debit card reward structures across HDFC, SBI, Axis, ICICI, Kotak.",
        llm=llm, verbose=False)

def _make_offer_agent(llm):
    return Agent(role="Offer Eligibility Analyst",
        goal="Parse all active offers, check user eligibility, expiry, min order constraints.",
        backstory="Knows every bank and merchant offer condition — min amounts, card restrictions, stacking rules.",
        llm=llm, verbose=False)

def _make_emi_agent(llm):
    return Agent(role="EMI Cost-Benefit Analyst",
        goal="Calculate effective EMI cost vs upfront payment factoring in cashback and interest.",
        backstory="Financial analyst specialising in Indian consumer EMI products — credit EMI, debit EMI, BNPL.",
        llm=llm, verbose=False)

def _make_wallet_agent(llm):
    return Agent(role="Wallet Optimisation Specialist",
        goal="Determine optimal partial wallet split to maximise offer eligibility.",
        backstory="Expert in multi-instrument payment optimisation for Indian consumers.",
        llm=llm, verbose=False)

def _make_conflict_agent(llm):
    return Agent(role="Offer Conflict Resolver",
        goal="Resolve mutually exclusive offers and rank top non-conflicting configurations.",
        backstory="Deep knowledge of Pine Labs offer stacking rules and bank offer exclusivity constraints.",
        llm=llm, verbose=False)

def _make_decision_agent(llm):
    return Agent(role="Final Decision Synthesiser",
        goal="Produce one ranked recommendation with a transparent reason trail the user can trust.",
        backstory="Translates complex financial reasoning into clear, explainable payment recommendations.",
        llm=llm, verbose=False)
