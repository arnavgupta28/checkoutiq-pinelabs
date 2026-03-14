# CheckoutIQ — Pine Labs Hackathon

Two-layer agentic checkout intelligence. Built in 6 hours.

## Quickstart (2 terminals)

### Terminal 1 — Backend
```bash
cd checkoutiq
cp .env.example .env
# Fill in your Pine Labs client_id + client_secret from dashboard.pluralonline.com
# For local testing, keep LLM_PROVIDER=lmstudio and start LM Studio first

pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### Terminal 2 — Frontend
```bash
cd checkoutiq/frontend
npm install
npm run dev
Opens at http://localhost:5173
```

## Local LM Studio Setup (test without Bedrock)
1. Download LM Studio: https://lmstudio.ai
2. Load any model (recommend: Llama 3.1 8B or Mistral 7B)
3. Start local server on port 1234 (default)
4. `.env` → `LLM_PROVIDER=lmstudio` (already default)

## Switch to AWS Bedrock (hackathon hosted run)
In `.env`:
```
LLM_PROVIDER=bedrock
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
BEDROCK_REGION=us-east-1
```

## Pine Labs Integration Points
| What | API | Used In |
|------|-----|---------|
| Auth | POST /api/pay/v1/token | Every request |
| Create Order | POST /api/pay/v1/orders | Session start |
| Fetch Offers + EMI | POST /api/affordability/v1/offer-discovery | Layer 1 agents |
| Validate Offer | POST /api/affordability/v1/offer-validation | Conflict Resolver |
| Execute Payment | POST /api/pay/v1/payment/card | Smart Apply execute |
| Recovery Link | POST /api/pay/v1/pay-by-links | Layer 2 nudge |
| Webhooks received | PAYMENT_FAILED, ORDER_CANCELLED | Layer 2 trigger |

## Demo Flow
1. Go to `/checkout` → add to cart → Proceed to Payment
2. Enter card BIN (try: `401200` = HDFC, `521234` = SBI, `421653` = Axis)
3. Click **Smart Apply** → watch 6 agents run live
4. See recommendation with reason trail → click Apply
5. OR click "Simulate Abandonment" → watch Layer 2 diagnosis + nudge generation

## Project Structure
```
checkoutiq/
├── backend/
│   ├── main.py                    FastAPI app + webhooks
│   ├── config.py                  Settings (env vars)
│   ├── agents/
│   │   ├── smart_checkout/
│   │   │   └── pipeline.py        Layer 1 — 6 CrewAI agents
│   │   └── abandonment/
│   │       └── pipeline.py        Layer 2 — 2 CrewAI agents
│   ├── integrations/
│   │   ├── pine_labs.py           Real Pine Labs API client
│   │   └── bedrock.py             Dual LLM (LM Studio / Bedrock)
│   ├── models/
│   │   └── checkout.py            Pydantic models
│   └── mock_data/
│       └── offers.json            Demo offer data
└── frontend/
    └── src/
        ├── pages/
        │   ├── CheckoutPage.jsx   User checkout demo
        │   └── Dashboard.jsx      Merchant analytics
        ├── components/
        │   ├── SmartApply/        Agent progress + recommendation
        │   └── Abandonment/       Diagnosis + nudge preview
        └── hooks/
            └── useCheckoutWS.js   Live agent updates via WS
```


Links : (iterate through and check all navigable pages form here )
https://developer.pinelabsonline.com/
https://developer.pinelabsonline.com/docs/introduction
https://developer.pinelabsonline.com/reference/api-basics
