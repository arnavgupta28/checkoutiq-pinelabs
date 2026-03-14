import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { User, Mail, Phone, Globe, Hash, ArrowLeft, Pencil, Check, X } from 'lucide-react'

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

const DEFAULT_CUSTOMER = {
  first_name: 'Rahul',
  last_name: 'Sharma',
  email_id: 'rahul@example.com',
  mobile_number: '9876543210',
  country_code: '91',
  customer_id: null,
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

export default function UserProfile() {
  const [customer, setCustomer] = useState(DEFAULT_CUSTOMER)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({ ...DEFAULT_CUSTOMER })

  useEffect(() => {
    const stored = getStoredCustomer()
    const merged = { ...DEFAULT_CUSTOMER, ...stored }
    setCustomer(merged)
    setEditForm(merged)
  }, [])

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

      <p style={{ fontSize: 12, color: PL.muted, margin: 0 }}>
        This data matches the backend <code style={{ background: `${PL.mint}20`, padding: '2px 6px', borderRadius: 4 }}>CustomerDetails</code> used for checkout sessions and recovery.
      </p>
    </div>
  )
}
