"""
JSON DB — Lightweight file-based storage for CheckoutIQ insights, logs, and metrics.
═══════════════════════════════════════════════════════════════════════════════════
Stores:
  - offer_popularity: tracks which offers users chose (fallback ranking)
  - session_insights: preprocessed insight bundles per session
  - abandonment_logs: merchant-visible abandonment event log
  - recovery_logs: recovery nudge outcomes + metrics
  - recovery_rules: human-readable rule descriptions for merchant dashboard

Thread-safe via asyncio.Lock. Flushes to disk on every write.
Replace with Redis/Postgres for production.
"""

import json, pathlib, asyncio, logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

DB_PATH = pathlib.Path(__file__).parent.parent / "data" / "insights_db.json"

_lock = asyncio.Lock()

# ── Default schema ────────────────────────────────────────────────────────────
_DEFAULT = {
    "offer_popularity": {},       # offer_id → {"chosen_count": N, "last_chosen": ts}
    "session_insights": {},       # session_id → InsightBundle
    "abandonment_logs": [],       # [{session_id, timestamp, cause, signals, ...}]
    "recovery_logs": [],          # [{session_id, timestamp, nudge, outcome, ...}]
    "recovery_rules": [           # Merchant-visible rule descriptions
        {
            "rule_id": "R1",
            "name": "Payment Failure Recovery",
            "trigger": "PAYMENT_FAILED / ORDER_CANCELLED / ORDER_FAILED",
            "description": "When Pine Labs webhook fires a payment failure, Layer 2 diagnosis agent analyses behavioral signals (time on screen, methods hovered, retry count) to identify the primary abandonment cause.",
            "action": "Generate personalised recovery nudge + Pine Labs pay-by-link with pre-applied offer",
            "sla": "< 5 seconds",
            "enabled": True,
        },
        {
            "rule_id": "R2",
            "name": "Price Sensitivity Detection",
            "trigger": "time_on_payment_screen > 120s AND scrolled_to_emi = true",
            "description": "User spent over 2 minutes and scrolled to EMI section — strong signal of price sensitivity. They want to buy but need affordability help.",
            "action": "Nudge with No-Cost EMI breakdown showing ₹X/month + pre-select cheapest EMI tenure",
            "sla": "Real-time (WebSocket push)",
            "enabled": True,
        },
        {
            "rule_id": "R3",
            "name": "Auth Failure Redirect",
            "trigger": "retry_attempts >= 2 AND error_code = USER_AUTHENTICATION_FAILED",
            "description": "User tried 2+ times but OTP/authentication failed — payment friction, not intent issue.",
            "action": "Suggest simpler payment method (UPI Intent / saved card) via recovery link",
            "sla": "< 3 seconds after webhook",
            "enabled": True,
        },
        {
            "rule_id": "R4",
            "name": "Option Confusion Resolver",
            "trigger": "methods_hovered includes CARD + UPI but no payment initiated",
            "description": "User browsed multiple payment methods but didn't commit — likely confused by too many options or unsure which gives best deal.",
            "action": "Send Smart Apply recommendation as nudge showing best offer with reason trail",
            "sla": "< 5 seconds",
            "enabled": True,
        },
        {
            "rule_id": "R5",
            "name": "Threshold Unlock Nudge",
            "trigger": "cart_value within 10% of offer threshold",
            "description": "Cart value is very close to an offer's minimum threshold — user might add a small item to unlock the discount.",
            "action": "Nudge: 'Add ₹X more to unlock Y% discount' with recommended add-on items",
            "sla": "Real-time",
            "enabled": True,
        },
    ],
}


def _ensure_db() -> dict:
    """Load DB from disk or create default."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        try:
            with open(DB_PATH) as f:
                data = json.load(f)
            # Ensure all keys exist
            for k, v in _DEFAULT.items():
                if k not in data:
                    data[k] = v
            return data
        except Exception:
            pass
    return json.loads(json.dumps(_DEFAULT))  # Deep copy


def _flush(data: dict):
    """Write DB to disk."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DB_PATH, "w") as f:
        json.dump(data, f, indent=2, default=str)


