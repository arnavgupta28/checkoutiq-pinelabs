import { useEffect, useState, useMemo } from 'react'
import React from 'react'
import { Link } from 'react-router-dom'
import { User, Mail, Phone, Globe, Hash, ArrowLeft, Pencil, Check, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const STORAGE_KEY = 'checkoutiq_customer'

/* ── Pine Labs brand tokens ───────────────────────────── */
const PL = {
  green:  '#003323',
  mint:   '#50D387',
  white:  '#FFFFFF',
  blue:   '#5AE2E2',
  bg:     '#f0f5f3',
  border: '#003323' + '18',
  muted:  '#003323' + '70',
}

function parseName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/)
  return { first_name: parts[0] || '', last_name: parts.slice(1).join(' ') || '' }
}

function userToCustomer(user) {
  if (!user) return null
  const { first_name, last_name } = parseName(user.name)
  return {
    first_name,
    last_name,
    email_id: user.email || '',
    mobile_number: user.mobile || '',
    country_code: '91',
    customer_id: user.id || null,
  }
}

function getStoredCustomer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch (_) {}
  return null
}

const inputStyle = (PL) => ({
  width: '100%',
  maxWidth: 280,
  padding: '8px 12px',
  fontSize: 15,
  fontWeight: 500,
  color: PL.green,
  border: `1px solid ${PL.border}`,
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
})

