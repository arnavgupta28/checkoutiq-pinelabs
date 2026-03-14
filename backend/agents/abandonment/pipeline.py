"""
Layer 2 — Abandonment Recovery Agent Pipeline with Status Tracking
Execution (SEQUENTIAL):
  1. diagnosis_agent → identifies WHY user dropped off
  2. recovery_crafter → generates personalised nudge strategy (reads diagnosis)

Status updates sent to WebSocket for UI progress display.
"""

from crewai import Agent, Task, Crew, Process
from backend.integrations.bedrock import get_llm
from backend.integrations.pine_labs import pine_labs
import json, logging, asyncio
from typing import Callable

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
    status_callback: Callable = None,  # fn(agent_name, status, error, trace) to send progress to UI
) -> dict:
    """
    Layer 2 with sequential execution + status tracking.
    1. diagnosis_agent runs first → outputs primary_cause
    2. recovery_crafter reads diagnosis output → generates nudge + link
    
    status_callback: async fn(agent_name: str, status: str)
    """
    logger.info(f"[Layer2] Recovery pipeline for session={session_id} order={order_id}")

    if not status_callback:
        status_callback = lambda name, status: None

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

    # ════════════════════════════════════════════════════════════════════════
    # STAGE 1: Diagnosis Agent (FIRST)
    # ════════════════════════════════════════════════════════════════════════

    await status_callback("diagnosis_agent", "running")
    try:
        diagnosis_crew = Crew(
            agents=[Agent(
                role="Checkout Abandonment Diagnosis Expert",
                goal="Determine the primary reason a user abandoned checkout from behavioral signals.",
                backstory=(
                    "Behavioural analyst specialising in Indian e-commerce checkout patterns. "
                    "You know that 145 seconds on payment screen + scrolled to EMI = price sensitivity. "
                    "retry_attempts > 1 + USER_AUTHENTICATION_FAILED = OTP friction. "
                    "You cite specific signals."
                ),
                llm=llm, verbose=False,
            )],
            tasks=[Task(
                description=f"""
Analyse abandonment signals. Output one of: {ABANDONMENT_CAUSES}
Plus: confidence (0-1), evidence (list).

DATA: {context}
""",
                expected_output='JSON: {{"primary_cause": "...", "confidence": 0.85, "evidence": ["..."]}}',
                agent=None  # Will be set in crew
            )],
            process=Process.sequential,
            verbose=False,
        )
        diagnosis_result = await asyncio.to_thread(diagnosis_crew.kickoff)
        await status_callback("diagnosis_agent", "completed")
        diagnosis_output = str(diagnosis_result)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"[Layer2] diagnosis_agent failed:\n{error_trace}")
        await status_callback("diagnosis_agent", "failed", error=str(e), trace=error_trace)
        diagnosis_output = ""

    # ════════════════════════════════════════════════════════════════════════
    # STAGE 2: Recovery Crafter (SECOND, reads diagnosis)
    # ════════════════════════════════════════════════════════════════════════

    await status_callback("recovery_crafter", "running")
    try:
        recovery_crew = Crew(
            agents=[Agent(
                role="Recovery Strategy Crafter",
                goal="Generate contextual re-engagement nudge from diagnosis.",
                backstory=(
                    "Growth hacker specialising in Indian payment recovery. "
                    "You know personalized messages convert 7x better than generic ones."
                ),
                llm=llm, verbose=False,
            )],
            tasks=[Task(
                description=f"""
Given this diagnosis output:
{diagnosis_output}

And original context:
{context}

Generate recovery strategy with nudge_message, discount, suggested_method.
""",
                expected_output='JSON: {{"nudge_message": "...", "discount_paise": 0, "suggested_method": "CREDIT_EMI", "personalisation_notes": "..."}}',
                agent=None  # Will be set in crew
            )],
            process=Process.sequential,
            verbose=False,
        )
        recovery_result = await asyncio.to_thread(recovery_crew.kickoff)
        await status_callback("recovery_crafter", "completed")
        recovery_output = str(recovery_result)
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"[Layer2] recovery_crafter failed:\n{error_trace}")
        await status_callback("recovery_crafter", "failed", error=str(e), trace=error_trace)
        recovery_output = ""

    # Parse both outputs
    try:
        import re
        
        # Parse diagnosis
        raw_diag = diagnosis_output
        raw_diag = re.sub(r'<think>.*?</think>', '', raw_diag, flags=re.DOTALL).strip()
        raw_diag = re.sub(r'```(?:json)?\s*|\s*```', '', raw_diag).strip()
        match_diag = re.search(r'\{.*\}', raw_diag, re.DOTALL)
        diagnosis_data = json.loads(match_diag.group()) if match_diag else {}

        # Parse recovery
        raw_rec = recovery_output
        raw_rec = re.sub(r'<think>.*?</think>', '', raw_rec, flags=re.DOTALL).strip()
        raw_rec = re.sub(r'```(?:json)?\s*|\s*```', '', raw_rec).strip()
        match_rec = re.search(r'\{.*\}', raw_rec, re.DOTALL)
        recovery_data = json.loads(match_rec.group()) if match_rec else {}
    except Exception as parse_err:
        logger.warning(f"[Layer2] JSON parse error: {parse_err}")
        diagnosis_data = {}
        recovery_data = {}

    nudge_msg = recovery_data.get("nudge_message", f"Complete your ₹{amount_paise//100} order!")
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
                description=f"CheckoutIQ recovery",
                expiry_hours=24,
            )
    except Exception as e:
        logger.error(f"Pay-by-link creation failed: {e}")
        pay_link = {"payment_link_id": None, "short_url": None}

    return {
        "session_id": session_id,
        "order_id": order_id,
        "primary_cause": diagnosis_data.get("primary_cause", "unknown"),
        "confidence": diagnosis_data.get("confidence", 0),
        "nudge_message": nudge_msg,
        "discount_applied_paise": discount,
        "final_amount_paise": final_amount,
        "recovery_link": pay_link.get("short_url"),
        "payment_link_id": pay_link.get("payment_link_id"),
        "suggested_method": recovery_data.get("suggested_method", ""),
        "evidence": diagnosis_data.get("evidence", []),
    }