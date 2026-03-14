# CheckoutIQ — Pine Labs Hackathon

Two-layer agentic checkout intelligence. Built for speed, resilience, and merchant observability.

🚀 **Live Demo:** [checkoutiq-pinelabs.vercel.app](https://checkoutiq-pinelabs.vercel.app/login)  
⚙️ **Backend API:** [100-53-193-229.sslip.io](https://100-53-193-229.sslip.io/docs)

---

## Architecture Overview

```
User clicks "Smart Apply"
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  LAYER 1 — Smart Checkout Pipeline                    │
│                                                       │
│  Phase 1 │ Insight Engine  (~0ms, pure Python)        │
│          │  • BIN → bank/tier/reward lookup           │
│          │  • Offer eligibility + discount math       │
│          │  • EMI tenure breakdown + no-cost check    │
│          │  • Wallet split suggestion                 │
│          │  → Produces ranked_options[]               │
│                                                       │
│  Phase 2 │ 2 LLM Agents  (~15s, CrewAI + Bedrock)    │
│          │  • Conflict Resolver                       │
│          │    (fed pre-computed options, not raw JSON)│
│          │  • Decision Synthesiser                    │
│          │    (reason trail, best pick)               │
│                                                       │
│  Phase 3 │ Fallback  (instant, if LLM fails/times out)│
│          │  • Returns InsightEngine best_option       │
│          │    directly — no degradation               │
└───────────────────────────────────────────────────────┘
        │ recommendation + reason trail
        ▼
User abandons? → Webhook triggers Layer 2
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  LAYER 2 — Abandonment Recovery Pipeline              │
│                                                       │
│  Phase 1 │ Heuristic Diagnosis  (~0ms, pure Python)   │
│          │  • retry_attempts + error_code → friction  │
│          │  • scrolled_to_emi + time → price sensitive│
│          │  • methods_hovered count → offer confusion  │
│          │  → Produces diagnosis immediately          │
│          │  → Logs to insights_db instantly           │
│                                                       │
│  Phase 2 │ 1 LLM Agent  (~5-15s, fed diagnosis)       │
│          │  • Recovery Nudge Crafter                  │
│          │    (personalised message ≤25 words)        │
│          │  • Recommends payment method               │
│                                                       │
│  Phase 3 │ Fallback  (if LLM fails)                   │
│          │  • Heuristic nudge templates per cause     │
│          │  → Creates Pine Labs pay-by-link           │
│          │  → Logs recovery to insights_db            │
└───────────────────────────────────────────────────────┘
```

---

## Insight Engine — How It Works

The **Insight Engine** is a pure-Python deterministic preprocessing layer that runs before any LLM call. It replaces 4 of the original 6 CrewAI agents entirely.

### Why it exists
The original pipeline sent raw offer JSON (100+ fields) to 4 LLM agents sequentially. Each agent spent most of its tokens just parsing data rather than reasoning. This caused:
- **60+ second** total pipeline time
- **3500+ tokens** consumed per checkout
- `<think>` mode on qwen3-8b consuming 500 tokens before any output
- Frequent timeouts under load

### What it does

```
run_insight_engine(amount_paise, card_bin, card_type, wallet_balances, offers_data)
        │
        ├── _analyse_card()
        │     BIN → CARD_BIN_DB → bank, network, tier, base_reward_%
        │     Estimated reward paise = amount × reward_pct
        │
        ├── _analyse_offers()
        │     For each offer in Pine Labs response:
        │       • Check card_bin/bank eligibility
        │       • Compute discount_paise (% or flat)
        │       • Flag ineligible with reason
        │     Returns list[offer_insight]
        │
        ├── _analyse_emi()
        │     For each EMI tenure in offers:
        │       • monthly_paise = principal / tenure × (1 + rate/1200)
        │       • total_emi_paise = monthly × tenure
        │       • no_cost = True if interest ≈ 0
        │     Returns list[emi_insight]
        │
        ├── _analyse_wallet()
        │     Checks PhonePe / Paytm / Amazon Pay balances
        │     Suggests partial wallet + card split if balance < amount
        │
        └── Ranks all options by net_saving_paise desc
              → InsightBundle { card, offers, emi_options, wallet,
                                ranked_options[0:5], best_option,
                                total_options_found }
```

### Performance impact

| Metric | Before | After |
|---|---|---|
| Pipeline time | ~60s | ~15s |
| Token usage | ~3500 | ~800 |
| LLM agents | 6 (sequential) | 2 (parallel-ready) |
| Abandonment pipeline | ~50s (2 LLM calls) | ~6s (1 LLM call) |
| Failure mode | Hard fail | Fallback always available |

### Abandonment Insight Layer (new in v3)

The same 3-phase pattern was applied to the abandonment pipeline:

```
Phase 1: _heuristic_diagnosis(behavioral_signals, error_code)   ← instant
  retry_attempts ≥ 2 OR AUTH_FAILED  → payment_friction  (confidence 0.9)
  scrolled_to_emi AND time > 90s     → price_sensitivity  (confidence 0.85)
  methods_hovered ≥ 3                → offer_confusion    (confidence 0.7)
  time > 120s                        → emi_complexity     (confidence 0.6)
  default                            → trust_concern      (confidence 0.5)

Phase 2: Single LLM "Recovery Nudge Crafter"   ← fed diagnosis, not raw signals
  Writes personalised ≤25-word message + recommends payment method

Phase 3: _heuristic_nudge(diagnosis, amount, customer)   ← per-cause templates
```

**Bug fixed:** Both `Task` objects in the old pipeline had `agent=None`, causing `AttributeError` from CrewAI before any LLM call was made.

---

## JSON Insights DB (`backend/data/insights_db.json`)

Persistent store for merchant analytics. Written on every session:

| Function | Writes |
|---|---|
| `save_session_insights()` | Card, offers, best option per session |
| `record_offer_chosen()` | Which offer was applied + saving |
| `log_abandonment()` | Cause, confidence, signals |
| `log_recovery()` | Nudge sent, method suggested, discount |
| `get_popular_offers()` | Aggregated offer pick frequency |
| `get_recovery_metrics()` | Abandonment rate, recovery rate |

---

## LLM Backend — Dual Route

Switch via `LLM_PROVIDER` in `.env`:

```
LLM_PROVIDER=lmstudio    # local testing (default)
LLM_PROVIDER=bedrock     # hackathon hosted run
```

**LM Studio** — OpenAI-compatible endpoint at `localhost:1234`. Thinking mode disabled via `chat_template_kwargs: {enable_thinking: false}` to prevent `<think>` token waste.

**AWS Bedrock** — Claude Opus via `crewai.LLM` (LiteLLM routing). Temporary STS credentials loaded from `.env`. Model: `us.anthropic.claude-opus-4-6-v1`.

---

## Quickstart (2 terminals)

### Terminal 1 — Backend
```bash
cd checkoutiq
cp .env.example .env
# Fill in Pine Labs credentials from dashboard.pluralonline.com
# For local: keep LLM_PROVIDER=lmstudio and start LM Studio first
# For Bedrock: set LLM_PROVIDER=bedrock + AWS credentials

pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### Terminal 2 — Frontend
```bash
cd checkoutiq/frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

---

## Demo Flow

> **Live:** https://checkoutiq-pinelabs.vercel.app/login

1. Go to `/checkout` → add items to cart → Proceed to Payment
2. Enter card BIN (`401200` = HDFC Platinum, `521234` = SBI SimplyCLICK, `421653` = Axis Flipkart)
3. Click **Smart Apply** → watch agents run live in the progress bar
4. See recommendation with reason trail → click Apply
5. OR click **Simulate Abandonment** → Layer 2 diagnoses cause + crafts personalised nudge
6. Go to `/dashboard` → Merchant view: recovery metrics, abandonment logs, recovery logs, rules

---

## Pine Labs Integration Points

| What | API | Used In |
|------|-----|---------|
| Auth | `POST /api/pay/v1/token` | Every request |
| Create Order | `POST /api/pay/v1/orders` | Session start |
| Fetch Offers + EMI | `POST /api/affordability/v1/offer-discovery` | Insight Engine |
| Validate Offer | `POST /api/affordability/v1/offer-validation` | Conflict Resolver |
| Execute Payment | `POST /api/pay/v1/payment/card` | Smart Apply |
| Recovery Link | `POST /api/pay/v1/pay-by-links` | Layer 2 nudge |
| Webhooks received | `PAYMENT_FAILED`, `ORDER_CANCELLED` | Layer 2 trigger |

---

## Project Structure

```
checkoutiq/
├── backend/
│   ├── main.py                    FastAPI app, endpoints, webhooks
│   ├── config.py                  Settings (env vars + AWS creds)
│   ├── agents/
│   │   ├── insight_engine.py      ★ Deterministic preprocessing (replaces 4 agents)
│   │   ├── insights_db.py         ★ JSON DB for session insights + merchant metrics
│   │   ├── fallback.py            ★ Popularity-based fallback recommendation
│   │   ├── smart_checkout/
│   │   │   └── pipeline.py        Layer 1 — 3-phase: InsightEngine → 2 LLM → fallback
│   │   └── abandonment/
│   │       └── pipeline.py        Layer 2 — 3-phase: heuristic diag → 1 LLM → fallback
│   ├── integrations/
│   │   ├── pine_labs.py           Real Pine Labs API client
│   │   └── bedrock.py             Dual LLM (LM Studio / AWS Bedrock via LiteLLM)
│   ├── models/
│   │   └── checkout.py            Pydantic models (CartItem, etc.)
│   ├── data/
│   │   └── insights_db.json       Persistent merchant analytics store
│   └── mock_data/
│       └── offers.json            Demo offer data
└── frontend/
    └── src/
        ├── pages/
        │   ├── CheckoutPage.jsx   Multi-item cart + Smart Apply
        │   ├── Dashboard.jsx      Merchant analytics (metrics, logs, rules)
        │   ├── Login.jsx          User authentication
        │   └── UserProfile.jsx    User profile
        ├── context/
        │   └── AuthContext.jsx    Auth state management
        ├── components/
        │   ├── SmartApply/        Agent progress bar + recommendation card
        │   └── Abandonment/       Diagnosis panel + nudge preview
        └── hooks/
            └── useCheckoutWS.js   Live agent updates via WebSocket
```

---

## References
- Pine Labs Developer Docs: https://developer.pinelabsonline.com/
- API Introduction: https://developer.pinelabsonline.com/docs/introduction
- API Reference: https://developer.pinelabsonline.com/reference/api-basics
