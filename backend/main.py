"""
CheckoutIQ — FastAPI Backend
Run: uvicorn backend.main:app --reload --port 8000
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio, uuid, json, logging
from datetime import datetime, timezone

from backend.config import settings
from backend.models.checkout import StartSessionRequest, SmartApplyRequest, ApplyPaymentRequest
from backend.integrations.pine_labs import pine_labs
from backend.agents.smart_checkout.pipeline import run_pipeline as run_smart_checkout
from backend.agents.abandonment.pipeline import run_recovery_pipeline
from backend.agents.insights_db import (
    get_abandonment_logs, get_recovery_logs, get_recovery_rules,
    get_recovery_metrics, record_offer_chosen,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
    force=True,   # override any logging already configured by uvicorn/crewai
)
# Ensure CrewAI and LangChain loggers propagate to root so they appear in terminal
logging.getLogger("crewai").setLevel(logging.DEBUG)
logging.getLogger("langchain").setLevel(logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="CheckoutIQ API", version="1.0.0")

import os
_EXTRA_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        *_EXTRA_ORIGINS,          # e.g. https://checkoutiq-xxx.vercel.app
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores (replace with Redis for prod)
sessions: dict = {}          # session_id → CheckoutSession data
ws_clients: dict = {}        # session_id → WebSocket
recovery_queue: dict = {}    # order_id → recovery result


# ── WEBSOCKET ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/checkout/{session_id}")
async def checkout_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    ws_clients[session_id] = websocket
    try:
        while True:
            await asyncio.sleep(30)
            await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        ws_clients.pop(session_id, None)


async def ws_send(session_id: str, msg: dict):
    """Push agent progress updates to connected frontend."""
    ws = ws_clients.get(session_id)
    if ws:
        try:
            await ws.send_json(msg)
        except Exception:
            pass


# ── CHECKOUT — LAYER 1 ────────────────────────────────────────────────────────
@app.post("/checkout/session/start")
async def start_session(req: StartSessionRequest):
    """
    1. Create order on Pine Labs (POST /api/pay/v1/orders)
    2. Return session_id + Pine Labs order_id to frontend
    """
    session_id = str(uuid.uuid4())
    customer = req.customer.model_dump()

    try:
        order = await pine_labs.create_order(
            amount_paise=req.amount_paise,
            customer=customer,
            merchant_ref=session_id,
        )
        order_id = order["order_id"]
    except Exception as e:
        logger.warning(f"Pine Labs create_order failed ({e}), using mock")
        order = await pine_labs.create_order_mock(req.amount_paise, customer)
        order_id = order["order_id"]

    sessions[session_id] = {
        "session_id": session_id,
        "order_id": order_id,
        "amount_paise": req.amount_paise,
        "customer": customer,
        "status": "CREATED",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cart_items": req.cart_items or [],
        "recommendation": None,
        "abandonment_signals": {},
    }

    return {
        "session_id": session_id,
        "order_id": order_id,
        "amount_paise": req.amount_paise,
        "redirect_url": order.get("redirect_url"),
    }


@app.post("/checkout/smart-apply")
async def smart_apply(req: SmartApplyRequest, background_tasks: BackgroundTasks):
    """
    Kick off Layer 1 CrewAI pipeline with real-time status tracking.
    Wave 1: 4 agents run in parallel (card, offer, emi, wallet)
    Wave 2: conflict resolver (sequential)
    Wave 3: decision agent (sequential)
    
    Streams progress via WebSocket to session_id.
    Returns job_id immediately — frontend polls WS for completion.
    """
    session = sessions.get(req.session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    job_id = str(uuid.uuid4())
    sessions[req.session_id]["status"] = "ANALYSING"

    async def status_callback(agent_name: str, status: str, error: str = None, trace: str = None):
        """Send agent status to WebSocket with optional error details."""
        msg = {
            "type": f"agent_{status}",  # "agent_running", "agent_completed", or "agent_failed"
            "agent": agent_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if error:
            msg["error"] = error
        if trace:
            msg["trace"] = trace
            logger.warning(f"Agent {agent_name} error trace:\n{trace}")
        await ws_send(req.session_id, msg)

    async def run_pipeline_task():
        result = await run_smart_checkout(
            session_id=req.session_id,
            order_id=session["order_id"],
            amount_paise=session["amount_paise"],
            card_bin=req.card_bin,
            card_type=req.card_type.value,
            wallet_balances=req.wallet_balances or {},
            use_mock=(settings.PINE_CLIENT_ID == "your_client_id_here"),
            status_callback=status_callback,  # Pass callback for real-time updates
        )

        await ws_send(req.session_id, {
            "type": "recommendation_ready",
            "data": result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        sessions[req.session_id]["recommendation"] = result
        sessions[req.session_id]["status"] = "RECOMMENDATION_READY"

    background_tasks.add_task(run_pipeline_task)
    return {"job_id": job_id, "status": "processing", "session_id": req.session_id}


@app.get("/checkout/session/{session_id}/recommendation")
async def get_recommendation(session_id: str):
    """Poll endpoint for recommendation status."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return {
        "status": session["status"],
        "recommendation": session.get("recommendation"),
    }


