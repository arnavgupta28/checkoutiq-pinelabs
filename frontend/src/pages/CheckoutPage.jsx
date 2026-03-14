import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { startSession, triggerSmartApply, recordOfferChosen } from '../api/checkout'
import { triggerRecovery } from '../api/recovery'
import { useCheckoutWS } from '../hooks/useCheckoutWS'
import { useAuth } from '../context/AuthContext'
import AgentProgressBar from '../components/SmartApply/AgentProgressBar'
import RecommendationCard from '../components/SmartApply/RecommendationCard'
import { DiagnosisPanel, NudgePreview } from '../components/Abandonment/DiagnosisPanel'
import { Zap, ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react'

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

/* ── Product catalogue ───────────────────────────────── */
const PRODUCT_CATALOG = [
  { id: 'galaxy-s24',    name: 'Samsung Galaxy S24',    price: 7999900, image: '📱', category: 'Electronics' },
  { id: 'airpods-pro',   name: 'AirPods Pro 2',        price: 2499900, image: '🎧', category: 'Electronics' },
  { id: 'macbook-air',   name: 'MacBook Air M3',       price: 11499900, image: '💻', category: 'Electronics' },
  { id: 'nike-dunk',     name: 'Nike Dunk Low',        price: 899900, image: '👟', category: 'Fashion' },
  { id: 'watch-ultra',   name: 'Apple Watch Ultra 2',  price: 8999900, image: '⌚', category: 'Electronics' },
  { id: 'kindle-paper',  name: 'Kindle Paperwhite',    price: 1699900, image: '📖', category: 'Electronics' },
]

function parseName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/)
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '' }
}

const METHOD_LABELS = {
  CARD: 'Credit / Debit Card', CREDIT_EMI: 'Credit Card EMI', DEBIT_EMI: 'Debit Card EMI',
  UPI: 'UPI', WALLET: 'Wallet', NETBANKING: 'Net Banking',
}

const MODE_ICONS = {
  UPI: '📲', CARD: '💳', NET_BANKING: '🏦', EMI: '📅',
  WALLET: '👛', BRAND_WALLET: '🏪', PAY_BY_POINTS: '⭐',
  BANK_TRANSFER: '🏛️', OTHERS: '➕',
}

