from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class CardType(str, Enum):
    CREDIT = "CREDIT"
    DEBIT = "DEBIT"


class PaymentMethod(str, Enum):
    CARD = "CARD"
    UPI = "UPI"
    WALLET = "WALLET"
    NETBANKING = "NETBANKING"
    CREDIT_EMI = "CREDIT_EMI"
    DEBIT_EMI = "DEBIT_EMI"
    BNPL = "BNPL"


class OrderStatus(str, Enum):
    CREATED = "CREATED"
    ATTEMPTED = "ATTEMPTED"
    AUTHORIZED = "AUTHORIZED"
    PROCESSED = "PROCESSED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


# ── Request models ────────────────────────────────────────────────────────────

class CustomerDetails(BaseModel):
    first_name: str
    last_name: str
    email_id: str
    mobile_number: str
    country_code: str = "91"
    customer_id: Optional[str] = None


class StartSessionRequest(BaseModel):
    """POST /checkout/session/start"""
    amount_paise: int             # e.g. 50000 = Rs.500
    customer: CustomerDetails
    cart_items: Optional[List[dict]] = None


class SmartApplyRequest(BaseModel):
    """POST /checkout/smart-apply — kick off Layer 1 pipeline"""
    session_id: str
    card_bin: str                 # First 6 digits of card
    card_type: CardType = CardType.CREDIT
    wallet_balances: Optional[dict] = None   # {"PHONEPE": 450, "PAYTM": 200}


class ApplyPaymentRequest(BaseModel):
    """POST /checkout/session/{id}/apply — execute chosen config"""
    session_id: str
    card_number: str
    card_expiry_month: str
    card_expiry_year: str
    cvv: str
    holder_name: str
    offer_id: Optional[str] = None
    tenure_id: Optional[str] = None


# ── Response models ───────────────────────────────────────────────────────────

class EMIOption(BaseModel):
    tenure_months: int
    monthly_amount_paise: int
    total_amount_paise: int
    interest_rate: float
    effective_saving_paise: int   # cashback - interest cost


class OfferDetail(BaseModel):
    offer_id: str
    tenure_id: str
    bank: str
    issuer_type: str              # CC_BANK | DC_BANK
    discount_type: str            # INSTANT | DEFERRED
    discount_paise: int
    discount_percent: float
    emi_options: List[EMIOption] = []


class PaymentRecommendation(BaseModel):
    """Final output of Decision Agent"""
    recommended_method: PaymentMethod
    recommended_card_hint: Optional[str] = None    # e.g. "HDFC CC ending 4242"
    offer_id: Optional[str] = None
    tenure_id: Optional[str] = None
    net_saving_paise: int = 0
    effective_amount_paise: int
    reason_trail: List[str]       # Human-readable explanation bullets
    alternatives: List[dict] = [] # Runner-up options


class CheckoutSession(BaseModel):
    session_id: str
    order_id: str                 # Pine Labs order_id
    amount_paise: int
    status: str = "CREATED"
    recommendation: Optional[PaymentRecommendation] = None
    created_at: Optional[str] = None
