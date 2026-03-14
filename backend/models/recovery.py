"""
Pydantic models for Layer 2 — Abandonment Recovery
"""

from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class AbandonmentCause(str, Enum):
    PRICE_SENSITIVITY = "price_sensitivity"
    PAYMENT_FRICTION = "payment_friction"
    OFFER_CONFUSION = "offer_confusion"
    EMI_COMPLEXITY = "emi_complexity"
    TRUST_CONCERN = "trust_concern"
    TECHNICAL_ERROR = "technical_error"
    UNKNOWN = "unknown"


class BehavioralSignals(BaseModel):
    """Signals collected from frontend + Pine Labs webhook payload."""
    time_on_payment_screen_sec: int = 0
    methods_hovered: List[str] = []
    scrolled_to_emi: bool = False
    cart_value_vs_offer_gap_paise: int = 0
    retry_attempts: int = 0
    last_action: str = ""
    pine_event: Optional[str] = None
    failed_method: Optional[str] = None
    error_code: Optional[str] = None


class AbandonmentEvent(BaseModel):
    """Incoming event that triggers the Layer 2 pipeline."""
    session_id: str
    order_id: str
    amount_paise: int
    customer_name: str = ""
    behavioral_signals: BehavioralSignals = BehavioralSignals()
    failed_payment_method: str = ""
    pine_error_code: str = ""


class DiagnosisResult(BaseModel):
    """Output of the Diagnosis Agent."""
    primary_cause: AbandonmentCause = AbandonmentCause.UNKNOWN
    confidence: float = 0.0
    evidence: List[str] = []
    secondary_cause: Optional[AbandonmentCause] = None


class RecoveryNudge(BaseModel):
    """Full output of the Layer 2 pipeline — recovery strategy + Pine Labs pay-by-link."""
    session_id: str
    order_id: str
    primary_cause: str = "unknown"
    confidence: float = 0.0
    nudge_message: str = ""
    discount_applied_paise: int = 0
    final_amount_paise: int = 0
    recovery_link: Optional[str] = None
    payment_link_id: Optional[str] = None
    suggested_method: str = ""
    personalisation_notes: str = ""
    diagnosis_evidence: List[str] = []