function PaymentModesGrid({ modes, recommended, selectable, selectedMode, onSelectMode }) {
  if (!modes?.length) return null
  const bestSaving = Math.max(...modes.filter(m => m.available).map(m => m.best_saving_paise || 0))
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: PL.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Payment Methods — {selectable ? 'Select a method or use Smart Apply' : 'Offers & Availability'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {modes.map(mode => {
          const isRecommended = recommended && (
            mode.mode === recommended ||
            (recommended === 'CREDIT_EMI' && mode.mode === 'EMI') ||
            (recommended === 'DEBIT_EMI' && mode.mode === 'EMI')
          )
          const isAlt = !isRecommended && mode.available && mode.best_saving_paise > 0 && mode.best_saving_paise === bestSaving && bestSaving > 0
          const isNA = !mode.available
          const isSelected = selectable && selectedMode === mode.mode
          return (
            <div key={mode.mode}
              onClick={() => selectable && mode.available && onSelectMode?.(isSelected ? null : mode.mode)}
              style={{
                borderRadius: 10, padding: '10px 8px',
                border: `1.5px solid ${isSelected ? PL.violet : isRecommended ? PL.mint : PL.border}`,
                background: isSelected ? `${PL.violet}12` : isRecommended ? `${PL.mint}15` : isNA ? `${PL.green}03` : PL.white,
                opacity: isNA ? 0.5 : 1,
                position: 'relative', overflow: 'hidden',
                cursor: selectable && mode.available ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}>
              {isRecommended && (
                <div style={{ position: 'absolute', top: 0, right: 0, background: PL.mint, color: PL.green, fontSize: 8, fontWeight: 800, padding: '2px 6px', borderBottomLeftRadius: 6 }}>BEST</div>
              )}
              {isAlt && (
                <div style={{ position: 'absolute', top: 0, right: 0, background: PL.yellow, color: '#fff', fontSize: 8, fontWeight: 800, padding: '2px 6px', borderBottomLeftRadius: 6 }}>ALT</div>
              )}
              {selectable && mode.available && (
                <div style={{
                  position: 'absolute', top: 6, left: 6,
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${isSelected ? PL.violet : PL.border}`,
                  background: isSelected ? PL.violet : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: PL.white }} />}
                </div>
              )}
              <div style={{ fontSize: 18, marginBottom: 3 }}>{MODE_ICONS[mode.mode] || '💳'}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: PL.green, marginBottom: 2, lineHeight: 1.2 }}>{mode.label}</div>
              <div style={{ fontSize: 9, color: mode.best_offer_pct > 0 ? PL.teal : PL.muted, fontWeight: mode.best_offer_pct > 0 ? 600 : 400, lineHeight: 1.3 }}>
                {mode.best_offer_label || (isNA ? 'Not available' : '—')}
              </div>
              {mode.best_saving_paise > 0 && (
                <div style={{ fontSize: 9, color: PL.mint, fontWeight: 700, marginTop: 2 }}>Save ₹{(mode.best_saving_paise / 100).toFixed(0)}</div>
              )}
              {mode.you_pay_paise != null && mode.available && (
                <div style={{ fontSize: 8, color: PL.muted, marginTop: 2, lineHeight: 1.2 }}>
                  {mode.emi_detail
                    ? `₹${(mode.emi_detail.monthly_paise / 100).toFixed(0)}/mo × ${mode.emi_detail.tenure_months}`
                    : `Pay ₹${(mode.you_pay_paise / 100).toLocaleString('en-IN')}`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  const { user } = useAuth()
  const [phase, setPhase] = useState('cart')
  const [cart, setCart] = useState([
    { ...PRODUCT_CATALOG[0], quantity: 1 },
  ])
  const [sessionId, setSessionId] = useState(null)
  const firstCard = user?.cards?.[0]
  const [cardBin, setCardBin] = useState(firstCard?.bin ?? '401200')
  const [cardType, setCardType] = useState(firstCard?.type ?? 'CREDIT')
  const [error, setError] = useState(null)
  const [applying, setApplying] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  const [selectedCardIdx, setSelectedCardIdx] = useState(0)
  const [txnId, setTxnId] = useState(null)
  const [selectedMode, setSelectedMode] = useState(null)
  const [manualRec, setManualRec] = useState(null)

  const totalPaise = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  )
  const totalRupees = totalPaise / 100

  const { agentStatus, recommendation, recovery, events, AGENTS, WAVE_1, WAVE_2, WAVE_3 } = useCheckoutWS(sessionId)

  // Use manual recommendation if set, otherwise use WS recommendation
  // MUST be defined AFTER useCheckoutWS so 'recommendation' is in scope
  const activeRecommendation = manualRec || recommendation

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { ...product, quantity: 1 }]
    })
    setShowCatalog(false)
  }

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i
      const q = i.quantity + delta
      return q > 0 ? { ...i, quantity: q } : i
    }))
  }

  const removeItem = (id) => setCart(prev => prev.filter(i => i.id !== id))
  useEffect(() => {
    if (firstCard) {
      setCardBin(firstCard.bin)
      setCardType(firstCard.type)
    }
  }, [firstCard?.bin, firstCard?.type])

  const walletBalances = user?.wallets?.reduce((acc, w) => ({ ...acc, [w.code]: w.balance_paise }), {}) ?? { PHONEPE: 45000, PAYTM: 20000 }

  const precomputedModes = useMemo(() => {
    const walletTotal = Object.values(walletBalances).reduce((s, v) => s + v, 0)
    const hasCards = (user?.cards?.length || 0) > 0
    const hasPoints = (user?.loyalty_points?.length || 0) > 0
    return [
      { mode: 'UPI', label: 'UPI', available: true, best_offer_pct: 2.0, best_offer_label: '2% cashback', best_saving_paise: Math.round(totalPaise * 0.02), emi_detail: null },
      { mode: 'CARD', label: 'Credit/Debit Card', available: hasCards, best_offer_pct: 0, best_offer_label: hasCards ? 'Run Smart Apply to see card offers' : 'No cards linked', best_saving_paise: 0, emi_detail: null },
      { mode: 'NET_BANKING', label: 'Net Banking', available: true, best_offer_pct: 5.0, best_offer_label: '5% off on net banking', best_saving_paise: Math.round(totalPaise * 0.05), emi_detail: null },
      { mode: 'EMI', label: 'EMI', available: totalPaise >= 300000, best_offer_pct: 0, best_offer_label: totalPaise >= 300000 ? 'Run Smart Apply for EMI options' : 'Min order ₹3,000', best_saving_paise: 0, emi_detail: null },
      { mode: 'WALLET', label: 'Wallet', available: walletTotal > 0, best_offer_pct: walletTotal >= totalPaise ? 5.0 : 0, best_offer_label: walletTotal > 0 ? `₹${(walletTotal / 100).toLocaleString('en-IN')} available` : 'No wallet balance', best_saving_paise: walletTotal >= totalPaise ? Math.round(totalPaise * 0.05) : 0, emi_detail: null },
      { mode: 'BRAND_WALLET', label: 'Brand Wallet', available: false, best_offer_pct: 0, best_offer_label: 'Not configured', best_saving_paise: 0, emi_detail: null },
      { mode: 'PAY_BY_POINTS', label: 'Pay by Points', available: hasPoints, best_offer_pct: 0, best_offer_label: hasPoints ? `${user.loyalty_points[0].points} pts available` : 'No points linked', best_saving_paise: user?.loyalty_points?.[0]?.value_paise || 0, emi_detail: null },
      { mode: 'BANK_TRANSFER', label: 'Bank Transfer', available: true, best_offer_pct: 0, best_offer_label: 'No offers · NEFT/RTGS', best_saving_paise: 0, emi_detail: null },
      { mode: 'OTHERS', label: 'Others', available: true, best_offer_pct: 0, best_offer_label: 'BNPL, PayLater', best_saving_paise: 0, emi_detail: null },
    ]
  }, [user, walletBalances, totalPaise])

  // Dynamic card BIN hint from logged-in user's cards
  const cardBinHint = useMemo(() => {
    const cards = user?.cards
    if (!cards?.length) {
      return '401200 = HDFC Visa · 521234 = SBI · 421653 = Axis'
    }
    return cards.map(c => `${c.bin} = ${c.bank} ${c.network}`).join(' · ')
  }, [user?.cards])

  const handleStartSession = async () => {
    if (cart.length === 0) { setError('Add at least one item'); return }
    setError(null)
    const { first_name, last_name } = user ? parseName(user.name) : { first_name: 'Rahul', last_name: 'Sharma' }
    const customer = {
      first_name,
      last_name,
      email_id: user?.email ?? 'rahul@example.com',
      mobile_number: user?.mobile ?? '9876543210',
      country_code: '91',
    }
    try {
      const cartItems = cart.map(i => ({
        name: i.name, price_paise: i.price, quantity: i.quantity,
        image_url: null, category: i.category,
      }))
      const res = await startSession({ amount_paise: totalPaise, customer, cart_items: cartItems })
      try { localStorage.setItem('checkoutiq_customer', JSON.stringify(customer)) } catch (_) {}
      setSessionId(res.session_id)
      setPhase('paying')
    } catch (e) {
      setError('Failed to start session. Is the backend running?')
    }
  }

  const handleSmartApply = async () => {
    setManualRec(null)  // Clear any manual selection
    setSelectedMode(null)
    setPhase('analysing')
    await triggerSmartApply({
      session_id: sessionId,
      card_bin: cardBin,
      card_type: cardType,
      wallet_balances: walletBalances,
    })
  }

  useEffect(() => {
    if (recommendation && phase === 'analysing') {
      const t = setTimeout(() => setPhase('recommendation'), 100)
      return () => clearTimeout(t)
    }
  }, [recommendation, phase])

  // Save transaction to localStorage and generate ID when payment completes
  useEffect(() => {
    if (phase === 'done' && activeRecommendation && !txnId) {
      const id = `TXN-${Date.now().toString(36).toUpperCase()}`
      setTxnId(id)
      try {
        const txn = {
          id,
          timestamp: new Date().toISOString(),
          cart_items: cart.map(i => ({ name: i.name, image: i.image, price: i.price, quantity: i.quantity })),
          total_paise: totalPaise,
          saving_paise: activeRecommendation.net_saving_paise || 0,
          paid_paise: activeRecommendation.effective_amount_paise || totalPaise,
          payment_method: activeRecommendation.recommended_method || 'CARD',
          session_id: sessionId,
        }
        const prev = JSON.parse(localStorage.getItem('checkoutiq_transactions') || '[]')
        localStorage.setItem('checkoutiq_transactions', JSON.stringify([txn, ...prev].slice(0, 20)))
      } catch (_) {}
    }
    if (phase !== 'done') setTxnId(null)
  }, [phase, activeRecommendation])

  const handleApply = async () => {
    setApplying(true)
    // Record the offer chosen for popularity tracking
    if (activeRecommendation?.offer_id && sessionId) {
      try {
        await recordOfferChosen(
          activeRecommendation.offer_id,
          activeRecommendation.recommended_card_hint || 'unknown',
          activeRecommendation.net_saving_paise || 0
        )
      } catch (_) {}
    }
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
    <div style={{ maxWidth: 500, margin: '0 auto', padding: '28px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>

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
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: PL.green, margin: 0 }}>Your Cart ({cart.length})</p>
              <button onClick={() => setShowCatalog(v => !v)} style={{
                background: `${PL.mint}18`, border: `1px solid ${PL.mint}40`, borderRadius: 8,
                padding: '5px 12px', fontSize: 11, fontWeight: 700, color: PL.green,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Plus size={13} /> Add Item
              </button>
            </div>

            {cart.length === 0 && (
              <p style={{ fontSize: 13, color: PL.muted, textAlign: 'center', padding: '20px 0' }}>
                Cart is empty. Add items from the catalogue.
              </p>
            )}

            {cart.map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 0', borderBottom: `1px solid ${PL.border}`,
              }}>
                <span style={{ fontSize: 32, flexShrink: 0 }}>{item.image}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, margin: 0, fontSize: 13, color: PL.green, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                  <p style={{ color: PL.mint, fontWeight: 800, margin: '2px 0 0', fontSize: 14 }}>
                    ₹{(item.price / 100).toLocaleString('en-IN')}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => updateQty(item.id, -1)} style={{
                    width: 28, height: 28, borderRadius: 8, border: `1px solid ${PL.border}`,
                    background: PL.white, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Minus size={13} color={PL.green} /></button>
                  <span style={{ fontSize: 14, fontWeight: 700, color: PL.green, minWidth: 20, textAlign: 'center' }}>{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, 1)} style={{
                    width: 28, height: 28, borderRadius: 8, border: `1px solid ${PL.mint}`,
                    background: `${PL.mint}15`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}><Plus size={13} color={PL.green} /></button>
                  <button onClick={() => removeItem(item.id)} style={{
                    width: 28, height: 28, borderRadius: 8, border: 'none',
                    background: `${PL.yellow}12`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginLeft: 4,
                  }}><Trash2 size={13} color={PL.yellow} /></button>
                </div>
              </div>
            ))}

            {/* Total */}
            {cart.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: PL.muted }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: PL.green }}>₹{totalRupees.toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>

          {/* Product catalogue dropdown */}
          {showCatalog && (
            <div style={{ ...cardStyle, marginBottom: 16, maxHeight: 250, overflowY: 'auto' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: PL.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Browse Products</p>
              {PRODUCT_CATALOG.filter(p => !cart.find(c => c.id === p.id && c.quantity >= 5)).map(product => (
                <div key={product.id} onClick={() => addToCart(product)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
                  borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
                  borderBottom: `1px solid ${PL.border}`,
                }}
                  onMouseEnter={e => e.currentTarget.style.background = `${PL.mint}10`}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 24 }}>{product.image}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, margin: 0, color: PL.green }}>{product.name}</p>
                    <p style={{ fontSize: 11, color: PL.muted, margin: 0 }}>{product.category}</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: PL.mint }}>₹{(product.price / 100).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleStartSession}
            style={{
              width: '100%', background: PL.green, color: PL.white,
              border: 'none', borderRadius: 12, padding: '15px 0',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              opacity: cart.length === 0 ? 0.5 : 1,
              transition: 'opacity 0.2s',
            }}
            disabled={cart.length === 0}
            onMouseEnter={e => { if (cart.length) e.target.style.opacity = 0.9 }}
            onMouseLeave={e => { if (cart.length) e.target.style.opacity = 1 }}
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
            &nbsp;·&nbsp; Total: <strong style={{ color: PL.green }}>₹{totalRupees.toLocaleString('en-IN')}</strong>
          </p>

          {/* ── Card / Payment Instrument Selector ─── */}
          <div style={{ ...cardStyle, marginBottom: 16 }}>
            {user?.cards?.length > 0 ? (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: PL.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Your Cards</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {user.cards.map((card, idx) => (
                    <button key={card.id}
                      onClick={() => { setSelectedCardIdx(idx); setCardBin(card.bin); setCardType(card.type) }}
                      style={{
                        padding: '9px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        border: `2px solid ${idx === selectedCardIdx ? PL.mint : PL.border}`,
                        background: idx === selectedCardIdx ? `${PL.mint}15` : PL.white,
                        color: PL.green, transition: 'all 0.15s',
                      }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{card.bank} •••• {card.last4}</div>
                      <div style={{ fontSize: 10, color: PL.muted }}>{card.network} · {card.type}{card.reward_rate_pct ? ` · ${card.reward_rate_pct}% rewards` : ''}</div>
                    </button>
                  ))}
                </div>
                {user.upi_handles?.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${PL.border}`, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: PL.muted, fontWeight: 600 }}>UPI:</span>
                    {user.upi_handles.map(u => (
                      <span key={u.handle} style={{ fontSize: 11, color: PL.green, fontWeight: 500, background: `${PL.green}08`, padding: '2px 8px', borderRadius: 6 }}>{u.handle}</span>
                    ))}
                  </div>
                )}
                {user.net_banking?.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: PL.muted, fontWeight: 600 }}>Net Banking:</span>
                    {user.net_banking.map(nb => (
                      <span key={nb.bank} style={{ fontSize: 11, color: PL.green, fontWeight: 500, background: `${PL.green}08`, padding: '2px 8px', borderRadius: 6 }}>{nb.bank} {nb.account_type}</span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: PL.green }}>Payment Info</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: PL.muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Card BIN (first 6)</label>
                    <input value={cardBin} onChange={e => setCardBin(e.target.value)}
                      style={{ width: '100%', border: `1.5px solid ${PL.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', outline: 'none', color: PL.green }}
                      onFocus={e => e.target.style.borderColor = PL.mint}
                      onBlur={e => e.target.style.borderColor = PL.border}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: PL.muted, display: 'block', marginBottom: 5, fontWeight: 500 }}>Card Type</label>
                    <select value={cardType} onChange={e => setCardType(e.target.value)}
                      style={{ width: '100%', border: `1.5px solid ${PL.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, color: PL.green, background: PL.white, outline: 'none' }}>
                      <option value="CREDIT">Credit</option>
                      <option value="DEBIT">Debit</option>
                    </select>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: PL.muted, marginTop: 10 }}>Try: 401200 = HDFC · 521234 = SBI · 421653 = Axis</p>
              </>
            )}
          </div>

          {/* ── All payment modes with estimated offers ─── */}
          <PaymentModesGrid
            modes={precomputedModes}
            recommended={null}
            selectable={true}
            selectedMode={selectedMode}
            onSelectMode={setSelectedMode}
          />

          {selectedMode && (
            <button onClick={() => {
              // Direct pay with selected mode — skip Smart Apply
              const mode = precomputedModes.find(m => m.mode === selectedMode)
              const saving = mode?.best_saving_paise || 0
              const eff = totalPaise - saving
              const directRec = {
                recommended_method: selectedMode === 'EMI' ? 'CREDIT_EMI' : selectedMode,
                offer_id: null,
                tenure_id: null,
                net_saving_paise: saving,
                effective_amount_paise: eff,
                reason_trail: [
                  `✅ You chose ${mode?.label || selectedMode} manually`,
                  saving > 0 ? `💰 Estimated saving: ₹${(saving/100).toFixed(0)}` : '💰 No special offer on this method',
                  mode?.emi_detail ? `📅 ${mode.emi_detail.tenure_months} months × ₹${(mode.emi_detail.monthly_paise/100).toFixed(0)}/mo` : `💳 Pay ₹${(eff/100).toLocaleString('en-IN')}`,
                ],
                alternatives: [],
                source: 'manual_selection',
                mode_breakdown: precomputedModes,
              }
              setManualRec(directRec)
              setPhase('recommendation')
            }}
            style={{
              width: '100%',
              background: PL.violet,
              color: PL.white, border: 'none', borderRadius: 12, padding: '14px 0',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 4px 16px ${PL.violet}30`, transition: 'transform 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              💳 Pay with {precomputedModes.find(m => m.mode === selectedMode)?.label || selectedMode}
            </button>
          )}

          <button onClick={handleSmartApply}
            style={{
              width: '100%', background: `linear-gradient(135deg, ${PL.green}, ${PL.green}dd)`,
              color: PL.mint, border: 'none', borderRadius: 12, padding: '15px 0',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 4px 16px ${PL.green}30`, transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 24px ${PL.green}40` }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 16px ${PL.green}30` }}
          >
            <Zap size={17} fill={PL.mint} color={PL.mint} /> ⚡ Smart Apply — Best Offer Across All Modes
          </button>

          <button onClick={handleSimulateAbandonment}
            style={{
              width: '100%', background: 'transparent',
              color: PL.yellow, border: `1.5px solid ${PL.yellow}50`,
              borderRadius: 12, padding: '12px 0',
              fontSize: 13, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = `${PL.yellow}10`; e.currentTarget.style.borderColor = PL.yellow }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = `${PL.yellow}50` }}
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
            Insight Engine (instant) → 2 LLM agents → optimal recommendation
          </p>
        </div>
      )}

      {/* ── RECOMMENDATION PHASE ───────────────────────────────── */}
      {phase === 'recommendation' && (
        <div>
          {!manualRec && (
            <div style={{ ...cardStyle, marginBottom: 16 }}>
              <AgentProgressBar agentStatus={agentStatus} wave1={WAVE_1} wave2={WAVE_2} wave3={WAVE_3} events={events} />
            </div>
          )}
          {manualRec && (
            <div style={{ ...cardStyle, marginBottom: 16, background: `${PL.violet}08`, borderColor: `${PL.violet}30` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>✋</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: PL.green, margin: 0 }}>Manual Selection</p>
                  <p style={{ fontSize: 11, color: PL.muted, margin: 0 }}>You chose this payment method. Use Smart Apply for AI-optimised recommendation.</p>
                </div>
              </div>
            </div>
          )}
          {activeRecommendation?.mode_breakdown?.length > 0 && (
            <PaymentModesGrid
              modes={activeRecommendation.mode_breakdown}
              recommended={activeRecommendation.recommended_method}
            />
          )}
          <RecommendationCard recommendation={activeRecommendation} onApply={handleApply} loading={applying} totalPaise={totalPaise} />
        </div>
      )}

      {/* ── DONE ───────────────────────────────────────────────── */}
      {phase === 'done' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ width: 64, height: 64, background: `${PL.mint}18`, borderRadius: '50%', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: PL.green, marginBottom: 2 }}>Payment Successful</h2>
            <p style={{ color: PL.muted, fontSize: 11, margin: 0 }}>{new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>

          {/* Order Summary */}
          <div style={{ ...cardStyle, marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: PL.muted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Order Summary</p>
            {cart.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${PL.border}`, fontSize: 12 }}>
                <span style={{ color: PL.green }}>{item.image} {item.name} ×{item.quantity}</span>
                <span style={{ fontWeight: 600, color: PL.green }}>₹{(item.price * item.quantity / 100).toLocaleString('en-IN')}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0 3px', fontSize: 12 }}>
              <span style={{ color: PL.muted }}>Subtotal</span>
              <span style={{ color: PL.green, fontWeight: 600 }}>₹{(totalPaise / 100).toLocaleString('en-IN')}</span>
            </div>
            {(activeRecommendation?.net_saving_paise || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
                <span style={{ color: PL.teal, fontWeight: 700 }}>✦ {manualRec ? 'Savings' : 'Smart Apply savings'}</span>
                <span style={{ color: PL.teal, fontWeight: 700 }}>−₹{(activeRecommendation.net_saving_paise / 100).toFixed(0)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0 0', borderTop: `2px solid ${PL.border}`, fontSize: 15, fontWeight: 800 }}>
              <span style={{ color: PL.green }}>You Paid</span>
              <span style={{ color: PL.mint }}>₹{((activeRecommendation?.effective_amount_paise || totalPaise) / 100).toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Transaction Info */}
          <div style={{ ...cardStyle, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: PL.muted }}>Payment method</span>
              <span style={{ color: PL.green, fontWeight: 600 }}>{METHOD_LABELS[activeRecommendation?.recommended_method] || activeRecommendation?.recommended_method || 'Card'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: PL.muted }}>Transaction ID</span>
              <span style={{ color: PL.green, fontWeight: 600, fontFamily: 'monospace', fontSize: 11 }}>{txnId || '—'}</span>
            </div>
          </div>

          {(activeRecommendation?.net_saving_paise || 0) > 0 && (
            <div style={{ background: `${PL.mint}18`, border: `1px solid ${PL.mint}40`, borderRadius: 12, padding: '12px 16px', marginBottom: 14, textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: PL.green, fontWeight: 600, margin: 0 }}>
                🎉 CheckoutIQ saved you{' '}
                <span style={{ color: PL.mint, fontWeight: 900, fontSize: 17 }}>₹{(activeRecommendation.net_saving_paise / 100).toFixed(0)}</span>
                {' '}on this order!
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setPhase('cart'); setSessionId(null); setManualRec(null); setSelectedMode(null) }}
              style={{ flex: 1, background: `${PL.green}10`, border: `1px solid ${PL.border}`, borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 600, color: PL.green, cursor: 'pointer' }}>
              ← New Order
            </button>
            <Link to="/profile"
              style={{ flex: 1, background: PL.green, borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 600, color: PL.mint, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              View Profile →
            </Link>
          </div>
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
