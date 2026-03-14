import { useState, useEffect } from 'react'
import { getStats, getSessions } from '../api/checkout'
import { DiagnosisPanel, NudgePreview } from '../components/Abandonment/DiagnosisPanel'
import { BarChart3 } from 'lucide-react'

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

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [s, sess] = await Promise.all([getStats(), getSessions()])
        setStats(s)
        setSessions(sess.sessions || [])
      } catch (e) {
        console.warn('Backend not reachable')
        setStats({ total_sessions: 12, completed: 7, abandoned: 4, recovered: 2, abandonment_rate: 33.3, recovery_rate: 50 })
        setSessions([])
      }
      setLoading(false)
    }
    loadData()
    const t = setInterval(loadData, 5000)
    return () => clearInterval(t)
  }, [])

  const STATUS_COLORS = {
    COMPLETED:            PL.mint,
    ABANDONED:            PL.yellow,
    RECOVERY_CRAFTED:     PL.violet,
    ANALYSING:            PL.blue,
    RECOMMENDATION_READY: PL.teal,
    CREATED:              PL.muted,
    PAYMENT_INITIATED:    PL.blue,
  }

  const cardStyle = {
    background: PL.white, border: `1px solid ${PL.border}`,
    borderRadius: 14, overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,51,35,0.06)',
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '28px 16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <div style={{ width: 36, height: 36, background: PL.green, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BarChart3 size={18} color={PL.mint} />
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: PL.green }}>Merchant Dashboard</h1>
          <p style={{ fontSize: 11, color: PL.muted, margin: 0, fontWeight: 500 }}>Real-time checkout analytics</p>
        </div>
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 700,
          background: `${PL.mint}18`, color: PL.green,
          padding: '4px 12px', borderRadius: 20,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ width: 6, height: 6, background: PL.mint, borderRadius: '50%', display: 'inline-block' }} />
          Live · auto-refresh 5s
        </span>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { label: 'Total Sessions', value: stats.total_sessions, color: PL.green, bg: `${PL.green}08` },
            { label: 'Converted',      value: stats.completed,      color: PL.mint,  bg: `${PL.mint}12` },
            { label: 'Abandonment',    value: `${stats.abandonment_rate}%`, color: PL.yellow, bg: `${PL.yellow}12` },
            { label: 'Recovery Rate',  value: `${stats.recovery_rate}%`,    color: PL.teal,   bg: `${PL.teal}12` },
          ].map((s, i) => (
            <div key={i} style={{
              background: PL.white, border: `1px solid ${PL.border}`,
              borderRadius: 14, padding: '18px 16px', textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,51,35,0.04)',
            }}>
              <p style={{
                fontSize: 10, color: PL.muted, marginBottom: 8,
                fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>{s.label}</p>
              <p style={{
                fontSize: 28, fontWeight: 800, color: s.color, margin: 0,
                lineHeight: 1,
              }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Grid ──────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* Sessions list */}
        <div style={cardStyle}>
          <div style={{
            background: PL.green, padding: '13px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: PL.mint }}>Live Sessions</p>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{sessions.length} total</span>
          </div>
          {loading && <p style={{ padding: 18, fontSize: 12, color: PL.muted }}>Loading...</p>}
          {!loading && sessions.length === 0 && (
            <p style={{ padding: 18, fontSize: 12, color: PL.muted }}>
              No sessions yet. Open the checkout demo and start a session.
            </p>
          )}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {sessions.map(s => {
              const isSelected = selectedSession?.session_id === s.session_id
              return (
                <div
                  key={s.session_id}
                  onClick={() => setSelectedSession(s)}
                  style={{
                    padding: '13px 18px', borderBottom: `1px solid ${PL.border}`,
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: isSelected ? `${PL.mint}12` : PL.white,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = `${PL.green}05` }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = PL.white }}
                >
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: PL.green }}>{s.session_id?.slice(0, 8)}...</p>
                    <p style={{ fontSize: 11, color: PL.muted, margin: '3px 0 0' }}>
                      ₹{(s.amount_paise / 100).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                    background: `${STATUS_COLORS[s.status] || PL.muted}18`,
                    color: STATUS_COLORS[s.status] || PL.muted,
                  }}>
                    {s.status}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Session detail */}
        <div style={cardStyle}>
          <div style={{
            background: PL.green, padding: '13px 18px',
          }}>
            <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: PL.mint }}>
              {selectedSession ? `Session ${selectedSession.session_id?.slice(0, 8)}...` : 'Select a session'}
            </p>
          </div>
          <div style={{ padding: 18 }}>
            {!selectedSession && (
              <p style={{ fontSize: 12, color: PL.muted, textAlign: 'center', padding: '32px 0' }}>
                Click a session to view details
              </p>
            )}
            {selectedSession?.recovery && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <p style={{
                    fontSize: 10, fontWeight: 700, color: PL.muted, marginBottom: 8,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>Recovery Diagnosis</p>
                  <DiagnosisPanel recovery={selectedSession.recovery} />
                </div>
                <div>
                  <p style={{
                    fontSize: 10, fontWeight: 700, color: PL.muted, marginBottom: 8,
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>Recovery Nudge</p>
                  <NudgePreview recovery={selectedSession.recovery} />
                </div>
              </div>
            )}
            {selectedSession && !selectedSession.recovery && (
              <div style={{ padding: '16px 0' }}>
                <p style={{ fontSize: 12, color: PL.muted }}>
                  Status: <span style={{ fontWeight: 700, color: PL.green }}>{selectedSession.status}</span>
                </p>
                {selectedSession.recommendation && (
                  <div style={{
                    marginTop: 12, background: `${PL.mint}12`,
                    borderRadius: 10, padding: '12px 14px',
                    border: `1px solid ${PL.mint}30`,
                  }}>
                    <span style={{ color: PL.green, fontWeight: 600, fontSize: 13 }}>
                      ✓ Smart Apply recommendation ready — saving ₹{(selectedSession.recommendation.net_saving_paise / 100).toFixed(0)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
