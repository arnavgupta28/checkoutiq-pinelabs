import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import CheckoutPage from './pages/CheckoutPage'
import Dashboard from './pages/Dashboard'

/* ── Pine Labs brand tokens ────────────────────────────────────────────── */
const PL = {
  green:  '#003323',   // Pine Labs Green — primary dark
  mint:   '#50D387',   // Pine Labs Mint  — primary accent
  white:  '#FFFFFF',
  blue:   '#5AE2E2',   // secondary
  yellow: '#FFAA37',   // secondary
  violet: '#836CF4',   // secondary
  teal:   '#20D39C',   // secondary green
}

function Nav() {
  const loc = useLocation()
  const active = (to) => loc.pathname === to
  const link = (to, label) => (
    <Link to={to} style={{
      padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
      textDecoration: 'none', transition: 'all 0.2s',
      background: active(to) ? PL.mint : 'transparent',
      color: active(to) ? PL.green : 'rgba(255,255,255,0.7)',
    }}>{label}</Link>
  )
  return (
    <nav style={{
      background: PL.green,
      padding: '12px 24px',
      display: 'flex', gap: 4, alignItems: 'center',
      boxShadow: '0 2px 12px rgba(0,51,35,0.15)',
    }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: PL.mint, marginRight: 20, letterSpacing: '-0.02em' }}>
        ⚡ CheckoutIQ
      </span>
      {link('/checkout', 'Checkout Demo')}
      {link('/', 'Merchant Dashboard')}
      <span style={{
        marginLeft: 'auto', fontSize: 10, fontWeight: 600,
        background: 'rgba(80,211,135,0.15)', color: PL.mint,
        padding: '4px 10px', borderRadius: 20, letterSpacing: '0.04em',
      }}>
        PINE LABS HACKATHON
      </span>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/checkout" element={<CheckoutPage />} />
      </Routes>
    </BrowserRouter>
  )
}
