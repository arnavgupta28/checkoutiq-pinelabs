"""
Layer 2 — Abandonment Recovery Pipeline (v2: with logging + fixed parsing)
═══════════════════════════════════════════════════════════════════════════
Sequential: diagnosis_agent → recovery_crafter → pay-by-link creation
Each step logs to insights_db for merchant dashboard visibility.
"""

from crewai import Agent, Task, Crew, Process
from backend.integrations.bedrock import get_llm
from backend.integrations.pine_labs import pine_labs
from backend.agents.insights_db import log_abandonment, log_recovery
import json, logging, asyncio, re
from typing import Callable, Optional

logger = logging.getLogger(__name__)

ABANDONMENT_CAUSES = ["price_sensitivity", "payment_friction", "offer_confusion",
                       "emi_complexity", "trust_concern", "technical_error"]

LLM_TIMEOUT_SECONDS = 25


async def run_recovery_pipeline(
    session_id: str,
    order_id: str,
    amount_paise: int,
    customer: dict,
    behavioral_signals: dict,
    failed_payment_method: str = "",
    error_code: str = "",
    use_mock: bool = False,
    status_callback: Optional[Callable] = None,
) -> dict:
    logger.info(f"[Layer2] Recovery pipeline for session={session_id} order={order_id}")

    if not status_callback:
        async def status_callback(name, status, **kwargs): pass

    context = json.dumps({
        "session_id": session_id,
        "amount_rupees": amount_paise / 100,
        "customer_name": f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip(),
        "behavioral_signals": behavioral_signals,
        "failed_payment_method": failed_payment_method,
        "pine_error_code": error_code,
        "possible_causes": ABANDONMENT_CAUSES,
    }, separators=(',', ':'))

    llm = get_llm()
    diagnosis_data = {}
    recovery_data = {}

    # ═══ STAGE 1: Diagnosis Agent ═══
    await status_callback("diagnosis_agent", "running")
    try:
        diagnosis_crew = Crew(
            agents=[Agent(
                role="Checkout Abandonment Diagnosis Expert",
                goal="Determine primary reason user abandoned checkout from behavioral signals.",
                backstory=(
                    "Behavioural analyst for Indian e-commerce. "
                    "145s on payment + scrolled_to_emi = price_sensitivity. "
                    "retry_attempts > 1 + AUTH_FAILED = payment_friction. "
                    "Output ONLY JSON."
                ),
                llm=llm, verbose=False,
            )],
            tasks=[Task(
                description=f"Analyse signals, output one of: {ABANDONMENT_CAUSES}\nDATA: {context}",
                expected_output='{"primary_cause":"...","confidence":0.85,"evidence":["..."]}',
                agent=None,
            )],
            process=Process.sequential, verbose=False,
        )
        result = await asyncio.wait_for(
            asyncio.to_thread(diagnosis_crew.kickoff),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        await status_callback("diagnosis_agent", "completed")

        raw = result.raw if hasattr(result, 'raw') else str(result)
        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
        raw = re.sub(r'```(?:json)?\s*|\s*```', '', raw).strip()
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            diagnosis_data = json.loads(match.group())
            logger.info(f"[Layer2] Diagnosis: {diagnosis_data.get('primary_cause')} ({diagnosis_data.get('confidence')})")

    except Exception as e:
        logger.error(f"[Layer2] diagnosis_agent failed: {e}")
        await status_callback("diagnosis_agent", "failed", error=str(e))
        # Heuristic fallback diagnosis
        diagnosis_data = _heuristic_diagnosis(behavioral_signals, error_code)
        logger.info(f"[Layer2] Using heuristic diagnosis: {diagnosis_data.get('primary_cause')}")

    # Log abandonment
    await log_abandonment(
        session_id=session_id,
        cause=diagnosis_data.get("primary_cause", "unknown"),
        signals=behavioral_signals,
        confidence=diagnosis_data.get("confidence", 0),
        evidence=diagnosis_data.get("evidence", []),
    )

    # ═══ STAGE 2: Recovery Crafter ═══
    await status_callback("recovery_crafter", "running")
    try:
        recovery_crew = Crew(
            agents=[Agent(
                role="Recovery Strategy Crafter",
                goal="Generate personalised re-engagement nudge from diagnosis.",
                backstory=(
                    "Growth hacker for Indian payment recovery. "
                    "Personalised messages convert 7x better than generic ones. "
                    "Output ONLY JSON."
                ),
                llm=llm, verbose=False,
            )],
            tasks=[Task(
                description=f"Diagnosis: {json.dumps(diagnosis_data, separators=(',',':'))}\nContext: {context}\nGenerate recovery nudge.",
                expected_output='{"nudge_message":"...","discount_paise":0,"suggested_method":"CREDIT_EMI","personalisation_notes":"..."}',
                agent=None,
            )],
            process=Process.sequential, verbose=False,
        )
        result = await asyncio.wait_for(
            asyncio.to_thread(recovery_crew.kickoff),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        await status_callback("recovery_crafter", "completed")

        raw = result.raw if hasattr(result, 'raw') else str(result)
        raw = re.sub(r'<think>.*?</think>', '', raw, flags=re.DOTALL).strip()
        raw = re.sub(r'```(?:json)?\s*|\s*```', '', raw).strip()
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            recovery_data = json.loads(match.group())

    except Exception as e:
        logger.error(f"[Layer2] recovery_crafter failed: {e}")
        await status_callback("recovery_crafter", "failed", error=str(e))
        # Heuristic fallback nudge
        recovery_data = _heuristic_nudge(diagnosis_data, amount_paise, customer)

    # ═══ Create Pine Labs pay-by-link ═══
    nudge_msg = recovery_data.get("nudge_message", f"Complete your Rs.{amount_paise//100} order!")
    discount = recovery_data.get("discount_paise", 0)
    final_amount = amount_paise - discount

    try:
        if use_mock:
            pay_link = {"payment_link_id": f"mock-link-{session_id}", "short_url": f"https://pay.pine/mock/{session_id}"}
        else:
            pay_link = await pine_labs.create_recovery_link(
                amount_paise=final_amount, customer=customer,
                description="CheckoutIQ recovery", expiry_hours=24,
            )
    except Exception as e:
        logger.error(f"Pay-by-link creation failed: {e}")
        pay_link = {"payment_link_id": None, "short_url": None}

    # Log recovery
    await log_recovery(
        session_id=session_id,
        nudge_message=nudge_msg,
        recovery_link=pay_link.get("short_url", ""),
        suggested_method=recovery_data.get("suggested_method", ""),
        discount_paise=discount,
    )

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
        "personalisation_notes": recovery_data.get("personalisation_notes", ""),
    }


# ── Heuristic fallbacks (no LLM needed) ──────────────────────────────────────

def _heuristic_diagnosis(signals: dict, error_code: str) -> dict:
    """Rule-based diagnosis when LLM is unavailable."""
    time_on_screen = signals.get("time_on_payment_screen_sec", 0)
    scrolled_emi = signals.get("scrolled_to_emi", False)
    retries = signals.get("retry_attempts", 0)
    methods = signals.get("methods_hovered", [])

    if retries >= 2 or error_code in ("USER_AUTHENTICATION_FAILED", "PAYMENT_DECLINED"):
        return {"primary_cause": "payment_friction", "confidence": 0.9,
                "evidence": [f"retry_attempts={retries}", f"error_code={error_code}"]}
    if scrolled_emi and time_on_screen > 90:
        return {"primary_cause": "price_sensitivity", "confidence": 0.85,
                "evidence": [f"scrolled_to_emi=true", f"time_on_screen={time_on_screen}s"]}
    if len(methods) >= 3:
        return {"primary_cause": "offer_confusion", "confidence": 0.7,
                "evidence": [f"hovered {len(methods)} methods: {methods}"]}
    if time_on_screen > 120:
        return {"primary_cause": "emi_complexity", "confidence": 0.6,
                "evidence": [f"time_on_screen={time_on_screen}s without payment"]}
    return {"primary_cause": "trust_concern", "confidence": 0.5,
            "evidence": ["No strong signals detected — default to trust concern"]}


def _heuristic_nudge(diagnosis: dict, amount_paise: int, customer: dict) -> dict:
    """Rule-based nudge when LLM is unavailable."""
    name = customer.get("first_name", "there")
    cause = diagnosis.get("primary_cause", "unknown")
    amt = amount_paise // 100

    NUDGE_TEMPLATES = {
        "price_sensitivity": {
            "nudge_message": f"Hey {name}! Pay just Rs.{amt//6}/mo with No-Cost EMI — 2 mins to complete ✓",
            "suggested_method": "CREDIT_EMI",
        },
        "payment_friction": {
            "nudge_message": f"Hi {name}, try UPI for instant checkout — your Rs.{amt} order is waiting!",
            "suggested_method": "UPI",
        },
        "offer_confusion": {
            "nudge_message": f"{name}, we found the best deal for you: 10% off with HDFC — tap to apply!",
            "suggested_method": "CARD",
        },
        "emi_complexity": {
            "nudge_message": f"Simple EMI: Rs.{amt//3}/mo for 3 months, zero interest. Complete now ✓",
            "suggested_method": "CREDIT_EMI",
        },
        "trust_concern": {
            "nudge_message": f"🔒 Your payment is secured by Pine Labs. Complete your Rs.{amt} order safely.",
            "suggested_method": "CARD",
        },
        "technical_error": {
            "nudge_message": f"Sorry for the hiccup, {name}! Your cart is saved — fresh checkout link inside.",
            "suggested_method": "UPI",
        },
    }

    template = NUDGE_TEMPLATES.get(cause, NUDGE_TEMPLATES["trust_concern"])
    return {**template, "discount_paise": 0, "personalisation_notes": f"Heuristic fallback for {cause}"}
