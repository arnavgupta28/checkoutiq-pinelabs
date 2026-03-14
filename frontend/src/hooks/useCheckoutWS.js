import { useEffect, useRef, useState, useCallback } from 'react'

export function useCheckoutWS(sessionId) {
  const [events, setEvents] = useState([])
  const [recommendation, setRecommendation] = useState(null)
  const [recovery, setRecovery] = useState(null)
  const [agentStatus, setAgentStatus] = useState({})
  const wsRef = useRef(null)

  // Agent groups for UI organization
  const AGENTS = ['card_agent', 'offer_agent', 'emi_agent', 'wallet_agent', 'conflict_resolver', 'decision_agent']
  const WAVE_1 = ['card_agent', 'offer_agent', 'emi_agent', 'wallet_agent']  // Parallel
  const WAVE_2 = ['conflict_resolver']                                        // Sequential
  const WAVE_3 = ['decision_agent']                                           // Sequential

  useEffect(() => {
    if (!sessionId) return
    const apiUrl = import.meta.env.VITE_API_URL
    let wsHost
    if (apiUrl) {
      // Production: point WS directly at backend server
      wsHost = apiUrl.replace(/^https/, 'wss').replace(/^http/, 'ws')
    } else {
      // Dev: Vite proxy forwards /ws → localhost:8000
      const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      wsHost = `${wsProto}://${window.location.host}`
    }
    const ws = new WebSocket(`${wsHost}/ws/checkout/${sessionId}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      setEvents(prev => [...prev, msg])

      // Map backend status to UI status
      if (msg.type === 'agent_running') {
        setAgentStatus(prev => ({ ...prev, [msg.agent]: 'running' }))
      }
      if (msg.type === 'agent_completed') {
        setAgentStatus(prev => ({ ...prev, [msg.agent]: 'done' }))
      }
      if (msg.type === 'agent_failed') {
        setAgentStatus(prev => ({ ...prev, [msg.agent]: 'failed' }))
        // Log error for debugging
        if (msg.error) {
          console.error(`Agent ${msg.agent} failed:`, msg.error)
          if (msg.trace) console.error('Trace:', msg.trace)
        }
      }
      if (msg.type === 'recommendation_ready') {
        // Only mark agents done if there are no failures
        const recommendation = msg.data || {}
        if (!recommendation.failures || recommendation.failures.length === 0) {
          // Success: mark all agents done
          const allDone = {}
          AGENTS.forEach(a => { allDone[a] = 'done' })
          setAgentStatus(allDone)
        } else {
          // Failure: keep individual failed states, don't overwrite
          console.warn('Recommendation has failures:', recommendation.failures)
        }
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

  return { 
    events, 
    recommendation, 
    recovery, 
    agentStatus, 
    sendSignals, 
    AGENTS,
    WAVE_1,
    WAVE_2,
    WAVE_3,
  }
}