# ── Public API ────────────────────────────────────────────────────────────────

async def save_session_insights(session_id: str, insights: dict):
    """Store preprocessed InsightBundle for a session."""
    async with _lock:
        db = _ensure_db()
        db["session_insights"][session_id] = {
            **insights,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        _flush(db)


async def get_session_insights(session_id: str) -> Optional[dict]:
    async with _lock:
        db = _ensure_db()
        return db["session_insights"].get(session_id)


async def record_offer_chosen(offer_id: str, bank: str, saving_paise: int):
    """Track which offer was chosen — builds popularity ranking for fallback."""
    async with _lock:
        db = _ensure_db()
        key = offer_id or "no_offer"
        if key not in db["offer_popularity"]:
            db["offer_popularity"][key] = {"chosen_count": 0, "bank": bank, "total_saving_paise": 0}
        db["offer_popularity"][key]["chosen_count"] += 1
        db["offer_popularity"][key]["total_saving_paise"] += saving_paise
        db["offer_popularity"][key]["last_chosen"] = datetime.now(timezone.utc).isoformat()
        _flush(db)


async def get_popular_offers(top_n: int = 3) -> list:
    """Return most-chosen offers for fallback recommendations."""
    async with _lock:
        db = _ensure_db()
        sorted_offers = sorted(
            db["offer_popularity"].items(),
            key=lambda x: x[1].get("chosen_count", 0),
            reverse=True,
        )
        return [{"offer_id": k, **v} for k, v in sorted_offers[:top_n]]


async def log_abandonment(session_id: str, cause: str, signals: dict,
                          confidence: float = 0, evidence: list = None):
    """Append abandonment event to merchant-visible log."""
    async with _lock:
        db = _ensure_db()
        db["abandonment_logs"].append({
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "cause": cause,
            "confidence": confidence,
            "evidence": evidence or [],
            "signals": signals,
        })
        # Keep last 500 entries
        db["abandonment_logs"] = db["abandonment_logs"][-500:]
        _flush(db)


async def log_recovery(session_id: str, nudge_message: str, recovery_link: str,
                       suggested_method: str, discount_paise: int = 0,
                       outcome: str = "sent"):
    """Append recovery action to log."""
    async with _lock:
        db = _ensure_db()
        db["recovery_logs"].append({
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "nudge_message": nudge_message,
            "recovery_link": recovery_link,
            "suggested_method": suggested_method,
            "discount_paise": discount_paise,
            "outcome": outcome,  # "sent" | "clicked" | "converted" | "expired"
        })
        db["recovery_logs"] = db["recovery_logs"][-500:]
        _flush(db)


async def get_recovery_rules() -> list:
    """Return merchant-visible recovery rule descriptions."""
    async with _lock:
        db = _ensure_db()
        return db.get("recovery_rules", _DEFAULT["recovery_rules"])


async def get_abandonment_logs(limit: int = 50) -> list:
    """Return recent abandonment logs for merchant dashboard."""
    async with _lock:
        db = _ensure_db()
        return db["abandonment_logs"][-limit:]


async def get_recovery_logs(limit: int = 50) -> list:
    """Return recent recovery logs for merchant dashboard."""
    async with _lock:
        db = _ensure_db()
        return db["recovery_logs"][-limit:]


async def get_recovery_metrics() -> dict:
    """Compute recovery metrics from logs."""
    async with _lock:
        db = _ensure_db()
        logs = db.get("recovery_logs", [])
        total = len(logs)
        clicked = sum(1 for l in logs if l.get("outcome") == "clicked")
        converted = sum(1 for l in logs if l.get("outcome") == "converted")
        return {
            "total_nudges_sent": total,
            "nudges_clicked": clicked,
            "nudges_converted": converted,
            "click_rate": round(clicked / total * 100, 1) if total else 0,
            "conversion_rate": round(converted / total * 100, 1) if total else 0,
        }
