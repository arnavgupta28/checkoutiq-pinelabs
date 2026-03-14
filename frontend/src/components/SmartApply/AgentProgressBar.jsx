import { CheckCircle, Loader, Circle } from 'lucide-react'

/* ── Pine Labs palette mapped to agent roles ────────── */
const AGENT_LABELS = {
  card_agent:        'Card Selection',
  offer_agent:       'Offer Eligibility',
  emi_agent:         'EMI Analysis',
  wallet_agent:      'Wallet Optimisation',
  conflict_resolver: 'Conflict Resolution',
  decision_agent:    'Final Decision',
}

const AGENT_COLORS = {
  card_agent:        '#50D387',  // Pine Labs Mint
  offer_agent:       '#836CF4',  // Violet
  emi_agent:         '#5AE2E2',  // Blue
  wallet_agent:      '#20D39C',  // Teal Green
  conflict_resolver: '#FFAA37',  // Yellow
  decision_agent:    '#003323',  // Pine Labs Green (final)
}

const PL = { green: '#003323', mint: '#50D387', muted: '#003323' + '70', border: '#003323' + '18' }

export default function AgentProgressBar({ agentStatus, agents }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 0' }}>
      <p style={{
        fontSize: 10, color: PL.muted, marginBottom: 4,
        fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        Agent Pipeline
      </p>
      {agents.map((agent, idx) => {
        const status = agentStatus[agent] || 'waiting'
        const color = AGENT_COLORS[agent]
        return (
          <div key={agent} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Status icon */}
            <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {status === 'done' && <CheckCircle size={18} color={color} />}
              {status === 'running' && (
                <Loader size={18} color={color} style={{ animation: 'spin 1s linear infinite' }} />
              )}
              {status === 'waiting' && <Circle size={18} color={PL.border} />}
            </div>

            {/* Label + bar */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{
                  fontSize: 13, fontWeight: status === 'running' ? 700 : 500,
                  color: status === 'waiting' ? PL.muted : PL.green,
                }}>
                  {AGENT_LABELS[agent]}
                </span>
                {status === 'running' && (
                  <span style={{ fontSize: 11, color: color, fontWeight: 700 }}>Running...</span>
                )}
                {status === 'done' && (
                  <span style={{ fontSize: 11, color: PL.mint, fontWeight: 700 }}>Done</span>
                )}
              </div>
              <div style={{
                height: 5, background: `${PL.green}0a`,
                borderRadius: 3, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: status === 'done'
                    ? `linear-gradient(90deg, ${color}, ${PL.mint})`
                    : color,
                  width: status === 'done' ? '100%' : status === 'running' ? '60%' : '0%',
                  transition: 'width 0.6s ease',
                  animation: status === 'running' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                }} />
              </div>
            </div>
          </div>
        )
      })}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>
    </div>
  )
}
