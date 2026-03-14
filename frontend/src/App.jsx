import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import CheckoutPage from './pages/CheckoutPage'
import Dashboard from './pages/Dashboard'
import UserProfile from './pages/UserProfile'
import Login from './pages/Login'
import { User, LogOut } from 'lucide-react'

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
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }
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
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {user && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginRight: 4 }}>
            {user.name}
          </span>
        )}
        <Link
          to="/profile"
          title="User profile"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: loc.pathname === '/profile' ? PL.mint : 'rgba(80,211,135,0.2)',
            color: loc.pathname === '/profile' ? PL.green : PL.mint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
        >
          <User size={18} />
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          title="Log out"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.8)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <LogOut size={18} />
        </button>
        <span style={{
          fontSize: 10, fontWeight: 600,
          background: 'rgba(80,211,135,0.15)', color: PL.mint,
          padding: '4px 10px', borderRadius: 20, letterSpacing: '0.04em',
        }}>
          PINE LABS HACKATHON
        </span>
      </span>
    </nav>
  )
}

function AppRoutes() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/profile" element={<UserProfile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={
            <ProtectedLayout>
              <AppRoutes />
            </ProtectedLayout>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

function ProtectedLayout({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}
