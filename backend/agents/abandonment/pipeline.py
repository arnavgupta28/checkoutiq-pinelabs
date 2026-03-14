"""
Layer 2 — Abandonment Recovery Agent Pipeline
Triggered by: Pine Labs webhooks (PAYMENT_FAILED, ORDER_CANCELLED, ORDER_FAILED)
              OR manual trigger from merchant dashboard
Input:  order data + behavioral signals (time_on_page, methods_hovered, cart_value_vs_offer_gap)
Output: RecoveryNudge with personalised re-engagement strategy + Pine Labs pay-by-link

Agent execution:
  diagnosis_agent → identifies WHY user dropped off
       ↓
  recovery_crafter → generates personalised nudge strategy
       ↓
  pine_labs.create_recovery_link() → creates pre-configured payment link
"""

from crewai import Agent, Task, Crew, Process
from backend.integrations.bedrock import get_llm
from backend.integrations.pine_labs import pine_labs
import json, logging, asyncio

logger = logging.getLogger(__name__)

ABANDONMENT_CAUSES = ["price_sensitivity", "payment_friction", "offer_confusion",
                       "emi_complexity", "trust_concern", "technical_error"]


async def run_recovery_pipeline(
    session_id: str,
    order_id: str,
    amount_paise: int,
    customer: dict,
    behavioral_signals: dict,
    failed_payment_method: str = "",
    error_code: str = "",
    use_mock: bool = False,
) -> dict:
    """
    behavioral_signals example:
    {
      "time_on_payment_screen_sec": 145,
      "methods_hovered": ["CARD", "UPI"],
      "scrolled_to_emi": True,
      "cart_value_vs_offer_gap_paise": 500,   # how much short of an offer threshold
      "retry_attempts": 2,
      "last_action": "clicked_card_then_exited",
    }
    """
    logger.info(f"[Layer2] Recovery pipeline for session={session_id} order={order_id}")

    context = json.dumps({
        "session_id": session_id,
        "amount_paise": amount_paise,
        "amount_rupees": amount_paise / 100,
        "customer_name": f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip(),
        "behavioral_signals": behavioral_signals,
        "failed_payment_method": failed_payment_method,
        "pine_error_code": error_code,
        "possible_causes": ABANDONMENT_CAUSES,
    }, separators=(',', ':'))

    llm = get_llm()

    # ── Agent 1: Diagnosis ────────────────────────────────────────────────────
    diagnosis_task = Task(
        description=f"""
Analyse the abandonment signals and determine the PRIMARY reason this user dropped off at checkout.

Signals to interpret:
- time_on_payment_screen: >120s usually = confusion or hesitation
- methods_hovered: indicates which method they considered but rejected
- scrolled_to_emi: True = price sensitivity (user was looking for a way to reduce upfront)
- cart_value_vs_offer_gap_paise: if > 0, they may have been so close to an offer threshold they gave up
- retry_attempts: > 1 = payment friction (card declined / OTP issues)
- pine_error_code: USER_AUTHENTICATION_FAILED = OTP friction, PAYMENT_DECLINED = card issue, PAYMENT_EXPIRED = timeout

DATA:
{context}

Output one of: {ABANDONMENT_CAUSES}
Plus: confidence_score (0-1), supporting_evidence (list), secondary_cause (optional)
""",
        expected_output='JSON: {{"primary_cause": "...", "confidence": 0.85, "evidence": ["..."], "secondary_cause": "..."}}',
        agent=Agent(
            role="Checkout Abandonment Diagnosis Expert",
            goal="Determine the primary reason a user abandoned checkout from behavioral signals.",
            backstory=(
                "Behavioural analyst specialising in Indian e-commerce checkout patterns. "
                "You know that 145 seconds on payment screen + scrolled to EMI = price sensitivity. "
                "retry_attempts > 1 + USER_AUTHENTICATION_FAILED = OTP friction. "
                "methods_hovered includes UPI but final action was exit = UPI confusion or collect timeout. "
                "You NEVER guess — you cite specific signals."
            ),
            llm=llm, verbose=True,
        ),
    )

    # ── Agent 2: Recovery Crafter ─────────────────────────────────────────────
    recovery_task = Task(
        description=f"""
Given the diagnosis, craft a personalised recovery strategy for this specific user.

Rules:
- price_sensitivity → offer an EMI breakdown OR a targeted discount if merchant allows
- payment_friction  → suggest simpler method (UPI Intent instead of collect, saved card)
- offer_confusion   → explain the best available offer clearly, pre-apply it
- emi_complexity    → show simple Rs.X/month breakdown, remove tenure complexity
- trust_concern     → lead with security trust signals, offer COD if available
- technical_error   → apologise, offer fresh checkout link with method pre-selected

Your output is a nudge_message (push notification copy, ≤160 chars) AND a recovery_link_description
that will be used to create a Pine Labs Pay-By-Link with the right setup.

Also specify: discount_paise (0 if none), suggested_payment_method for the link.

DATA FROM DIAGNOSIS:
{{diagnosis_output}}

ORIGINAL CONTEXT:
{context}
""",
        expected_output='JSON: {{"nudge_message": "Hey Rahul! Your cart is waiting. Pay ₹499/mo with HDFC EMI — takes 2 mins ✓", "recovery_link_description": "...", "discount_paise": 0, "suggested_method": "CREDIT_EMI", "personalisation_notes": "..."}}',
        agent=Agent(
            role="Recovery Strategy Crafter",
            goal="Generate a contextually personalised re-engagement nudge — not a generic 'you left your cart' message.",
            backstory=(
                "Growth hacker + copywriter specialising in Indian payment recovery. "
                "You know that 'Your cart is waiting' converts at 3%. "
                "'Hey Priya! HDFC gives you 10% off your ₹2400 order — ₹240 back!' converts at 23%. "
                "You tailor every message to the specific friction point diagnosed."
            ),
            llm=llm, verbose=True,
        ),
        context=[diagnosis_task],
    )

    crew = Crew(
        agents=[],
        tasks=[diagnosis_task, recovery_task],
        process=Process.sequential,
        verbose=True,
    )

    # Run synchronous crew.kickoff() in a thread pool — keeps event loop unblocked
    # and ensures CrewAI's verbose stdout output flushes to the uvicorn terminal
    try:
        crew_result = await asyncio.to_thread(crew.kickoff)
    except Exception as kickoff_err:
        logger.error(f"[Layer2] crew.kickoff() failed: {kickoff_err}")
        crew_result = ""

    # Parse recovery output
    # qwen3 wraps output in <think>...</think> before the actual answer
    try:
        import re
        raw = str(crew_result)
        # Strip thinking block if present
        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
        # Strip markdown code fences
        raw = re.sub(r'```(?:json)?\s*|\s*```', '', raw).strip()
        # Find outermost JSON object
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        recovery_data = json.loads(match.group()) if match else {}
    except Exception as parse_err:
        logger.warning(f"[Layer2] JSON parse error: {parse_err}")
        recovery_data = {}

    nudge_msg = recovery_data.get("nudge_message", f"Complete your Rs.{amount_paise//100} order — quick checkout waiting!")
    link_desc = recovery_data.get("recovery_link_description", f"CheckoutIQ recovery — Rs.{amount_paise//100}")
    discount = recovery_data.get("discount_paise", 0)

    # Create Pine Labs pay-by-link
    final_amount = amount_paise - discount
    try:
        if use_mock:
            pay_link = {"payment_link_id": f"mock-link-{session_id}", "short_url": f"https://pay.pine/mock/{session_id}"}
        else:
            pay_link = await pine_labs.create_recovery_link(
                amount_paise=final_amount,
                customer=customer,
                description=link_desc,
                expiry_hours=24,
            )
    except Exception as e:
        logger.error(f"Pay-by-link creation failed: {e}")
        pay_link = {"payment_link_id": None, "short_url": None, "error": str(e)}

    return {
        "session_id": session_id,
        "order_id": order_id,
        "primary_cause": recovery_data.get("primary_cause", "unknown"),
        "confidence": recovery_data.get("confidence", 0),
        "nudge_message": nudge_msg,
        "discount_applied_paise": discount,
        "final_amount_paise": final_amount,
        "recovery_link": pay_link.get("short_url"),
        "payment_link_id": pay_link.get("payment_link_id"),
        "suggested_method": recovery_data.get("suggested_method", ""),
        "personalisation_notes": recovery_data.get("personalisation_notes", ""),
        "diagnosis_evidence": recovery_data.get("evidence", []),
    }
