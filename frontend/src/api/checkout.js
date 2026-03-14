import axios from 'axios'

// In dev: Vite proxy handles relative URLs → localhost:8000
// In production (Vercel): VITE_API_URL=https://<ec2-ip-or-domain>
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' })

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

/* ── New merchant insight endpoints ──────────────────── */

export const getAbandonmentLogs = () =>
  api.get('/merchant/abandonment-logs').then(r => r.data)

export const getRecoveryLogs = () =>
  api.get('/merchant/recovery-logs').then(r => r.data)

export const getRecoveryRules = () =>
  api.get('/merchant/recovery-rules').then(r => r.data)

export const getRecoveryMetrics = () =>
  api.get('/merchant/recovery-metrics').then(r => r.data)

export const recordOfferChosen = (offerId, bank = 'unknown', savingPaise = 0) =>
  api.post('/merchant/offer-chosen', { offer_id: offerId, bank, saving_paise: savingPaise }).then(r => r.data)