function SavingsHistory() {
  const [txns, setTxns] = React.useState([])
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('checkoutiq_transactions')
      if (raw) setTxns(JSON.parse(raw))
    } catch (_) {}
  }, [])

  const totalSaved = txns.reduce((s, t) => s + (t.saving_paise || 0), 0)
  const totalPaid = txns.reduce((s, t) => s + (t.paid_paise || 0), 0)

  const METHOD_LABELS = {
    CARD: 'Card', CREDIT_EMI: 'Card EMI', DEBIT_EMI: 'Debit EMI',
    UPI: 'UPI', WALLET: 'Wallet', NETBANKING: 'Net Banking',
  }

  const cardStyle = {
    background: PL.white, border: `1px solid ${PL.border}`,
    borderRadius: 14, padding: 20, marginBottom: 12,
    boxShadow: '0 2px 8px rgba(0,51,35,0.06)',
  }

  if (txns.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: '24px 20px' }}>
        <p style={{ fontSize: 24, margin: '0 0 8px' }}>💰</p>
        <p style={{ fontSize: 13, fontWeight: 700, color: PL.green, margin: '0 0 4px' }}>No transactions yet</p>
        <p style={{ fontSize: 12, color: PL.muted, margin: 0 }}>Complete a checkout to see your savings here</p>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: PL.green, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        💰 CheckoutIQ Savings
      </h3>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{ background: `${PL.mint}12`, border: `1px solid ${PL.mint}30`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: PL.mint }}>₹{(totalSaved / 100).toLocaleString('en-IN', { minimumFractionDigits: 0 })}</div>
          <div style={{ fontSize: 10, color: PL.green, fontWeight: 600, marginTop: 2 }}>Total Saved</div>
        </div>
        <div style={{ background: `${PL.green}06`, border: `1px solid ${PL.border}`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: PL.green }}>{txns.length}</div>
          <div style={{ fontSize: 10, color: PL.muted, fontWeight: 600, marginTop: 2 }}>Smart Checkouts</div>
        </div>
      </div>

      {/* Transaction list */}
      <p style={{ fontSize: 10, fontWeight: 700, color: PL.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recent Transactions</p>
      {txns.slice(0, 5).map((txn, i) => (
        <div key={txn.id || i} style={{ padding: '9px 0', borderBottom: i < Math.min(txns.length, 5) - 1 ? `1px solid ${PL.border}` : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: PL.green, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {txn.cart_items?.map(i => i.image).join(' ') || '🛍️'} {txn.cart_items?.map(i => i.name).slice(0, 2).join(', ') || 'Order'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 10, color: PL.muted }}>{new Date(txn.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                <span style={{ fontSize: 10, color: PL.muted }}>· {METHOD_LABELS[txn.payment_method] || txn.payment_method}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: PL.green }}>₹{(txn.paid_paise / 100).toLocaleString('en-IN')}</div>
              {txn.saving_paise > 0 && (
                <div style={{ fontSize: 10, color: PL.teal, fontWeight: 700 }}>−₹{(txn.saving_paise / 100).toFixed(0)} saved</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function UserProfile() {
  const { user } = useAuth()
  const defaultFromUser = useMemo(() => userToCustomer(user) || {
    first_name: '', last_name: '', email_id: '', mobile_number: '', country_code: '91', customer_id: null,
  }, [user])
  const [customer, setCustomer] = useState(defaultFromUser)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ ...defaultFromUser })

  useEffect(() => {
    const fromUser = userToCustomer(user)
    if (!fromUser) return
    const stored = getStoredCustomer()
    const isSameUser = stored && (
      (stored.email_id && stored.email_id === user?.email) ||
      (stored.customer_id && stored.customer_id === user?.id)
    )
    const merged = isSameUser ? { ...fromUser, ...stored } : fromUser
    setCustomer(merged)
    setEditForm(merged)
  }, [user])

  const startEdit = () => {
    setEditForm({ ...customer })
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setEditForm({ ...customer })
    setIsEditing(false)
  }

  const saveEdit = () => {
    const payload = {
      first_name: editForm.first_name?.trim() || '',
      last_name: editForm.last_name?.trim() || '',
      email_id: editForm.email_id?.trim() || '',
      mobile_number: editForm.mobile_number?.trim() || '',
      country_code: editForm.country_code?.trim() || '91',
      customer_id: editForm.customer_id?.trim() || null,
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (_) {}
    setCustomer(payload)
    setEditForm(payload)
    setIsEditing(false)
  }

  const updateField = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }))
  }

  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || '—'
  const email = customer.email_id || '—'
  const mobile = customer.mobile_number ? `+${customer.country_code || '91'} ${customer.mobile_number}` : '—'
  const customerId = customer.customer_id || '—'

  const cardStyle = {
    background: PL.white,
    border: `1px solid ${PL.border}`,
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    boxShadow: '0 2px 8px rgba(0,51,35,0.06)',
  }

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0',
    borderBottom: `1px solid ${PL.border}`,
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '28px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Link
        to="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: PL.green,
          textDecoration: 'none',
          marginBottom: 20,
        }}
      >
        <ArrowLeft size={16} />
        Back to app
      </Link>

      <div style={{ ...cardStyle, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: PL.green,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <User size={32} color={PL.mint} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: PL.green }}>
              {fullName}
            </h1>
            <p style={{ fontSize: 13, color: PL.muted, margin: '4px 0 0 0' }}>
              CheckoutIQ user profile
            </p>
          </div>
          {!isEditing ? (
            <button
              type="button"
              onClick={startEdit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                color: PL.green,
                background: `${PL.mint}20`,
                border: `1px solid ${PL.border}`,
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              <Pencil size={16} />
              Edit profile
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={cancelEdit}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: PL.green,
                  background: PL.white,
                  border: `1px solid ${PL.border}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: PL.white,
                  background: PL.green,
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <Check size={16} />
                Save
              </button>
            </div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${PL.border}` }}>
          {isEditing ? (
            <>
              <div style={rowStyle}>
                <Mail size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>First name</div>
                  <input
                    type="text"
                    value={editForm.first_name ?? ''}
                    onChange={(e) => updateField('first_name', e.target.value)}
                    placeholder="First name"
                    style={inputStyle(PL)}
                  />
                </div>
              </div>
              <div style={rowStyle}>
                <User size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Last name</div>
                  <input
                    type="text"
                    value={editForm.last_name ?? ''}
                    onChange={(e) => updateField('last_name', e.target.value)}
                    placeholder="Last name"
                    style={inputStyle(PL)}
                  />
                </div>
              </div>
              <div style={rowStyle}>
                <Mail size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Email</div>
                  <input
                    type="email"
                    value={editForm.email_id ?? ''}
                    onChange={(e) => updateField('email_id', e.target.value)}
                    placeholder="email@example.com"
                    style={inputStyle(PL)}
                  />
                </div>
              </div>
              <div style={rowStyle}>
                <Phone size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Country code</div>
                  <input
                    type="text"
                    value={editForm.country_code ?? '91'}
                    onChange={(e) => updateField('country_code', e.target.value)}
                    placeholder="91"
                    style={{ ...inputStyle(PL), maxWidth: 80 }}
                  />
                </div>
              </div>
              <div style={rowStyle}>
                <Phone size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Mobile number</div>
                  <input
                    type="tel"
                    value={editForm.mobile_number ?? ''}
                    onChange={(e) => updateField('mobile_number', e.target.value)}
                    placeholder="9876543210"
                    style={inputStyle(PL)}
                  />
                </div>
              </div>
              <div style={{ ...rowStyle, borderBottom: 'none' }}>
                <Hash size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Customer ID (optional)</div>
                  <input
                    type="text"
                    value={editForm.customer_id ?? ''}
                    onChange={(e) => updateField('customer_id', e.target.value)}
                    placeholder="Optional external ID"
                    style={inputStyle(PL)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={rowStyle}>
                <Mail size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: PL.green }}>{email}</div>
                </div>
              </div>
              <div style={rowStyle}>
                <Phone size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mobile</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: PL.green }}>{mobile}</div>
                </div>
              </div>
              <div style={rowStyle}>
                <Globe size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Country code</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: PL.green }}>{customer.country_code || '91'}</div>
                </div>
              </div>
              <div style={{ ...rowStyle, borderBottom: 'none' }}>
                <Hash size={18} color={PL.muted} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: PL.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customer ID</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: PL.green }}>{customerId}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {user?.cards?.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: PL.green, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Saved cards
          </h3>
          {user.cards.map((c) => (
            <div key={c.id} style={{ ...rowStyle, borderBottom: `1px solid ${PL.border}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: PL.green }}>{c.bank} •••• {c.last4}</div>
                <div style={{ fontSize: 12, color: PL.muted }}>{c.network} {c.type}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {user?.wallets?.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: PL.green, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Wallets
          </h3>
          {user.wallets.map((w) => (
            <div key={w.code} style={{ ...rowStyle, borderBottom: `1px solid ${PL.border}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: PL.green }}>{w.name}</div>
                <div style={{ fontSize: 12, color: PL.muted }}>₹{(w.balance_paise / 100).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: PL.muted, margin: '0 0 16px' }}>
        This data matches the backend <code style={{ background: `${PL.mint}20`, padding: '2px 6px', borderRadius: 4 }}>CustomerDetails</code> used for checkout sessions and recovery.
      </p>

      <SavingsHistory />
    </div>
  )
}
