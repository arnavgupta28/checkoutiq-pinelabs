import { useEffect, useRef, useState, useCallback } from 'react'

export function useCheckoutWS(sessionId) {
  const [events, setEvents] = useState([])
  const [recommendation, setRecommendation] = useState(null)
  const [recovery, setRecovery] = useState(null)
  const [agentStatus, setAgentStatus] = useState({})
  const wsRef = useRef(null)

  const AGENTS = ['card_agent', 'offer_agent', 'emi_agent', 'wallet_agent', 'conflict_resolver', 'decision_agent']

  useEffect(() => {
    if (!sessionId) return
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${wsProto}://${window.location.host}/ws/checkout/${sessionId}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      setEvents(prev => [...prev, msg])

      if (msg.type === 'agent_start') {
        setAgentStatus(prev => ({ ...prev, [msg.agent]: 'running' }))
      }
      if (msg.type === 'agent_complete') {
        setAgentStatus(prev => ({ ...prev, [msg.agent]: 'done' }))
      }
      if (msg.type === 'recommendation_ready') {
        // Mark all agents done
        const allDone = {}
        AGENTS.forEach(a => { allDone[a] = 'done' })
        setAgentStatus(allDone)
        setRecommendation(msg.data)
      }
      if (msg.type === 'recovery_ready') {
        setRecovery(msg.data)
      }
    }

    ws.onerror = (e) => console.warn('WS error', e)

    return () => ws.close()
  }, [sessionId])

  const sendSignals = useCallback((signals) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'behavioral_signals', data: signals }))
    }
  }, [])

  return { events, recommendation, recovery, agentStatus, sendSignals, AGENTS }
}
