# CheckoutIQ — Full Architecture & 6-Hour Build Plan

---

## Project Overview

Two-layer agentic checkout intelligence system for Pine Labs hackathon.

- **Layer 1 — Smart Checkout Agent**: Multi-agent CrewAI pipeline that fires at checkout, reasons over cards/offers/EMI/wallets, surfaces one optimal "Smart Apply" recommendation.
- **Layer 2 — Abandonment Recovery Agent**: Detects checkout dropout, diagnoses the *why* from behavioral signals, crafts a personalized nudge + pre-configured re-entry link.

---

## Full Work Tree

```
checkoutiq/
│
├── backend/
│   ├── main.py                        # FastAPI app entry point, CORS, router registration
│   ├── config.py                      # Env vars: Pine Labs keys, Bedrock region/model, etc.
│   ├── dependencies.py                # Shared DI (bedrock client, session store)
│   │
│   ├── agents/
│   │   ├── __init__.py
│   │   │
│   │   ├── smart_checkout/            # LAYER 1
│   │   │   ├── __init__.py
│   │   │   ├── card_agent.py          # Reasons over reward rates + card-specific offers vs cart
│   │   │   ├── offer_agent.py         # Parses merchant/bank offers, checks eligibility + expiry
│   │   │   ├── emi_agent.py           # Calculates effective EMI cost vs upfront + cashback offset
│   │   │   ├── wallet_agent.py        # Determines optimal partial splits across wallets + cards
│   │   │   ├── conflict_resolver.py   # Handles mutually exclusive offers, reasons over trade-offs
│   │   │   ├── decision_agent.py      # Synthesizes all outputs → single ranked rec + reason trail
│   │   │   └── pipeline.py            # CrewAI Crew definition: tasks, agents, sequential + parallel
│   │   │
│   │   └── abandonment/               # LAYER 2
│   │       ├── __init__.py
│   │       ├── dropout_detector.py    # Consumes Pine Labs session lifecycle events
│   │       ├── diagnosis_agent.py     # Interprets behavioral signals → cause (price/method/offer)
│   │       ├── recovery_crafter.py    # Generates contextual re-engagement strategy (not template)
│   │       └── pipeline.py            # CrewAI Crew for Layer 2
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── checkout.py            # POST /checkout/session/start
│   │   │   │                          # POST /checkout/smart-apply
│   │   │   │                          # GET  /checkout/session/{id}/recommendation
│   │   │   ├── recovery.py            # POST /recovery/trigger
│   │   │   │                          # GET  /recovery/{session_id}/nudge
│   │   │   └── merchant.py            # GET  /merchant/stats  (dashboard data)
│   │   └── websocket.py               # WS  /ws/checkout/{session_id}  (live updates)
│   │
│   ├── integrations/
│   │   ├── pine_labs.py               # Pine Labs API client: offers, payment methods, sessions
│   │   └── bedrock.py                 # AWS Bedrock client wrapper (Claude 3 Sonnet via boto3)
│   │
│   ├── models/
│   │   ├── checkout.py                # Pydantic: CheckoutSession, PaymentInstrument, Offer, EMI
│   │   └── recovery.py                # Pydantic: AbandonmentEvent, RecoveryRecommendation, Nudge
│   │
│   ├── mock_data/
│   │   ├── offers.json                # Simulated merchant + bank offers catalog
│   │   ├── user_profiles.json         # Simulated user cards, wallets, eligibility
│   │   └── sessions.json              # Pre-built session states for demo flow
│   │
│   └── requirements.txt
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx                    # Router: /dashboard, /checkout/:id, /recovery
│   │   ├── main.jsx
│   │   ├── api/
│   │   │   ├── checkout.js            # Axios wrappers for checkout routes
│   │   │   └── recovery.js            # Axios wrappers for recovery routes
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx          # Merchant dashboard: live sessions, abandonment stats
│   │   │   ├── CheckoutPage.jsx       # User-facing checkout with Smart Apply UI
│   │   │   └── RecoveryPage.jsx       # Demo: abandonment event → nudge being crafted live
│   │   │
│   │   ├── components/
│   │   │   ├── SmartApply/
│   │   │   │   ├── SmartApplyButton.jsx       # The main CTA
│   │   │   │   ├── RecommendationCard.jsx     # Shows optimal config + reason trail
│   │   │   │   └── AgentProgressBar.jsx       # Real-time agent execution status
│   │   │   │
│   │   │   ├── Abandonment/
│   │   │   │   ├── DropoutFeed.jsx            # Live list of abandoned sessions
│   │   │   │   ├── DiagnosisPanel.jsx         # Shows why-analysis result per session
│   │   │   │   └── NudgePreview.jsx           # Preview of crafted re-engagement nudge
│   │   │   │
│   │   │   └── shared/
│   │   │       ├── AgentStatusBadge.jsx
│   │   │       └── ReasonTrail.jsx            # Expandable "why this was chosen" explainer
│   │   │
│   │   └── hooks/
│   │       ├── useCheckoutWS.js       # WebSocket hook for live agent updates
│   │       └── useSessionStore.js     # Zustand or simple context for session state
│   │
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── .env
├── docker-compose.yml                 # Optional: spin up backend + frontend together
└── README.md
```