@app.post("/checkout/session/{session_id}/apply")
async def apply_payment(session_id: str, req: ApplyPaymentRequest):
    """
    Execute the Decision Agent's recommended payment configuration on Pine Labs.
    Calls POST /api/pay/v1/payment/card with offer_id + tenure_id pre-set.
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    result = await pine_labs.create_card_payment(
        order_id=session["order_id"],
        card_number=req.card_number,
        expiry_month=req.card_expiry_month,
        expiry_year=req.card_expiry_year,
        cvv=req.cvv,
        holder_name=req.holder_name,
        offer_id=req.offer_id,
        tenure_id=req.tenure_id,
    )
    sessions[session_id]["status"] = "PAYMENT_INITIATED"
    return result


# ── WEBHOOKS — PINE LABS ──────────────────────────────────────────────────────
@app.post("/webhooks/pine")
async def pine_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Receives Pine Labs webhook events.
    PAYMENT_FAILED / ORDER_CANCELLED / ORDER_FAILED → trigger Layer 2
    ORDER_PROCESSED → mark complete, suppress recovery
    
    Pine Labs sends: { event_type, data: { order_id, status, payments[], ... } }
    Verify signature in production: compare X-Plural-Signature header with HMAC-SHA256
    """
    body = await request.json()
    event_type = body.get("event_type")
    data = body.get("data", {})
    order_id = data.get("order_id")
    merchant_ref = data.get("merchant_order_reference")  # = our session_id

    logger.info(f"Webhook received: {event_type} for order {order_id}")

    if event_type == "ORDER_PROCESSED":
        # Mark session complete, no recovery needed
        if merchant_ref and merchant_ref in sessions:
            sessions[merchant_ref]["status"] = "COMPLETED"

    elif event_type in ("PAYMENT_FAILED", "ORDER_CANCELLED", "ORDER_FAILED"):
        # Trigger Layer 2 abandonment recovery
        session = sessions.get(merchant_ref) if merchant_ref else None
        if not session:
            # Look up by order_id
            session = next((s for s in sessions.values() if s.get("order_id") == order_id), None)

        if session:
            # Extract behavioral signals from webhook payload
            payments = data.get("payments", [])
            error_code = ""
            failed_method = ""
            if payments:
                error_code = payments[0].get("error_detail", {}).get("code", "")
                failed_method = payments[0].get("payment_method", "")

            behavioral_signals = {
                "pine_event": event_type,
                "failed_method": failed_method,
                "error_code": error_code,
                "retry_attempts": len(payments),
                "last_action": f"{event_type.lower()}_{failed_method.lower()}",
                # Frontend can enrich these before the webhook fires:
                **session.get("abandonment_signals", {}),
            }

            session["abandonment_signals"] = behavioral_signals
            session["status"] = "ABANDONED"

            async def trigger_recovery():
                async def recovery_status_callback(agent_name: str, status: str):
                    await ws_send(session["session_id"], {
                        "type": f"agent_{status}",
                        "agent": agent_name,
                        "layer": "recovery",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

                result = await run_recovery_pipeline(
                    session_id=session["session_id"],
                    order_id=order_id,
                    amount_paise=session["amount_paise"],
                    customer=session["customer"],
                    behavioral_signals=behavioral_signals,
                    failed_payment_method=failed_method,
                    error_code=error_code,
                    use_mock=(settings.PINE_CLIENT_ID == "your_client_id_here"),
                    status_callback=recovery_status_callback,
                )
                recovery_queue[order_id] = result
                session["recovery"] = result
                session["status"] = "RECOVERY_CRAFTED"
                await ws_send(session["session_id"], {
                    "type": "recovery_ready",
                    "data": result,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            background_tasks.add_task(trigger_recovery)

    return {"received": True}


# ── RECOVERY — LAYER 2 ────────────────────────────────────────────────────────
@app.post("/recovery/trigger")
async def manual_recovery_trigger(body: dict, background_tasks: BackgroundTasks):
    """Manual recovery trigger for demo."""
    session_id = body.get("session_id")
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    session["status"] = "ABANDONED"
    behavioral_signals = body.get("behavioral_signals", {
        "time_on_payment_screen_sec": 145,
        "methods_hovered": ["CARD", "UPI"],
        "scrolled_to_emi": True,
        "cart_value_vs_offer_gap_paise": 500,
        "retry_attempts": 0,
    })
    session["abandonment_signals"] = behavioral_signals

    async def run():
        async def recovery_status_callback(agent_name: str, status: str):
            await ws_send(session_id, {
                "type": f"agent_{status}",
                "agent": agent_name,
                "layer": "recovery",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        result = await run_recovery_pipeline(
            session_id=session_id,
            order_id=session["order_id"],
            amount_paise=session["amount_paise"],
            customer=session["customer"],
            behavioral_signals=behavioral_signals,
            use_mock=(settings.PINE_CLIENT_ID == "your_client_id_here"),
            status_callback=recovery_status_callback,
        )
        session["recovery"] = result
        session["status"] = "RECOVERY_CRAFTED"
        await ws_send(session_id, {
            "type": "recovery_ready",
            "data": result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    background_tasks.add_task(run)
    return {"status": "recovery_triggered", "session_id": session_id}


@app.get("/recovery/{session_id}/nudge")
async def get_recovery_nudge(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return {
        "status": session["status"],
        "recovery": session.get("recovery"),
    }


@app.post("/recovery/{session_id}/redeliver")
async def redeliver_recovery(session_id: str, background_tasks: BackgroundTasks):
    """Re-trigger Layer 2 recovery with status tracking."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    session["status"] = "ABANDONED"
    session.pop("recovery", None)
    signals = session.get("abandonment_signals", {})

    async def run():
        async def recovery_status_callback(agent_name: str, status: str):
            await ws_send(session_id, {
                "type": f"agent_{status}",
                "agent": agent_name,
                "layer": "recovery",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        result = await run_recovery_pipeline(
            session_id=session_id,
            order_id=session["order_id"],
            amount_paise=session["amount_paise"],
            customer=session["customer"],
            behavioral_signals=signals,
            failed_payment_method=signals.get("failed_method", ""),
            error_code=signals.get("error_code", ""),
            use_mock=(settings.PINE_CLIENT_ID == "your_client_id_here"),
            status_callback=recovery_status_callback,
        )
        session["recovery"] = result
        session["status"] = "RECOVERY_CRAFTED"
        await ws_send(session_id, {
            "type": "recovery_ready",
            "data": result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    background_tasks.add_task(run)
    return {"status": "redelivery_triggered", "session_id": session_id}


# ── MERCHANT DASHBOARD ────────────────────────────────────────────────────────
@app.get("/merchant/stats")
async def merchant_stats():
    total = len(sessions)
    completed = sum(1 for s in sessions.values() if s["status"] == "COMPLETED")
    abandoned = sum(1 for s in sessions.values() if "ABANDON" in s["status"] or "RECOVERY" in s["status"])
    recovered = sum(1 for s in sessions.values() if s.get("recovery") and s["status"] == "COMPLETED")

    return {
        "total_sessions": total,
        "completed": completed,
        "abandoned": abandoned,
        "recovered": recovered,
        "abandonment_rate": round(abandoned / total * 100, 1) if total else 0,
        "recovery_rate": round(recovered / abandoned * 100, 1) if abandoned else 0,
    }


@app.get("/merchant/sessions")
async def merchant_sessions():
    return {"sessions": list(sessions.values())}


# ── MERCHANT — INSIGHTS DB ENDPOINTS ──────────────────────────────────────────

@app.get("/merchant/abandonment-logs")
async def get_merchant_abandonment_logs():
    """Fetch all abandonment logs (cause, signals, confidence) from JSON DB."""
    logs = await get_abandonment_logs()
    return {"abandonment_logs": logs}


@app.get("/merchant/recovery-logs")
async def get_merchant_recovery_logs():
    """Fetch all recovery logs (nudge, link, method, discount) from JSON DB."""
    logs = await get_recovery_logs()
    return {"recovery_logs": logs}


@app.get("/merchant/recovery-rules")
async def get_merchant_recovery_rules():
    """Fetch rule-engine recovery rules for merchant understanding."""
    rules = await get_recovery_rules()
    return {"recovery_rules": rules}


@app.get("/merchant/recovery-metrics")
async def get_merchant_recovery_metrics():
    """Aggregate recovery metrics: nudges sent/clicked/converted."""
    metrics = await get_recovery_metrics()
    return metrics


@app.post("/merchant/offer-chosen")
async def merchant_offer_chosen(body: dict):
    """Record that a user chose a specific offer — feeds popularity stats."""
    offer_id = body.get("offer_id", "")
    bank = body.get("bank", "unknown")
    saving_paise = body.get("saving_paise", 0)
    if not offer_id:
        raise HTTPException(400, "offer_id required")
    await record_offer_chosen(offer_id, bank, saving_paise)
    return {"recorded": True}


@app.get("/health")
async def health():
    return {"status": "ok", "llm_provider": settings.LLM_PROVIDER, "pine_env": settings.PINE_ENV}
