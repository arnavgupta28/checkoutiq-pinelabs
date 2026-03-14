import { AlertCircle, MessageCircle, ExternalLink } from 'lucide-react'

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

/* Each cause maps to a SINGLE secondary colour (brand guideline: one at a time) */
const CAUSE_COPY = {
  price_sensitivity:  { label: 'Price Sensitivity',   color: PL.yellow, bg: `${PL.yellow}10`, icon: '💰' },
  payment_friction:   { label: 'Payment Friction',    color: PL.yellow, bg: `${PL.yellow}10`, icon: '🔒' },
  offer_confusion:    { label: 'Offer Confusion',     color: PL.violet, bg: `${PL.violet}10`, icon: '🎁' },
  emi_complexity:     { label: 'EMI Complexity',       color: PL.blue,   bg: `${PL.blue}10`,   icon: '📊' },
  trust_concern:      { label: 'Trust Concern',        color: PL.green,  bg: `${PL.green}08`,  icon: '🛡️' },
  technical_error:    { label: 'Technical Error',      color: PL.yellow, bg: `${PL.yellow}10`, icon: '⚠️' },
  unknown:            { label: 'Analysing...',          color: PL.muted,  bg: `${PL.green}05`,  icon: '🔍' },
}

export function DiagnosisPanel({ recovery }) {
  if (!recovery) return (
    <div style={{ padding: 24, textAlign: 'center', color: PL.muted }}>
      <AlertCircle size={28} style={{ marginBottom: 8, opacity: 0.3 }} />
      <p style={{ fontSize: 13 }}>No diagnosis yet</p>
    </div>
  )

  const cause = CAUSE_COPY[recovery.primary_cause] || CAUSE_COPY.unknown
  const confidence = Math.round((recovery.confidence || 0) * 100)

  return (
    <div style={{
      background: cause.bg, border: `1px solid ${cause.color}25`,
      borderRadius: 12, padding: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 24 }}>{cause.icon}</span>
        <div>
          <p style={{ fontSize: 10, color: PL.muted, margin: 0, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Drop-off cause</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: cause.color, margin: 0 }}>{cause.label}</p>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: PL.muted, margin: 0, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Confidence</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: cause.color, margin: 0 }}>{confidence}%</p>
        </div>
      </div>

      {recovery.diagnosis_evidence?.length > 0 && (
        <div style={{ borderTop: `1px solid ${cause.color}15`, paddingTop: 12 }}>
          <p style={{ fontSize: 10, color: PL.muted, marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Evidence signals</p>
          {recovery.diagnosis_evidence.map((e, i) => (
            <p key={i} style={{ fontSize: 12, color: PL.green, margin: '3px 0', lineHeight: 1.5 }}>• {e}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export function NudgePreview({ recovery }) {
  if (!recovery?.nudge_message) return null

  const saving = recovery.discount_applied_paise
    ? `₹${recovery.discount_applied_paise / 100} off applied`
    : null

  return (
    <div style={{
      background: PL.white, border: `1px solid ${PL.border}`,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: `0 2px 8px ${PL.green}08`,
    }}>
      {/* Mock phone notification header */}
      <div style={{
        background: PL.green, padding: '11px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ width: 8, height: 8, background: PL.mint, borderRadius: '50%' }} />
        <span style={{ color: `${PL.white}80`, fontSize: 11, fontWeight: 500 }}>Push notification preview</span>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
          <MessageCircle size={16} color={PL.mint} style={{ marginTop: 1, flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: PL.green, lineHeight: 1.7, margin: 0, fontWeight: 500 }}>
            {recovery.nudge_message}
          </p>
        </div>

        {saving && (
          <div style={{
            background: `${PL.mint}12`, borderRadius: 8,
            padding: '8px 12px', marginBottom: 14,
            border: `1px solid ${PL.mint}25`,
          }}>
            <p style={{ fontSize: 12, color: PL.green, margin: 0, fontWeight: 600 }}>🎁 {saving} for this recovery</p>
          </div>
        )}

        {recovery.recovery_link && (
          <a
            href={recovery.recovery_link}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: PL.green, color: PL.mint, textDecoration: 'none',
              borderRadius: 10, padding: '12px 0', fontSize: 13, fontWeight: 700,
              boxShadow: `0 2px 12px ${PL.green}25`,
              transition: 'opacity 0.2s',
            }}
          >
            Open Recovery Link <ExternalLink size={13} />
          </a>
        )}
        {!recovery.recovery_link && (
          <div style={{
            background: `${PL.green}06`, borderRadius: 10,
            padding: '12px 0', textAlign: 'center',
            fontSize: 12, color: PL.muted, fontWeight: 500,
          }}>
            Generating Pine Labs pay-by-link...
          </div>
        )}
      </div>
    </div>
  )
}