---

## API Routes (FastAPI)

### Checkout (Layer 1)

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `POST` | `/checkout/session/start` | Fetch Pine Labs offers + user instruments, create session |
| `POST` | `/checkout/smart-apply` | Kick off CrewAI Layer 1 pipeline, return job_id |
| `GET`  | `/checkout/session/{id}/recommendation` | Poll for Decision Agent output |
| `WS`   | `/ws/checkout/{session_id}` | Stream agent progress events (card → offer → emi → ...) |
| `POST` | `/checkout/session/{id}/apply` | Apply chosen config to Pine Labs checkout session |

### Recovery (Layer 2)

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `POST` | `/recovery/trigger` | Receives dropout event from Pine Labs webhook |
| `GET`  | `/recovery/{session_id}/nudge` | Returns crafted recovery recommendation |
| `POST` | `/recovery/{session_id}/redeliver` | Re-triggers recovery crafter if needed |

### Merchant Dashboard

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `GET`  | `/merchant/stats` | Abandonment rate, recovery rate, offer utilization |
| `GET`  | `/merchant/sessions` | Live + recent sessions list |

---

## Agent Definitions (CrewAI)

### Layer 1 — Smart Checkout Pipeline

```python
# pipeline.py (Layer 1)
from crewai import Agent, Task, Crew, Process

card_agent = Agent(
    role="Card Selection Specialist",
    goal="Identify the optimal card for this cart maximising cashback and rewards",
    backstory="Expert in Indian credit/debit card reward structures...",
    llm=bedrock_llm  # or LM Studio endpoint
)

offer_agent = Agent(
    role="Offer Eligibility Analyst",
    goal="Parse all active offers, check user eligibility, expiry, min order",
    backstory="Knows every bank and merchant offer condition precisely..."
)

emi_agent = Agent(
    role="EMI Cost Analyst",
    goal="Calculate effective EMI cost vs upfront, accounting for cashback",
    backstory="Financial reasoning expert for Indian consumer credit..."
)

wallet_agent = Agent(
    role="Wallet Optimisation Agent",
    goal="Find optimal partial payment split across wallets and cards",
    backstory="Expert in multi-instrument payment flows..."
)

conflict_resolver = Agent(
    role="Offer Conflict Resolver",
    goal="Resolve mutually exclusive offers, rank trade-offs clearly",
    backstory="Arbitrates complex offer stacking rules..."
)

decision_agent = Agent(
    role="Final Decision Synthesiser",
    goal="Produce ONE ranked recommendation with a clear reasoning trail",
    backstory="Synthesises all agent outputs into actionable, explainable advice..."
)

# Tasks run card + offer + emi + wallet in parallel, then conflict resolver, then decision
crew = Crew(
    agents=[card_agent, offer_agent, emi_agent, wallet_agent, conflict_resolver, decision_agent],
    tasks=[...],
    process=Process.sequential  # with parallel sub-group for first 4
)
```

