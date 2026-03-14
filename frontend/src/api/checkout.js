import axios from 'axios'

const api = axios.create({ baseURL: '' })

export const startSession = (data) =>
  api.post('/checkout/session/start', data).then(r => r.data)

export const triggerSmartApply = (data) =>
  api.post('/checkout/smart-apply', data).then(r => r.data)

export const getRecommendation = (sessionId) =>
  api.get(`/checkout/session/${sessionId}/recommendation`).then(r => r.data)

export const applyPayment = (sessionId, data) =>
  api.post(`/checkout/session/${sessionId}/apply`, data).then(r => r.data)

export const getStats = () =>
  api.get('/merchant/stats').then(r => r.data)

export const getSessions = () =>
  api.get('/merchant/sessions').then(r => r.data)
