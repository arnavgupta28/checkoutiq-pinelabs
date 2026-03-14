"""
Pine Labs (Plural) REST API Client
UAT:  https://pluraluat.v2.pinepg.in
Prod: https://api.pluralpay.in

Auth: OAuth2 bearer token auto-managed (cached, refreshed 60s before expiry)

CheckoutIQ uses these endpoints:
  POST /api/pay/v1/token                         → bearer token
  POST /api/pay/v1/orders                        → create order (session start)
  GET  /api/pay/v1/orders/{order_id}             → poll status / detect abandonment
  POST /api/affordability/v1/offer-discovery     → EMI + offers per card [LAYER 1]
  POST /api/affordability/v1/offer-validation    → validate chosen offer
  POST /api/pay/v1/payment/card                  → execute card + EMI payment
  POST /api/pay/v1/payment/wallet                → execute wallet payment
  POST /api/pay/v1/pay-by-links                  → recovery nudge link [LAYER 2]
  
Webhooks received at POST /webhooks/pine:
  PAYMENT_FAILED, ORDER_CANCELLED, ORDER_FAILED  → trigger Layer 2 abandonment recovery
  ORDER_PROCESSED                                → mark order complete, suppress recovery
"""

import httpx, uuid, json, pathlib, logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from backend.config import settings

logger = logging.getLogger(__name__)