### Layer 2 — Abandonment Recovery Pipeline

```python
diagnosis_agent = Agent(
    role="Abandonment Diagnosis Expert",
    goal="From behavioral signals determine WHY the user dropped off",
    backstory="Reads time-on-screen, hover patterns, cart value vs offer gap..."
)

recovery_crafter = Agent(
    role="Recovery Strategy Crafter",
    goal="Generate a personalised, contextually appropriate re-engagement",
    backstory="Creates targeted offers/EMI breakdowns/simplified links — not templates..."
)
```

---

## Bedrock Integration

```python
# integrations/bedrock.py
import boto3
from langchain_aws import ChatBedrock

def get_bedrock_llm():
    client = boto3.client("bedrock-runtime", region_name="us-east-1")
    return ChatBedrock(
        client=client,
        model_id="anthropic.claude-3-sonnet-20240229-v1:0",
        model_kwargs={"max_tokens": 1024, "temperature": 0.2}
    )
```

Pass `get_bedrock_llm()` as the `llm=` param to each CrewAI Agent.

---

## Pine Labs Integration Points

```python
# integrations/pine_labs.py

class PineLabsClient:
    BASE = "https://api.pinelabs.com"  # replace with actual base URL from portal

    async def get_offers(self, merchant_id: str) -> list[Offer]:
        # GET /v1/offers?merchant_id=...
        ...

    async def get_payment_methods(self, session_id: str) -> list[PaymentMethod]:
        # GET /v1/checkout/{session_id}/payment-methods
        ...

    async def apply_configuration(self, session_id: str, config: dict):
        # POST /v1/checkout/{session_id}/apply
        ...

    async def get_session_events(self, session_id: str) -> SessionEvent:
        # GET /v1/checkout/{session_id}/events  (poll or webhook)
        ...
```

---

## Mock Data Structure (for demo)

```json
// mock_data/offers.json
{
  "offers": [
    {
      "id": "HDFC_10_OFF",
      "bank": "HDFC",
      "type": "card_discount",
      "discount_percent": 10,
      "max_discount": 500,
      "min_order": 2000,
      "eligible_cards": ["HDFC_CC", "HDFC_DC"],
      "expiry": "2025-04-30",
      "mutually_exclusive_with": ["HDFC_CASHBACK_5"]
    }
  ]
}

// mock_data/user_profiles.json
{
  "users": [
    {
      "id": "user_001",
      "cards": [
        {"id": "HDFC_CC", "bank": "HDFC", "type": "credit", "reward_rate": 2.0},
        {"id": "SBI_CC",  "bank": "SBI",  "type": "credit", "reward_rate": 1.5}
      ],
      "wallets": [
        {"id": "PHONEPE", "balance": 450},
        {"id": "PAYTM",   "balance": 200}
      ]
    }
  ]
}
```

---

## 6-Hour Build Timeline (Tomorrow)

### Hour 0–0.5 — Setup (30 min)
- [ ] Clone repo skeleton, create venv, install `fastapi uvicorn crewai langchain-aws boto3 pydantic`
- [ ] Create `.env` with Bedrock credentials + Pine Labs API key
- [ ] Confirm `boto3` can reach Bedrock (`bedrock.list_foundation_models()`)
- [ ] `npm create vite@latest frontend -- --template react`

