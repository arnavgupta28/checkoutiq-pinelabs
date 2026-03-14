import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Zap, Mail, Lock } from 'lucide-react'

const PL = {
  green: '#003323',
  mint: '#50D387',
  white: '#FFFFFF',
  bg: '#f0f5f3',
  border: '#00332318',
  muted: '#00332370',
}

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = login(email, password)
    setLoading(false)
    if (result.ok) {
      navigate('/', { replace: true })
    } else {
      setError(result.error || 'Login failed.')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: `linear-gradient(160deg, ${PL.green} 0%, #002218 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: PL.white,
          borderRadius: 20,
          boxShadow: '0 24px 48px rgba(0,51,35,0.2)',
          padding: 40,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              background: PL.green,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={26} color={PL.mint} />
          </div>
          <span
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: PL.green,
              letterSpacing: '-0.02em',
            }}
          >
            CheckoutIQ
          </span>
        </div>
        <p style={{ fontSize: 14, color: PL.muted, margin: '0 0 28px 0' }}>
          Sign in with your email
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: PL.green,
              marginBottom: 6,
            }}
          >
            Email
          </label>
          <div
            style={{
              position: 'relative',
              marginBottom: 16,
            }}
          >
            <Mail
              size={18}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: PL.muted,
              }}
            />
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. rahul@example.com"
              required
              style={{
                width: '100%',
                padding: '12px 12px 12px 44px',
                fontSize: 15,
                fontWeight: 500,
                color: PL.green,
                border: `1px solid ${PL.border}`,
                borderRadius: 10,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: PL.green,
              marginBottom: 6,
            }}
          >
            Password
          </label>
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <Lock
              size={18}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: PL.muted,
              }}
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                padding: '12px 12px 12px 44px',
                fontSize: 15,
                fontWeight: 500,
                color: PL.green,
                border: `1px solid ${PL.border}`,
                borderRadius: 10,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <p
              style={{
                fontSize: 13,
                color: '#c53030',
                margin: '0 0 16px 0',
                padding: '10px 12px',
                background: '#fff5f5',
                borderRadius: 8,
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px 20px',
              fontSize: 15,
              fontWeight: 700,
              color: PL.green,
              background: PL.mint,
              border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p
          style={{
            fontSize: 12,
            color: PL.muted,
            margin: '24px 0 0 0',
            textAlign: 'center',
          }}
        >
          Demo: use rahul@example.com, priya@example.com or arjun@example.com with password checkoutIQ123
        </p>
      </div>
    </div>
  )
}
