"""
Layer 1 — Smart Checkout Agent Pipeline with Status Tracking
Execution:
  Wave 1 (PARALLEL): card_agent, offer_agent, emi_agent, wallet_agent
  Wave 2 (SEQUENTIAL): conflict_resolver (reads Wave 1 outputs)
  Wave 3 (SEQUENTIAL): decision_agent (reads Wave 2 output)

Status updates sent to WebSocket for UI progress display.
"""

from crewai import Agent, Task, Crew, Process
from backend.integrations.bedrock import get_llm
from backend.integrations.pine_labs import pine_labs
from backend.models.checkout import PaymentRecommendation
import json, logging, asyncio
from typing import Callable

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
    status_callback: Callable = None,  # fn(agent_name, status) to send progress to UI
) -> dict:
    """
    Main entry point for Layer 1 with parallel execution + status tracking.
    Wave 1: card, offer, emi, wallet agents run in parallel (independent tasks)
    Wave 2: conflict resolver (depends on Wave 1)
    Wave 3: decision agent (depends on Wave 2)
    
    status_callback: async fn(agent_name: str, status: str) to notify UI
                     e.g., await status_callback("card_agent", "running")
    """
    logger.info(f"[Layer1] Starting pipeline for session={session_id}")

    if not status_callback:
        status_callback = lambda name, status: None

    # Fetch live offers from Pine Labs
    try:
        if use_mock:
            offers_data = await pine_labs.discover_offers_mock(card_bin, amount_paise)
        else:
            offers_data = await pine_labs.discover_offers(order_id, card_bin, card_type, amount_paise)
    except Exception as e:
        logger.warning(f"Pine Labs offer-discovery failed ({e}), using mock")
        offers_data = await pine_labs.discover_offers_mock(card_bin, amount_paise)

    # Trim offers to top 3 issuers
    try:
        issuers = offers_data.get("issuers", [])[:2]  # reduced from 3 to 2
        for issuer in issuers:
            if "tenures" in issuer:
                issuer["tenures"] = issuer["tenures"][:2]  # reduced from 3 to 2
        trimmed_offers = {"issuers": issuers}
    except Exception:
        trimmed_offers = offers_data

    context = json.dumps({
        "session_id": session_id,
        "amount_paise": amount_paise,
        "amount_rupees": amount_paise / 100,
        "card_bin": card_bin,
        "card_type": card_type,
        "wallet_balances": wallet_balances,
        "pine_labs_offers": trimmed_offers,
    }, separators=(',', ':'))

    llm = get_llm()

    # ════════════════════════════════════════════════════════════════════════
    # WAVE 1: Run 4 independent agents in parallel
    # ════════════════════════════════════════════════════════════════════════
    
    async def run_agent_task(agent_name: str, task_desc: str, expected_output: str, agent: Agent) -> dict:
        """Run single agent task and track status."""
        await status_callback(agent_name, "running")
        try:
            crew = Crew(
                agents=[agent],
                tasks=[Task(description=task_desc, expected_output=expected_output, agent=agent)],
                process=Process.sequential,
                verbose=False,
            )
            result = await asyncio.to_thread(crew.kickoff)
            await status_callback(agent_name, "completed")
            return {"status": "ok", "output": str(result)}
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            logger.error(f"[Layer1] {agent_name} failed with trace:\n{error_trace}")
            await status_callback(agent_name, "failed", error=str(e), trace=error_trace)
            return {"status": "error", "error": str(e), "trace": error_trace}

    # Dispatch all 4 tasks in parallel
    card_task_def = run_agent_task(
        "card_agent",
        f"Analyse card ({card_bin}, {card_type}) for Rs.{amount_paise/100} transaction.\n\nDATA:\n{context}",
        "JSON: {recommended_card, bank, estimated_reward_paise, reason}",
        _make_card_agent(llm)
    )
    offer_task_def = run_agent_task(
        "offer_agent",
        f"Find all valid, eligible offers from Pine Labs data.\n\nDATA:\n{context}",
        "JSON array: [{offer_id, tenure_id, bank, discount_paise, eligible: true}]",
        _make_offer_agent(llm)
    )
    emi_task_def = run_agent_task(
        "emi_agent",
        f"Calculate EMI vs upfront for Rs.{amount_paise/100}.\n\nDATA:\n{context}",
        "JSON: {best_emi, recommendation: 'emi'|'upfront', reason}",
        _make_emi_agent(llm)
    )
    wallet_task_def = run_agent_task(
        "wallet_agent",
        f"Determine optimal wallet usage for Rs.{amount_paise/100}.\n\nDATA:\n{context}",
        "JSON: {use_wallet, wallet_code, wallet_amount_paise, card_amount_paise}",
        _make_wallet_agent(llm)
    )

    # Wait for all 4 to complete
    card_result, offer_result, emi_result, wallet_result = await asyncio.gather(
        card_task_def, offer_task_def, emi_task_def, wallet_task_def
    )

    # Check Wave 1 for failures
    wave1_failures = []
    if card_result.get("status") == "error":
        wave1_failures.append({"agent": "card_agent", "error": card_result.get("error"), "trace": card_result.get("trace")})
    if offer_result.get("status") == "error":
        wave1_failures.append({"agent": "offer_agent", "error": offer_result.get("error"), "trace": offer_result.get("trace")})
    if emi_result.get("status") == "error":
        wave1_failures.append({"agent": "emi_agent", "error": emi_result.get("error"), "trace": emi_result.get("trace")})
    if wallet_result.get("status") == "error":
        wave1_failures.append({"agent": "wallet_agent", "error": wallet_result.get("error"), "trace": wallet_result.get("trace")})

    if wave1_failures:
        logger.error(f"[Layer1] Wave 1 had {len(wave1_failures)} failure(s): {json.dumps(wave1_failures, indent=2)}")
        return {
            "recommended_method": "FALLBACK",
            "offer_id": None,
            "tenure_id": None,
            "net_saving_paise": 0,
            "effective_amount_paise": amount_paise,
            "reason_trail": ["One or more analysis agents failed. Please try again."],
            "failures": wave1_failures,
            "alternatives": [],
        }

    # Combine Wave 1 outputs into context for Wave 2
    wave1_context = json.dumps({
        "card_analysis": card_result.get("output", ""),
        "offer_analysis": offer_result.get("output", ""),
        "emi_analysis": emi_result.get("output", ""),
        "wallet_analysis": wallet_result.get("output", ""),
    }, separators=(',', ':'))

    # ════════════════════════════════════════════════════════════════════════
    # WAVE 2: Conflict resolver (sequential, reads Wave 1)
    # ════════════════════════════════════════════════════════════════════════

    await status_callback("conflict_resolver", "running")
    conflict_failed = False
    try:
        conflict_crew = Crew(
            agents=[_make_conflict_agent(llm)],
            tasks=[Task(
                description=f"Resolve offer conflicts. Inputs from Wave 1:\n{wave1_context}\n\nOriginal context:\n{context}",
                expected_output="JSON array: [{method, offer_id, tenure_id, net_saving_paise}]",
                agent=_make_conflict_agent(llm)
            )],
            process=Process.sequential,
            verbose=False,
        )
        conflict_result = await asyncio.to_thread(conflict_crew.kickoff)
        await status_callback("conflict_resolver", "completed")
        conflict_output = str(conflict_result)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"[Layer1] conflict_resolver failed:\n{error_trace}")
        await status_callback("conflict_resolver", "failed", error=str(e), trace=error_trace)
        conflict_failed = True
        conflict_output = ""

    if conflict_failed:
        return {
            "recommended_method": "FALLBACK",
            "offer_id": None,
            "tenure_id": None,
            "net_saving_paise": 0,
            "effective_amount_paise": amount_paise,
            "reason_trail": ["Conflict resolution failed. Please try again."],
            "failures": [{"agent": "conflict_resolver", "error": "Wave 2 conflict resolution failed"}],
            "alternatives": [],
        }

    # Parse result — CrewAI >=0.63 returns CrewOutput object; use .raw for the text
    import re
    try:
        raw = result.raw if hasattr(result, 'raw') else str(result)
        logger.info(f"[Layer1] Raw crew output (first 500 chars): {raw[:500]}")
        # Strip thinking block (<think>...</think>) — qwen3 thinking mode
        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
        raw = re.sub(r'```(?:json)?\s*|\s*```', '', raw).strip()
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            parsed = json.loads(match.group())
            logger.info(f"[Layer1] Pipeline parsed OK — method={parsed.get('recommended_method')} saving={parsed.get('net_saving_paise')}")
            return parsed
        else:
            logger.warning(f"[Layer1] No JSON object found in output. Full raw: {raw[:1000]}")
    except Exception as parse_err:
        logger.warning(f"[Layer1] JSON parse error: {parse_err}. Raw: {raw[:500]}")

    # Fallback
    return {
        "recommended_method": "CARD",
        "offer_id": None,
        "tenure_id": None,
        "net_saving_paise": 0,
        "effective_amount_paise": amount_paise,
        "reason_trail": ["Agent pipeline completed with partial results."],
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