### Hour 0.5–2 — Backend Core (90 min)
- [ ] `config.py` — load all env vars
- [ ] `models/checkout.py` — Pydantic models (CheckoutSession, Offer, Instrument, Recommendation)
- [ ] `models/recovery.py` — Pydantic models (AbandonmentEvent, RecoveryNudge)
- [ ] `mock_data/` — populate offers.json and user_profiles.json (20 rows each)
- [ ] `integrations/pine_labs.py` — real endpoints where available, fallback to mock
- [ ] `integrations/bedrock.py` — LangChain ChatBedrock wrapper

### Hour 2–3.5 — Agent Pipelines (90 min)
- [ ] Layer 1 agents: card, offer, emi, wallet (each ~15 lines: role, goal, backstory, tools)
- [ ] Layer 1 conflict_resolver + decision_agent
- [ ] Layer 1 `pipeline.py` — Crew with tasks, wire parallel first group
- [ ] Layer 2 diagnosis_agent + recovery_crafter + `pipeline.py`
- [ ] Smoke-test both pipelines locally with mock data via `python -m pytest agents/`

### Hour 3.5–4.5 — FastAPI Routes + WebSocket (60 min)
- [ ] `api/routes/checkout.py` — 3 endpoints
- [ ] `api/routes/recovery.py` — 2 endpoints
- [ ] `api/routes/merchant.py` — stats endpoint
- [ ] `api/websocket.py` — stream agent progress as SSE or WS events
- [ ] Register all routers in `main.py`, enable CORS for React dev server

### Hour 4.5–5.5 — React Frontend (60 min)
- [ ] `CheckoutPage.jsx` — payment method list + Smart Apply button → calls `/checkout/smart-apply` → polls WS → shows `RecommendationCard`
- [ ] `AgentProgressBar.jsx` — shows Card → Offer → EMI → Wallet → Conflict → Decision in real time
- [ ] `RecommendationCard.jsx` — shows optimal config + expandable reason trail
- [ ] `Dashboard.jsx` — abandonment feed + per-session diagnosis + nudge preview
- [ ] Wire `api/checkout.js` and `api/recovery.js` Axios wrappers

### Hour 5.5–6 — Demo Polish + Backup (30 min)
- [ ] End-to-end demo flow: user → checkout → Smart Apply fires → recommendation shown → apply to Pine Labs session
- [ ] Second demo flow: user abandons → dropdown event → why-analysis → nudge generated
- [ ] If Bedrock has latency issues: pre-record agent outputs as JSON and replay for demo
- [ ] README quickstart (2 commands: `uvicorn main:app` + `npm run dev`)

---

## Key Decisions

**Bedrock model**: Use `anthropic.claude-3-sonnet-20240229-v1:0` — best balance of speed and reasoning quality for agent tasks.

**CrewAI execution**: Run card + offer + emi + wallet agents as parallel tasks in one crew step, then conflict resolver + decision agent sequentially. This cuts Layer 1 latency by ~60%.

**WebSocket vs polling**: Use WebSocket for the demo to show real-time agent progress — this is the visual centrepiece. Fall back to polling endpoint if WS has issues.

**Mock data strategy**: Build mock data rich enough that every agent has something to reason about. At least 5 offers with varied conditions, 2 users with 2 cards + 2 wallets each, and 3 pre-built abandonment scenarios (price, payment friction, offer confusion).

**Pine Labs integration**: Prioritize making the mock pipeline end-to-end first. Wire real Pine Labs API calls in `pine_labs.py` where credentials allow, and the rest stays mocked transparently.

---

## What to Finish Today

1. Finalize the mock data (`offers.json`, `user_profiles.json`) — this unblocks all agent work tomorrow
2. Write all 6 CrewAI agent role/goal/backstory definitions (no code, just the text) — paste into agents tomorrow
3. Sketch the 3 demo flows on paper (happy path, abandonment, recovery)
4. Confirm Pine Labs API portal access and note which endpoints are available
5. Check AWS Bedrock access tomorrow morning first thing (5 min smoke test)
