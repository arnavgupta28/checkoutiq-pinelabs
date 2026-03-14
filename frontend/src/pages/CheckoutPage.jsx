import { useState, useEffect } from 'react'
import { startSession, triggerSmartApply } from '../api/checkout'
import { triggerRecovery } from '../api/recovery'
import { useCheckoutWS } from '../hooks/useCheckoutWS'
import AgentProgressBar from '../components/SmartApply/AgentProgressBar'
import RecommendationCard from '../components/SmartApply/RecommendationCard'
import { DiagnosisPanel, NudgePreview } from '../components/Abandonment/DiagnosisPanel'
import { Zap, ShoppingCart } from 'lucide-react'

/* ── Pine Labs brand tokens ───────────────────────────── */
const PL = {
  green:  '#003323',
  mint:   '#50D387',
  white:  '#FFFFFF',
  blue:   '#5AE2E2',
  yellow: '#FFAA37',
  violet: '#836CF4',
  teal:   '#20D39C',
  bg:     '#f0f5f3',
  border: '#003323' + '18',
  muted:  '#003323' + '70',
}

const DEMO_CART = [
  { name: 'Samsung Galaxy S24', price: 79999, image: '📱' },
]

export default function CheckoutPage() {
  const [phase, setPhase] = useState('cart')
  const [sessionId, setSessionId] = useState(null)
  const [cardBin, setCardBin] = useState('401200')
  const [cardType, setCardType] = useState('CREDIT')
  const [error, setError] = useState(null)
  const [applying, setApplying] = useState(false)

  const amount = 7999900
  const { agentStatus, recommendation, recovery, events, AGENTS, WAVE_1, WAVE_2, WAVE_3 } = useCheckoutWS(sessionId)

  const handleStartSession = async () => {
    setError(null)
    try {
      const res = await startSession({
        amount_paise: amount,
        customer: {
          first_name: 'Rahul', last_name: 'Sharma',
          email_id: 'rahul@example.com', mobile_number: '9876543210',
        },
      })
      setSessionId(res.session_id)
      setPhase('paying')
    } catch (e) {
      setError('Failed to start session. Is the backend running?')
    }
  }

  const handleSmartApply = async () => {
    setPhase('analysing')
    await triggerSmartApply({
      session_id: sessionId,
      card_bin: cardBin,
      card_type: cardType,
      wallet_balances: { PHONEPE: 45000, PAYTM: 20000 },
    })
  }

  useEffect(() => {
    if (recommendation && phase === 'analysing') {
      const t = setTimeout(() => setPhase('recommendation'), 100)
      return () => clearTimeout(t)
    }
  }, [recommendation, phase])

  const handleApply = async () => {
    setApplying(true)
    await new Promise(r => setTimeout(r, 2000))
    setApplying(false)
    setPhase('done')
  }

  const handleSimulateAbandonment = async () => {
    setPhase('abandoned')
    await triggerRecovery(sessionId, {
      time_on_payment_screen_sec: 145,
      methods_hovered: ['CARD', 'UPI'],
      scrolled_to_emi: true,
      cart_value_vs_offer_gap_paise: 50000,
      retry_attempts: 1,
      last_action: 'exited_at_otp',
    })
  }

  const cardStyle = {
    background: PL.white, border: `1px solid ${PL.border}`,
    borderRadius: 14, padding: 18,
    boxShadow: '0 2px 8px rgba(0,51,35,0.06)',
  }

  return (
    <div style={{ maxWidth: 460, margin: '0 auto', padding: '28px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ width: 36, height: 36, background: PL.green, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShoppingCart size={18} color={PL.mint} />
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: PL.green }}>CheckoutIQ Demo</h1>
          <p style={{ fontSize: 11, color: PL.muted, margin: 0, fontWeight: 500 }}>Smart payment optimisation</p>
        </div>
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 700,
          background: `${PL.mint}20`, color: PL.green,
          padding: '4px 10px', borderRadius: 20,
        }}>
          Pine Labs UAT
        </span>
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5',
          borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13, color: '#dc2626',
        }}>{error}</div>
      )}

      {/* ── CART PHASE ─────────────────────────────────────────── */}
      {phase === 'cart' && (
        <div>
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            {DEMO_CART.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontSize: 40 }}>{item.image}</span>
                <div>
                  <p style={{ fontWeight: 700, margin: 0, fontSize: 15, color: PL.green }}>{item.name}</p>
                  <p style={{ color: PL.mint, fontWeight: 800, margin: '4px 0 0', fontSize: 18 }}>
                    ₹{item.price.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <button onClick={handleStartSession}
            style={{
              width: '100%', background: PL.green, color: PL.white,
              border: 'none', borderRadius: 12, padding: '15px 0',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => e.target.style.opacity = 0.9}
            onMouseLeave={e => e.target.style.opacity = 1}
          >
            Proceed to Payment →
          </button>
        </div>
      )}

      {/* ── PAYING PHASE ───────────────────────────────────────── */}
      {phase === 'paying' && (
        <div>
          <p style={{ fontSize: 12, color: PL.muted, marginBottom: 16 }}>
            Session: <code style={{ background: `${PL.green}08`, padding: '2px 8px', borderRadius: 6, color: PL.green, fontWeight: 600, fontSize: 11 }}>{sessionId?.slice(0, 8)}...</code>
          </p>

          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: PL.green }}>Card Details (demo)</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: PL.muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Card BIN (first 6)</label>
                <input value={cardBin} onChange={e => setCardBin(e.target.value)}
                  style={{
                    width: '100%', border: `1.5px solid ${PL.border}`,
                    borderRadius: 10, padding: '10px 12px', fontSize: 13,
                    boxSizing: 'border-box', outline: 'none', color: PL.green,
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = PL.mint}
                  onBlur={e => e.target.style.borderColor = PL.border}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: PL.muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Card Type</label>
                <select value={cardType} onChange={e => setCardType(e.target.value)}
                  style={{
                    width: '100%', border: `1.5px solid ${PL.border}`,
                    borderRadius: 10, padding: '10px 12px', fontSize: 13,
                    color: PL.green, background: PL.white, outline: 'none',
                  }}>
                  <option value="CREDIT">Credit</option>
                  <option value="DEBIT">Debit</option>
                </select>
              </div>
            </div>
            <p style={{ fontSize: 11, color: PL.muted, marginTop: 10 }}>
              <span style={{ color: PL.mint, fontWeight: 600 }}>401200</span> = HDFC Visa · <span style={{ color: PL.mint, fontWeight: 600 }}>521234</span> = SBI · <span style={{ color: PL.mint, fontWeight: 600 }}>421653</span> = Axis
            </p>
          </div>

          <button onClick={handleSmartApply}
            style={{
              width: '100%', background: `linear-gradient(135deg, ${PL.green}, ${PL.green}dd)`,
              color: PL.mint, border: 'none', borderRadius: 12, padding: '15px 0',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 4px 16px ${PL.green}30`,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = `0 6px 24px ${PL.green}40` }}
            onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = `0 4px 16px ${PL.green}30` }}
          >
            <Zap size={17} fill={PL.mint} color={PL.mint} /> Smart Apply
          </button>

          <button onClick={handleSimulateAbandonment}
            style={{
              width: '100%', background: 'transparent',
              color: PL.yellow, border: `1.5px solid ${PL.yellow}50`,
              borderRadius: 12, padding: '12px 0',
              fontSize: 13, cursor: 'pointer', marginTop: 12, fontWeight: 600,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.target.style.background = `${PL.yellow}10`; e.target.style.borderColor = PL.yellow }}
            onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.borderColor = `${PL.yellow}50` }}
          >
            ⚡ Simulate Abandonment (demo Layer 2)
          </button>
        </div>
      )}

      {/* ── ANALYSING PHASE ────────────────────────────────────── */}
      {phase === 'analysing' && (
        <div>
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Zap size={16} color={PL.mint} />
              <span style={{ fontSize: 14, fontWeight: 700, color: PL.green }}>Analysing your best payment option...</span>
            </div>
            <AgentProgressBar agentStatus={agentStatus} wave1={WAVE_1} wave2={WAVE_2} wave3={WAVE_3} events={events} />
          </div>
          <p style={{ fontSize: 12, color: PL.muted, textAlign: 'center' }}>
            Pine Labs offer data → 6 agents reasoning → 1 optimal recommendation
          </p>
        </div>
      )}

      {/* ── RECOMMENDATION PHASE ───────────────────────────────── */}
      {phase === 'recommendation' && (
        <div>
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <AgentProgressBar agentStatus={agentStatus} wave1={WAVE_1} wave2={WAVE_2} wave3={WAVE_3} events={events} />
          </div>
          <RecommendationCard recommendation={recommendation} onApply={handleApply} loading={applying} />
        </div>
      )}

      {/* ── DONE ───────────────────────────────────────────────── */}
      {phase === 'done' && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{
            width: 72, height: 72, background: `${PL.mint}18`,
            borderRadius: '50%', margin: '0 auto 20px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: 36,
          }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: PL.green, marginBottom: 8 }}>Payment Successful</h2>
          <p style={{ color: PL.mint, fontSize: 15, fontWeight: 600 }}>
            Smart Apply saved you ₹{((recommendation?.net_saving_paise || 0) / 100).toFixed(0)}
          </p>
        </div>
      )}

      {/* ── ABANDONED — Layer 2 ────────────────────────────────── */}
      {phase === 'abandoned' && (
        <div>
          <div style={{
            border: `1.5px solid ${PL.yellow}50`, borderRadius: 14,
            padding: 18, marginBottom: 16, background: `${PL.yellow}08`,
          }}>
            <p style={{ fontWeight: 700, color: PL.yellow, fontSize: 14, marginBottom: 4 }}>⚠️ Checkout Abandoned</p>
            <p style={{ fontSize: 12, color: PL.muted }}>Layer 2 recovery pipeline running...</p>
          </div>

          {!recovery && (
            <div style={{ ...cardStyle }}>
              <p style={{ fontSize: 13, color: PL.muted, textAlign: 'center' }}>
                🔍 Diagnosis Agent analysing abandonment signals...
              </p>
            </div>
          )}

          {recovery && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <DiagnosisPanel recovery={recovery} />
              <NudgePreview recovery={recovery} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