class PineLabsClient:
    UAT_BASE  = "https://pluraluat.v2.pinepg.in"
    PROD_BASE = "https://api.pluralpay.in"

    def __init__(self):
        self.base_url = self.UAT_BASE if settings.PINE_ENV != "PRODUCTION" else self.PROD_BASE
        self._token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None

    # ── AUTH ────────────────────────────────────────────────────────────────
    async def _token_val(self) -> str:
        now = datetime.now(timezone.utc)
        if self._token and self._token_expiry and now < self._token_expiry:
            return self._token
        async with httpx.AsyncClient() as c:
            r = await c.post(
                f"{self.base_url}/api/pay/v1/token",
                headers={"Content-Type": "application/json"},
                json={"client_id": settings.PINE_CLIENT_ID, "client_secret": settings.PINE_CLIENT_SECRET},
                timeout=10,
            )
            r.raise_for_status()
            d = r.json()
        self._token = d["access_token"]
        self._token_expiry = now + timedelta(seconds=d.get("expires_in", 3600) - 60)
        logger.info("Pine Labs token refreshed")
        return self._token

    def _h(self, token: str) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "Request-Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "Request-ID": str(uuid.uuid4()),
        }

    # ── ORDERS ──────────────────────────────────────────────────────────────
    async def create_order(self, amount_paise: int, customer: dict,
                           merchant_ref: Optional[str] = None,
                           allowed_methods: Optional[list] = None) -> dict:
        """
        POST /api/pay/v1/orders
        Returns order_id, redirect_url (hosted checkout), token.
        amount_paise = rupees * 100  (e.g. Rs.500 = 50000)
        """
        token = await self._token_val()
        body = {
            "merchant_id": settings.PINE_MERCHANT_ID,
            "merchant_order_reference": merchant_ref or str(uuid.uuid4()),
            "order_amount": {"value": amount_paise, "currency": "INR"},
            "pre_auth": False,
            "purchase_details": {
                "customer": customer,
                "merchant_metadata": {"source": "checkoutiq"},
            },
            "callback_url": settings.PINE_CALLBACK_URL,
            "failure_callback_url": settings.PINE_FAILURE_CALLBACK_URL,
        }
        if allowed_methods:
            body["allowed_payment_methods"] = allowed_methods
        async with httpx.AsyncClient() as c:
            r = await c.post(f"{self.base_url}/api/pay/v1/orders",
                             headers=self._h(token), json=body, timeout=15)
            r.raise_for_status()
            return r.json()

    async def get_order(self, order_id: str) -> dict:
        """GET /api/pay/v1/orders/{order_id} — poll status"""
        token = await self._token_val()
        async with httpx.AsyncClient() as c:
            r = await c.get(f"{self.base_url}/api/pay/v1/orders/{order_id}",
                            headers=self._h(token), timeout=10)
            r.raise_for_status()
            return r.json()

    # ── AFFORDABILITY SUITE — LAYER 1 CORE ──────────────────────────────────
    async def discover_offers(self, order_id: str, card_bin: str,
                              card_type: str = "CREDIT", amount_paise: int = 0) -> dict:
        """
        POST /api/affordability/v1/offer-discovery
        
        WHAT AGENTS GET FROM THIS:
          issuers[].name              → Card Agent: which bank/card has offers
          issuers[].tenures[].details:
            interest_rate             → EMI Agent: cost of borrowing
            discount.percentage       → Offer Agent: cashback %
            discount.amount.value     → Offer Agent: flat cashback in paise
            monthly_emi_amount.value  → EMI Agent: monthly payment
            total_emi_amount.value    → EMI Agent: total cost
          issuer_offer_parameters:
            program_type, offer_id, offer_parameter_id → needed for create_card_payment
            
        card_bin = first 6 digits of card number (e.g. "401200" for HDFC Visa)
        """
        token = await self._token_val()
        body = {"order_id": order_id, "card_details": {"card_bin": card_bin, "card_type": card_type}}
        if amount_paise:
            body["amount"] = {"value": amount_paise, "currency": "INR"}
        async with httpx.AsyncClient() as c:
            r = await c.post(f"{self.base_url}/api/affordability/v1/offer-discovery",
                             headers=self._h(token), json=body, timeout=15)
            r.raise_for_status()
            return r.json()

    async def validate_offer(self, order_id: str, offer_id: str, tenure_id: str,
                             card_bin: str, card_type: str = "CREDIT") -> dict:
        """
        POST /api/affordability/v1/offer-validation
        Called by Conflict Resolver before Decision Agent finalises recommendation.
        Confirms offer still valid + eligible at time of apply.
        """
        token = await self._token_val()
        body = {
            "order_id": order_id,
            "offer_details": {"offer_id": offer_id, "tenure_id": tenure_id},
            "card_details": {"card_bin": card_bin, "card_type": card_type},
        }
        async with httpx.AsyncClient() as c:
            r = await c.post(f"{self.base_url}/api/affordability/v1/offer-validation",
                             headers=self._h(token), json=body, timeout=15)
            r.raise_for_status()
            return r.json()

    # ── PAYMENTS ─────────────────────────────────────────────────────────────
    async def create_card_payment(self, order_id: str, card_number: str,
                                  expiry_month: str, expiry_year: str,
                                  cvv: str, holder_name: str,
                                  offer_id: Optional[str] = None,
                                  tenure_id: Optional[str] = None) -> dict:
        """POST /api/pay/v1/payment/card — executes Decision Agent's recommended config"""
        token = await self._token_val()
        body = {
            "order_id": order_id,
            "merchant_payment_reference": str(uuid.uuid4()),
            "payment_method": "CARD",
            "payment_option": {"card_data": {
                "card_number": card_number, "card_expiry_month": expiry_month,
                "card_expiry_year": expiry_year, "cvv": cvv, "card_holder_name": holder_name,
            }},
        }
        if offer_id and tenure_id:
            body["offer_data"] = {"offer_id": offer_id, "tenure_id": tenure_id}
        async with httpx.AsyncClient() as c:
            r = await c.post(f"{self.base_url}/api/pay/v1/payment/card",
                             headers=self._h(token), json=body, timeout=20)
            r.raise_for_status()
            return r.json()

    async def create_wallet_payment(self, order_id: str, wallet_code: str,
                                    mobile_number: str) -> dict:
        """POST /api/pay/v1/payment/wallet  wallet_code: PHONEPE|PAYTM|AMAZON_PAY"""
        token = await self._token_val()
        body = {
            "order_id": order_id,
            "merchant_payment_reference": str(uuid.uuid4()),
            "payment_method": "WALLET",
            "payment_option": {"wallet_data": {"wallet_code": wallet_code, "mobile_number": mobile_number}},
        }
        async with httpx.AsyncClient() as c:
            r = await c.post(f"{self.base_url}/api/pay/v1/payment/wallet",
                             headers=self._h(token), json=body, timeout=20)
            r.raise_for_status()
            return r.json()

    # ── PAY BY LINKS — LAYER 2 RECOVERY NUDGE ────────────────────────────────
    async def create_recovery_link(self, amount_paise: int, customer: dict,
                                   description: str, expiry_hours: int = 24) -> dict:
        """
        POST /api/pay/v1/pay-by-links
        Creates personalised payment link for abandonment recovery.
        Recovery Crafter Agent calls this and embeds the short_url in the nudge notification.
        Customer clicks → routed directly into Pine Labs checkout, friction point pre-resolved.
        Returns: { payment_link_id, short_url, expiry_time, status }
        """
        token = await self._token_val()
        expiry = (datetime.now(timezone.utc) + timedelta(hours=expiry_hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
        body = {
            "merchant_payment_link_reference": str(uuid.uuid4()),
            "amount": {"value": amount_paise, "currency": "INR"},
            "description": description,
            "link_expiry_time": expiry,
            "customer_details": customer,
            "allowed_payment_methods": ["CARD", "UPI", "WALLET", "NETBANKING"],
        }
        async with httpx.AsyncClient() as c:
            r = await c.post(f"{self.base_url}/api/pay/v1/pay-by-links",
                             headers=self._h(token), json=body, timeout=15)
            r.raise_for_status()
            return r.json()

    # ── MOCK (local dev without UAT creds) ───────────────────────────────────
    async def discover_offers_mock(self, card_bin: str, amount_paise: int) -> dict:
        mock_path = pathlib.Path(__file__).parent.parent / "mock_data" / "offers.json"
        with open(mock_path) as f:
            return json.load(f)

    async def create_order_mock(self, amount_paise: int, customer: dict) -> dict:
        return {
            "order_id": f"v1-mock-{uuid.uuid4().hex[:8]}",
            "merchant_order_reference": str(uuid.uuid4()),
            "status": "CREATED",
            "order_amount": {"value": amount_paise, "currency": "INR"},
        }


pine_labs = PineLabsClient()
