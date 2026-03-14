import { useState, useEffect, useRef } from 'react'
import { getStats, getSessions, getAbandonmentLogs, getRecoveryLogs, getRecoveryRules, getRecoveryMetrics } from '../api/checkout'
import { DiagnosisPanel, NudgePreview } from '../components/Abandonment/DiagnosisPanel'
import { BarChart3, Shield, Bell, FileText, Activity } from 'lucide-react'

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
  error:  '#DC2626',
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [backendDown, setBackendDown] = useState(false)
  const consecutiveFailures = useRef(0)

  /* ── New state for insights DB data ──────────────────── */
  const [abandonmentLogs, setAbandonmentLogs] = useState([])
  const [recoveryLogs, setRecoveryLogs] = useState([])
  const [recoveryRules, setRecoveryRules] = useState([])
  const [recoveryMetrics, setRecoveryMetrics] = useState(null)
  const [activeTab, setActiveTab] = useState('sessions') // sessions | abandonment | recovery | rules | metrics

  useEffect(() => {
    const loadData = async () => {
      if (consecutiveFailures.current >= 3) return
      try {
        const [s, sess, aLogs, rLogs, rules, metrics] = await Promise.all([
          getStats(),
          getSessions(),
          getAbandonmentLogs().catch(() => ({ abandonment_logs: [] })),
          getRecoveryLogs().catch(() => ({ recovery_logs: [] })),
          getRecoveryRules().catch(() => ({ recovery_rules: [] })),
          getRecoveryMetrics().catch(() => null),
        ])
        setStats(s)
        setSessions(sess.sessions || [])
        setAbandonmentLogs(aLogs.abandonment_logs || [])
        setRecoveryLogs(rLogs.recovery_logs || [])
        setRecoveryRules(rules.recovery_rules || [])
        setRecoveryMetrics(metrics)
        consecutiveFailures.current = 0
        setBackendDown(false)
      } catch (e) {
        consecutiveFailures.current += 1
        if (consecutiveFailures.current === 1) {
          setStats({ total_sessions: 12, completed: 7, abandoned: 4, recovered: 2, abandonment_rate: 33.3, recovery_rate: 50 })
          setSessions([])
        }
        if (consecutiveFailures.current >= 3) {
          setBackendDown(true)
          console.warn('[Dashboard] Backend unreachable — polling paused.')
        }
      }
      setLoading(false)
    }
    loadData()
    const t = setInterval(loadData, 5000)
    return () => clearInterval(t)
  }, [])

  const STATUS_COLORS = {
    COMPLETED: PL.mint, ABANDONED: PL.yellow, RECOVERY_CRAFTED: PL.violet,
    ANALYSING: PL.blue, RECOMMENDATION_READY: PL.teal, CREATED: PL.muted,
    PAYMENT_INITIATED: PL.blue,
  }

  const cardStyle = {
    background: PL.white, border: `1px solid ${PL.border}`,
    borderRadius: 14, overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,51,35,0.06)',
  }

  const tabBtn = (id, label, icon) => (
    <button key={id} onClick={() => setActiveTab(id)} style={{
      padding: '9px 16px', fontSize: 12, fontWeight: activeTab === id ? 700 : 500,
      color: activeTab === id ? PL.green : PL.muted,
      background: activeTab === id ? `${PL.mint}18` : 'transparent',
      border: `1px solid ${activeTab === id ? PL.mint + '40' : PL.border}`,
      borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
      transition: 'all 0.15s',
    }}>
      {icon} {label}
    </button>
  )

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 1080, margin: '0 auto', padding: '28px 16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <div style={{ width: 36, height: 36, background: PL.green, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <BarChart3 size={18} color={PL.mint} />
        </div>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: PL.green }}>Merchant Dashboard</h1>
          <p style={{ fontSize: 11, color: PL.muted, margin: 0, fontWeight: 500 }}>Real-time checkout analytics & recovery insights</p>
        </div>
        <span style={{
          marginLeft: 'auto', fontSize: 10, fontWeight: 700,
          background: backendDown ? `${PL.yellow}18` : `${PL.mint}18`,
          color: backendDown ? PL.yellow : PL.green,
          padding: '4px 12px', borderRadius: 20,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ width: 6, height: 6, background: backendDown ? PL.yellow : PL.mint, borderRadius: '50%', display: 'inline-block' }} />
          {backendDown ? 'Backend offline' : 'Live · 5s refresh'}
        </span>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
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
              <p style={{ fontSize: 10, color: PL.muted, marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Recovery Metrics Row ──────────────────────────────── */}
      {recoveryMetrics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Nudges Sent',     value: recoveryMetrics.total_nudges_sent || 0,  color: PL.violet },
            { label: 'Links Clicked',   value: recoveryMetrics.nudges_clicked || 0,     color: PL.blue },
            { label: 'Converted',       value: recoveryMetrics.nudges_converted || 0,   color: PL.mint },
            { label: 'Conversion Rate', value: `${recoveryMetrics.conversion_rate || 0}%`, color: PL.teal },
          ].map((s, i) => (
            <div key={i} style={{
              background: `${s.color}08`, border: `1px solid ${s.color}20`,
              borderRadius: 14, padding: '14px 16px', textAlign: 'center',
            }}>
              <p style={{ fontSize: 10, color: PL.muted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab Navigation ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabBtn('sessions', 'Live Sessions', <Activity size={13} />)}
        {tabBtn('abandonment', `Abandonment Logs (${abandonmentLogs.length})`, <Shield size={13} />)}
        {tabBtn('recovery', `Recovery Logs (${recoveryLogs.length})`, <Bell size={13} />)}
        {tabBtn('rules', `Recovery Rules (${recoveryRules.length})`, <FileText size={13} />)}
      </div>

      {/* ── Tab Content ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>

        {/* ─── SESSIONS TAB ─── */}
        {activeTab === 'sessions' && (
          <>
            <div style={cardStyle}>
              <div style={{ background: PL.green, padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: PL.mint }}>Live Sessions</p>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{sessions.length} total</span>
              </div>
              {loading && <p style={{ padding: 18, fontSize: 12, color: PL.muted }}>Loading...</p>}
              {!loading && sessions.length === 0 && (
                <p style={{ padding: 18, fontSize: 12, color: PL.muted }}>No sessions yet. Open checkout demo.</p>
              )}
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                {sessions.map(s => {
                  const isSelected = selectedSession?.session_id === s.session_id
                  return (
                    <div key={s.session_id} onClick={() => setSelectedSession(s)} style={{
                      padding: '13px 18px', borderBottom: `1px solid ${PL.border}`,
                      cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: isSelected ? `${PL.mint}12` : PL.white, transition: 'background 0.15s',
                    }}
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = `${PL.green}05` }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = PL.white }}
                    >
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: PL.green }}>{s.session_id?.slice(0, 8)}...</p>
                        <p style={{ fontSize: 11, color: PL.muted, margin: '3px 0 0' }}>₹{(s.amount_paise / 100).toLocaleString('en-IN')}</p>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                        background: `${STATUS_COLORS[s.status] || PL.muted}18`,
                        color: STATUS_COLORS[s.status] || PL.muted,
                      }}>{s.status}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Session detail */}
            <div style={cardStyle}>
              <div style={{ background: PL.green, padding: '13px 18px' }}>
                <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: PL.mint }}>
                  {selectedSession ? `Session ${selectedSession.session_id?.slice(0, 8)}...` : 'Select a session'}
                </p>
              </div>
              <div style={{ padding: 18 }}>
                {!selectedSession && (
                  <p style={{ fontSize: 12, color: PL.muted, textAlign: 'center', padding: '32px 0' }}>Click a session to view details</p>
                )}
                {selectedSession?.recovery && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: PL.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recovery Diagnosis</p>
                      <DiagnosisPanel recovery={selectedSession.recovery} />
                    </div>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: PL.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recovery Nudge</p>
                      <NudgePreview recovery={selectedSession.recovery} />
                    </div>
                  </div>
                )}
                {selectedSession && !selectedSession.recovery && (
                  <div style={{ padding: '16px 0' }}>
                    <p style={{ fontSize: 12, color: PL.muted }}>
                      Status: <span style={{ fontWeight: 700, color: PL.green }}>{selectedSession.status}</span>
                    </p>
                    {selectedSession.cart_items?.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: PL.muted, marginBottom: 6, textTransform: 'uppercase' }}>Cart Items</p>
                        {selectedSession.cart_items.map((item, i) => (
                          <p key={i} style={{ fontSize: 12, color: PL.green, margin: '3px 0' }}>
                            • {item.name} × {item.quantity} — ₹{((item.price_paise || item.price) / 100).toLocaleString('en-IN')}
                          </p>
                        ))}
                      </div>
                    )}
                    {selectedSession.recommendation && (
                      <div style={{
                        marginTop: 12, background: `${PL.mint}12`,
                        borderRadius: 10, padding: '12px 14px', border: `1px solid ${PL.mint}30`,
                      }}>
                        <span style={{ color: PL.green, fontWeight: 600, fontSize: 13 }}>
                          ✓ Smart Apply — saving ₹{(selectedSession.recommendation.net_saving_paise / 100).toFixed(0)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ─── ABANDONMENT LOGS TAB ─── */}
        {activeTab === 'abandonment' && (
          <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
            <div style={{ background: PL.green, padding: '13px 18px' }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: PL.yellow }}>
                🛡️ Abandonment Logs ({abandonmentLogs.length})
              </p>
            </div>
            {abandonmentLogs.length === 0 && (
              <p style={{ padding: 24, fontSize: 12, color: PL.muted, textAlign: 'center' }}>No abandonment events recorded yet.</p>
            )}
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {abandonmentLogs.map((log, i) => (
                <div key={i} style={{ padding: '14px 18px', borderBottom: `1px solid ${PL.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: `${PL.yellow}15`, color: PL.yellow,
                      }}>{log.cause || 'unknown'}</span>
                      <span style={{ fontSize: 11, color: PL.muted }}>
                        Session: {log.session_id?.slice(0, 8)}...
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: PL.muted }}>
                      Confidence: <strong>{Math.round((log.confidence || 0) * 100)}%</strong>
                    </span>
                  </div>
                  {log.evidence?.length > 0 && (
                    <div style={{ paddingLeft: 4 }}>
                      {log.evidence.map((e, j) => (
                        <p key={j} style={{ fontSize: 11, color: PL.green, margin: '2px 0', lineHeight: 1.5 }}>• {e}</p>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: 10, color: PL.muted, margin: '6px 0 0' }}>{log.timestamp}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── RECOVERY LOGS TAB ─── */}
        {activeTab === 'recovery' && (
          <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
            <div style={{ background: PL.green, padding: '13px 18px' }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: PL.violet }}>
                🔔 Recovery Logs ({recoveryLogs.length})
              </p>
            </div>
            {recoveryLogs.length === 0 && (
              <p style={{ padding: 24, fontSize: 12, color: PL.muted, textAlign: 'center' }}>No recovery nudges sent yet.</p>
            )}
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {recoveryLogs.map((log, i) => (
                <div key={i} style={{ padding: '14px 18px', borderBottom: `1px solid ${PL.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 11, color: PL.muted }}>Session: {log.session_id?.slice(0, 8)}...</span>
                      {log.suggested_method && (
                        <span style={{
                          marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px',
                          borderRadius: 20, background: `${PL.blue}15`, color: PL.blue,
                        }}>{log.suggested_method}</span>
                      )}
                    </div>
                    {log.discount_paise > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: PL.mint }}>
                        -₹{(log.discount_paise / 100).toFixed(0)} discount
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: PL.green, margin: '4px 0', lineHeight: 1.6 }}>
                    "{log.nudge_message}"
                  </p>
                  {log.recovery_link && (
                    <p style={{ fontSize: 11, color: PL.teal, margin: '4px 0' }}>🔗 {log.recovery_link}</p>
                  )}
                  <p style={{ fontSize: 10, color: PL.muted, margin: '6px 0 0' }}>{log.timestamp}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── RECOVERY RULES TAB ─── */}
        {activeTab === 'rules' && (
          <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
            <div style={{ background: PL.green, padding: '13px 18px' }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0, color: PL.teal }}>
                📋 Recovery Rules for Merchants
              </p>
            </div>
            <div style={{ padding: 18 }}>
              <p style={{ fontSize: 12, color: PL.muted, marginBottom: 16 }}>
                These rules determine how CheckoutIQ automatically responds to different abandonment causes.
              </p>
              {recoveryRules.map((rule, i) => (
                <div key={i} style={{
                  padding: '14px 16px', marginBottom: 10,
                  background: `${PL.teal}06`, border: `1px solid ${PL.teal}18`,
                  borderRadius: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: PL.green }}>{rule.rule_id}: {rule.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                      background: rule.enabled ? `${PL.mint}18` : `${PL.muted}18`,
                      color: rule.enabled ? PL.mint : PL.muted,
                    }}>{rule.enabled ? 'Active' : 'Disabled'}</span>
                  </div>
                  <p style={{ fontSize: 12, color: PL.muted, margin: '4px 0', lineHeight: 1.6 }}>{rule.description}</p>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: PL.green }}>
                      <strong>Trigger:</strong> {rule.trigger}
                    </span>
                    <span style={{ fontSize: 11, color: PL.green }}>
                      <strong>Action:</strong> {rule.action}
                    </span>
                  </div>
                </div>
              ))}
              {recoveryRules.length === 0 && (
                <p style={{ fontSize: 12, color: PL.muted, textAlign: 'center', padding: 20 }}>No recovery rules configured.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
