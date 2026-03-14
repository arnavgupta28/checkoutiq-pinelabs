import { CheckCircle, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { useState } from 'react'

/* ── Pine Labs brand tokens ───────────────────────────── */
const PL = {
  green:  '#003323',
  mint:   '#50D387',
  white:  '#FFFFFF',
  blue:   '#5AE2E2',
  yellow: '#FFAA37',
  violet: '#836CF4',
  teal:   '#20D39C',
  muted:  '#003323' + '70',
  border: '#003323' + '18',
}

const METHOD_LABELS = {
  CARD: 'Credit / Debit Card',
  CREDIT_EMI: 'Credit Card EMI',
  DEBIT_EMI: 'Debit Card EMI',
  UPI: 'UPI',
  WALLET: 'Wallet',
  NETBANKING: 'Net Banking',
}

export default function RecommendationCard({ recommendation, onApply, loading, totalPaise }) {
  const [showTrail, setShowTrail] = useState(false)

  if (!recommendation) return null

  const saving = recommendation.net_saving_paise / 100
  const originalTotal = (totalPaise || (recommendation.effective_amount_paise + recommendation.net_saving_paise)) / 100
  // Guard against ₹0 display: effective should never be less than 0
  const rawEffective = recommendation.effective_amount_paise / 100
  const effective = Math.max(rawEffective, 0)
  const isEmi = ['CREDIT_EMI', 'DEBIT_EMI'].includes(recommendation.recommended_method)
  const emiDetail = recommendation.mode_breakdown?.find(m => m.mode === 'EMI')?.emi_detail
  const isFreeAfterDiscount = effective === 0 && saving > 0

  return (
    <div style={{
      border: `2px solid ${PL.mint}`,
      borderRadius: 14,
      overflow: 'hidden',
      background: PL.white,
      boxShadow: `0 4px 24px ${PL.green}12`,
    }}>
      {/* Header */}
      <div style={{
        background: PL.green,
        padding: '15px 18px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Zap size={18} color={PL.mint} fill={PL.mint} />
        <span style={{ color: PL.mint, fontWeight: 700, fontSize: 14 }}>Smart Apply Recommendation</span>
        {saving > 0 && (
          <span style={{
            marginLeft: 'auto',
            background: `${PL.mint}25`, color: PL.mint,
            borderRadius: 20, padding: '4px 12px',
            fontSize: 12, fontWeight: 700,
          }}>
            Save ₹{saving.toFixed(0)}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <p style={{ fontSize: 11, color: PL.muted, marginBottom: 3, fontWeight: 500 }}>Recommended method</p>
            <p style={{ fontSize: 17, fontWeight: 800, color: PL.green }}>
              {METHOD_LABELS[recommendation.recommended_method] || recommendation.recommended_method}
            </p>
            {recommendation.recommended_card_hint && (
              <p style={{ fontSize: 12, color: PL.muted, marginTop: 3 }}>{recommendation.recommended_card_hint}</p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            {isEmi && emiDetail ? (
              <>
                <p style={{ fontSize: 11, color: PL.muted, marginBottom: 2, fontWeight: 500 }}>Monthly payment</p>
                <p style={{ fontSize: 20, fontWeight: 900, color: PL.mint, lineHeight: 1.1 }}>
                  ₹{(emiDetail.monthly_paise / 100).toFixed(0)}<span style={{ fontSize: 12, fontWeight: 600 }}>/mo</span>
                </p>
                <p style={{ fontSize: 10, color: PL.muted, marginTop: 3 }}>
                  × {emiDetail.tenure_months} months · Total ₹{(emiDetail.total_paise / 100).toLocaleString('en-IN')}
                </p>
                <p style={{ fontSize: 10, fontWeight: 700, marginTop: 2, color: emiDetail.no_cost ? PL.teal : PL.yellow }}>
                  {emiDetail.no_cost ? '✓ No extra cost' : `+₹${(emiDetail.extra_cost_paise / 100).toFixed(0)} interest`}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 11, color: PL.muted, marginBottom: 3, fontWeight: 500 }}>
                  {isFreeAfterDiscount ? 'You pay now' : 'You pay'}
                </p>
                <p style={{ fontSize: 24, fontWeight: 900, color: PL.mint, lineHeight: 1 }}>
                  ₹{effective.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                {saving > 0 && (
                  <p style={{ fontSize: 11, color: PL.muted, textDecoration: 'line-through', marginTop: 3 }}>
                    ₹{originalTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </p>
                )}
                {isFreeAfterDiscount && (
                  <p style={{ fontSize: 10, color: PL.teal, fontWeight: 700, marginTop: 3 }}>
                    100% instant discount applied
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Reason trail toggle */}
        <button
          onClick={() => setShowTrail(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: `${PL.green}06`, border: `1px solid ${PL.border}`,
            borderRadius: 10, padding: '9px 14px', cursor: 'pointer',
            fontSize: 12, color: PL.green, width: '100%', marginBottom: 16,
            fontWeight: 600, transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = `${PL.green}0c`}
          onMouseLeave={e => e.currentTarget.style.background = `${PL.green}06`}
        >
          <CheckCircle size={14} color={PL.mint} />
          <span>Why was this chosen?</span>
          {showTrail ? <ChevronUp size={14} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto' }} />}
        </button>

        {showTrail && (
          <div style={{
            background: `${PL.mint}10`, border: `1px solid ${PL.mint}30`,
            borderRadius: 10, padding: '14px 16px', marginBottom: 16,
          }}>
            {(recommendation.reason_trail || []).map((reason, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: i < recommendation.reason_trail.length - 1 ? 8 : 0 }}>
                <span style={{ color: PL.mint, fontSize: 12, marginTop: 1, flexShrink: 0 }}>✓</span>
                <p style={{ fontSize: 12, color: PL.green, lineHeight: 1.6, margin: 0 }}>{reason}</p>
              </div>
            ))}
          </div>
        )}

        {/* Alternatives */}
        {recommendation.alternatives?.length > 0 && (
          <p style={{ fontSize: 11, color: PL.muted, marginBottom: 16 }}>
            Also considered: {recommendation.alternatives.map(a => a.method || a).join(', ')}
          </p>
        )}

        {/* Per-mode cost breakdown — shows what you pay with each method */}
        {recommendation.mode_breakdown?.filter(m => m.available && (m.best_saving_paise > 0 || m.emi_detail)).length > 0 && (
          <div style={{
            background: `${PL.green}04`, border: `1px solid ${PL.border}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 16,
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: PL.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Compare — what you pay per method
            </p>
            {recommendation.mode_breakdown.filter(m => m.available && (m.best_saving_paise > 0 || m.emi_detail)).map(mode => {
              const isRec = mode.mode === recommendation.recommended_method ||
                (['CREDIT_EMI', 'DEBIT_EMI'].includes(recommendation.recommended_method) && mode.mode === 'EMI')
              const youPay = mode.you_pay_paise != null ? mode.you_pay_paise : (totalPaise || (recommendation.effective_amount_paise + recommendation.net_saving_paise)) - (mode.best_saving_paise || 0)
              return (
                <div key={mode.mode} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 0', borderBottom: `1px solid ${PL.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isRec && <span style={{ fontSize: 8, background: PL.mint, color: PL.green, padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>BEST</span>}
                    <span style={{ fontSize: 11, fontWeight: isRec ? 700 : 500, color: PL.green }}>{mode.label}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {mode.emi_detail ? (
                      <span style={{ fontSize: 11, color: PL.green, fontWeight: 600 }}>
                        ₹{(mode.emi_detail.monthly_paise / 100).toFixed(0)}/mo × {mode.emi_detail.tenure_months}
                        <span style={{ fontSize: 9, color: PL.muted, marginLeft: 4 }}>
                          (total ₹{(mode.emi_detail.total_paise / 100).toLocaleString('en-IN')})
                        </span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 600, color: isRec ? PL.mint : PL.green }}>
                        ₹{(youPay / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        {mode.best_saving_paise > 0 && (
                          <span style={{ fontSize: 9, color: PL.teal, marginLeft: 4 }}>
                            save ₹{(mode.best_saving_paise / 100).toFixed(0)}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Apply button */}
        <button
          onClick={onApply}
          disabled={loading}
          style={{
            width: '100%', padding: '14px 0',
            background: loading ? PL.muted : PL.green,
            color: loading ? PL.white : PL.mint,
            border: 'none', borderRadius: 12,
            fontSize: 15, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: loading ? 'none' : `0 4px 16px ${PL.green}30`,
          }}
        >
          {loading ? 'Applying...' : '⚡ Smart Apply & Pay'}
        </button>
      </div>
    </div>
  )
}
