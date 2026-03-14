import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AUTH_STORAGE_KEY = 'checkoutiq_auth'
const CUSTOMER_STORAGE_KEY = 'checkoutiq_customer'
const PASSWORD = 'checkoutIQ123'

// Same users as backend/mock_data/user_profiles.json — used for login validation
const USERS = [
  {
    id: 'user_001',
    name: 'Rahul Sharma',
    email: 'rahul@example.com',
    mobile: '9876543210',
    cards: [
      { id: 'HDFC_CC_4012', bank: 'HDFC', network: 'Visa', type: 'CREDIT', bin: '401200', last4: '1847', reward_rate_pct: 2.0, category_bonus: { electronics: 5.0, groceries: 1.5 } },
      { id: 'SBI_CC_5212', bank: 'SBI', network: 'Mastercard', type: 'CREDIT', bin: '521234', last4: '2953', reward_rate_pct: 1.5, category_bonus: { travel: 3.0, dining: 2.0 } },
    ],
    wallets: [
      { code: 'PHONEPE', name: 'PhonePe', balance_paise: 45000 },
      { code: 'PAYTM', name: 'Paytm', balance_paise: 20000 },
    ],
    upi_handles: [
      { handle: 'rahul@phonepe', upi_app: 'PhonePe' },
      { handle: 'rahulsharma@okaxis', upi_app: 'Google Pay' },
    ],
    net_banking: [
      { bank: 'HDFC', account_type: 'SAVINGS' },
    ],
    loyalty_points: [
      { program: 'HDFC SmartBuy', points: 2500, value_paise: 2500 },
    ],
  },
  {
    id: 'user_002',
    name: 'Priya Patel',
    email: 'priya@example.com',
    mobile: '9988776655',
    cards: [
      { id: 'AXIS_CC_4216', bank: 'Axis', network: 'Visa', type: 'CREDIT', bin: '421653', last4: '3621', reward_rate_pct: 1.0, category_bonus: { fashion: 5.0, entertainment: 3.0 } },
      { id: 'ICICI_DC_4567', bank: 'ICICI', network: 'Visa', type: 'DEBIT', bin: '456700', last4: '4709', reward_rate_pct: 0.5, category_bonus: {} },
    ],
    wallets: [
      { code: 'AMAZON_PAY', name: 'Amazon Pay', balance_paise: 150000 },
      { code: 'PHONEPE', name: 'PhonePe', balance_paise: 8000 },
    ],
    upi_handles: [
      { handle: 'priya@amazonpay', upi_app: 'Amazon Pay' },
    ],
    net_banking: [
      { bank: 'Axis', account_type: 'SAVINGS' },
    ],
    loyalty_points: [],
  },
  {
    id: 'user_003',
    name: 'Arjun Mehta',
    email: 'arjun@example.com',
    mobile: '8877665544',
    cards: [
      { id: 'KOTAK_CC_4567', bank: 'Kotak', network: 'Mastercard', type: 'CREDIT', bin: '456780', last4: '5186', reward_rate_pct: 3.0, category_bonus: { electronics: 4.0, online: 2.5 } },
      { id: 'HDFC_DC_6074', bank: 'HDFC', network: 'Rupay', type: 'DEBIT', bin: '607400', last4: '6294', reward_rate_pct: 0.25, category_bonus: {} },
    ],
    wallets: [
      { code: 'PAYTM', name: 'Paytm', balance_paise: 75000 },
    ],
    upi_handles: [
      { handle: 'arjun@paytm', upi_app: 'Paytm' },
    ],
    net_banking: [
      { bank: 'Kotak', account_type: 'SAVINGS' },
      { bank: 'HDFC', account_type: 'CURRENT' },
    ],
    loyalty_points: [
      { program: 'Kotak Rewards', points: 5000, value_paise: 5000 },
    ],
  },
]

function parseName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/)
  const first = parts[0] || ''
  const last = parts.slice(1).join(' ') || ''
  return { first_name: first, last_name: last }
}

function syncCustomerToStorage(user) {
  if (!user) {
    try {
      localStorage.removeItem(CUSTOMER_STORAGE_KEY)
    } catch (_) {}
    return
  }
  const { first_name, last_name } = parseName(user.name)
  const payload = {
    first_name,
    last_name,
    email_id: user.email,
    mobile_number: user.mobile,
    country_code: '91',
    customer_id: user.id,
  }
  try {
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(payload))
  } catch (_) {}
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const match = USERS.find((u) => u.id === parsed?.id && u.email === parsed?.email)
        if (match) {
          setUser(match)
          syncCustomerToStorage(match)
          return
        }
      }
    } catch (_) {}
    setUser(null)
  }, [])

  const login = useCallback((email, password) => {
    const trimmedEmail = (email || '').trim().toLowerCase()
    if (password !== PASSWORD) return { ok: false, error: 'Invalid email or password.' }
    const found = USERS.find((u) => u.email.toLowerCase() === trimmedEmail)
    if (!found) return { ok: false, error: 'Invalid email or password.' }
    setUser(found)
    syncCustomerToStorage(found)
    try {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ id: found.id, email: found.email })
      )
    } catch (_) {}
    return { ok: true }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    syncCustomerToStorage(null)
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    } catch (_) {}
  }, [])

  const value = { user, login, logout, users: USERS }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
