import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' })

export const triggerRecovery = (sessionId, signals = {}) =>
  api.post('/recovery/trigger', { session_id: sessionId, behavioral_signals: signals }).then(r => r.data)

export const getRecoveryNudge = (sessionId) =>
  api.get(`/recovery/${sessionId}/nudge`).then(r => r.data)

export const redeliverRecovery = (sessionId) =>
  api.post(`/recovery/${sessionId}/redeliver`).then(r => r.data)
