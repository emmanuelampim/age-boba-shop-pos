import { useState, useEffect, useCallback } from 'react'
import * as api from '../api/client'
import { useToast } from '../store/toast'
import { useAuth } from '../store/auth'
import * as customerDisplay from '../lib/customerDisplay'
import Badge from '../components/Badge'
import Modal from '../components/ui/Modal'
import ErrorState from '../components/ui/ErrorState'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'

const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY_MANAGER']

const DAYS = [
  ['sun', 'Sunday'],
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
]

const DEFAULT_HOURS = {
  sun: { open: '15:00', close: '21:00', closed: false },
  mon: { open: '15:00', close: '21:00', closed: false },
  tue: { open: '15:00', close: '21:00', closed: false },
  wed: { open: '15:00', close: '21:00', closed: false },
  thu: { open: '15:00', close: '21:00', closed: false },
  fri: { open: '15:00', close: '21:00', closed: false },
  sat: { open: '15:00', close: '21:00', closed: false },
}

const SECTIONS = [
  { id: 'shop', icon: '🏪', label: 'Shop information' },
  { id: 'receipt', icon: '🧾', label: 'Receipt' },
  { id: 'hours', icon: '🕐', label: 'Business hours', owner: true },
  { id: 'payments', icon: '💳', label: 'Payment methods', owner: true },
  { id: 'display', icon: '🖥️', label: 'Customer display', owner: true },
  { id: 'users', icon: '👥', label: 'Staff & roles', owner: true },
]

function formatHour12(value) {
  if (!value) return '—'
  const [h, m] = value.split(':').map(Number)
  if (Number.isNaN(h)) return value
  const meridiem = h >= 12 ? 'PM' : 'AM'
  const hours12 = h % 12 === 0 ? 12 : h % 12
  return `${hours12}:${String(m ?? 0).padStart(2, '0')} ${meridiem}`
}

export default function Settings() {
  const { addToast } = useToast()
  const { user } = useAuth()
  const isOwner = user?.role === 'OWNER'

  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [section, setSection] = useState(null)

  const [paymentMethods, setPaymentMethods] = useState([])
  const [users, setUsers] = useState([])

  const [newPm, setNewPm] = useState({ name: '', code: '' })
  const [userModal, setUserModal] = useState(null)
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'CASHIER' })

  const load = useCallback(() => {
    setError(null)
    Promise.all([
      api.get('/settings'),
      api.get('/settings/payment-methods'),
      isOwner ? api.get('/users') : Promise.resolve([]),
    ])
      .then(([s, pms, us]) => {
        setSettings(s)
        setPaymentMethods(pms)
        setUsers(us)
      })
      .catch((e) => setError(e.message))
  }, [isOwner])

  useEffect(() => { load() }, [load])

  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }))

  const saveSection = async (payload, label) => {
    setSaving(true)
    try {
      await api.patch('/settings', payload)
      addToast(`${label} saved`)
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateHours = (day, patch) => {
    set('hours', { ...(settings.hours || DEFAULT_HOURS), [day]: { ...(settings.hours?.[day] || DEFAULT_HOURS[day]), ...patch } })
  }

  const setHoursForAll = (day, value) => {
    const base = { ...(settings.hours?.[day] || DEFAULT_HOURS[day]), ...value }
    const updated = {}
    for (const [d] of DAYS) updated[d] = { ...base }
    set('hours', updated)
  }

  const addPm = async () => {
    try {
      await api.post('/settings/payment-methods', {
        name: newPm.name.trim(),
        code: newPm.code.trim().toUpperCase().replace(/\s+/g, '_'),
        isActive: true,
      })
      addToast('Payment method added')
      setNewPm({ name: '', code: '' })
      load()
    } catch (e) {
      addToast(e.message, 'error')
    }
  }

  const togglePm = async (pm) => {
    try {
      await api.patch(`/settings/payment-methods/${pm.id}`, { isActive: !pm.is_active })
      load()
    } catch (e) {
      addToast(e.message, 'error')
    }
  }

  const openUserModal = (u = null) => {
    if (!u) return
    setUserModal(u)
    setUserForm({ name: u.name, email: u.email, password: '', role: u.role })
  }

  const saveUser = async () => {
    try {
      if (!userModal?.id) return
      const payload = {
        name: userForm.name.trim(),
        ...(userForm.role && { role: userForm.role }),
      }
      if (userForm.password) payload.password = userForm.password
      if (userModal.email !== userForm.email.trim() && userForm.email.trim()) {
        payload.email = userForm.email.trim()
      }
      await api.patch(`/users/${userModal.id}`, payload)
      addToast('User updated')
      setUserModal(null)
      load()
    } catch (e) {
      addToast(e.message, 'error')
    }
  }

  const toggleUser = async (u) => {
    try {
      await api.patch(`/users/${u.id}`, { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
      load()
    } catch (e) {
      addToast(e.message, 'error')
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!settings) {
    return (
      <div>
        <div className="page-header"><h1>Settings</h1></div>
        <div className="card"><Skeleton count={6} height={36} /></div>
      </div>
    )
  }

  const sections = SECTIONS.filter((s) => !s.owner || isOwner)

  const goBack = () => setSection(null)

  const Panel = ({ title, icon, onSave, children }) => (
    <div className="settings-panel">
      <div className="settings-panel-head">
        <button className="btn btn-ghost btn-sm settings-back" onClick={goBack}>‹ Back</button>
        <h2 className="settings-panel-title">
          <span className="settings-icon">{icon}</span>
          {title}
        </h2>
        {onSave && (
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      <div className="card">{children}</div>
    </div>
  )

  const renderPanel = () => {
    if (section === 'shop') {
      return (
        <Panel
          title="Shop information"
          icon="🏪"
          onSave={() =>
            saveSection(
              {
                shop_name: settings.shop_name,
                shop_address: settings.shop_address,
                shop_phone: settings.shop_phone,
                shop_email: settings.shop_email,
                currency_code: settings.currency_code,
                currency_symbol: settings.currency_symbol,
              },
              'Shop information'
            )
          }
        >
          <div className="grid-2">
            <div className="input-group">
              <label htmlFor="st-shop-name">Shop name</label>
              <input id="st-shop-name" className="input" value={settings.shop_name ?? ''} onChange={(e) => set('shop_name', e.target.value)} />
            </div>
            <div className="input-group">
              <label htmlFor="st-phone">Phone</label>
              <input id="st-phone" className="input" value={settings.shop_phone ?? ''} onChange={(e) => set('shop_phone', e.target.value)} />
            </div>
            <div className="input-group">
              <label htmlFor="st-email">Email</label>
              <input id="st-email" className="input" type="email" value={settings.shop_email ?? ''} onChange={(e) => set('shop_email', e.target.value)} placeholder="Leave empty for now" />
            </div>
            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="st-address">Address</label>
              <input id="st-address" className="input" value={settings.shop_address ?? ''} onChange={(e) => set('shop_address', e.target.value)} />
            </div>
            <div className="input-group">
              <label htmlFor="st-ccode">Currency code</label>
              <input id="st-ccode" className="input" value={settings.currency_code ?? 'GHS'} onChange={(e) => set('currency_code', e.target.value)} />
            </div>
            <div className="input-group">
              <label htmlFor="st-csym">Currency symbol</label>
              <input id="st-csym" className="input" value={settings.currency_symbol ?? 'GH₵'} onChange={(e) => set('currency_symbol', e.target.value)} />
            </div>
          </div>
        </Panel>
      )
    }

    if (section === 'receipt') {
      return (
        <Panel
          title="Receipt"
          icon="🧾"
          onSave={() =>
            saveSection(
              {
                receipt_footer: settings.receipt_footer,
                receipt_show_address: settings.receipt_show_address,
                receipt_show_phone: settings.receipt_show_phone,
              },
              'Receipt'
            )
          }
        >
          <div className="receipt-card-logo">
            <img src="/logo.png" alt="Receipt logo" />
            <div className="text-sm text-muted">
              This logo is the watermark shown faintly behind every receipt. Put a new one at <code>/logo.png</code> to change it.
            </div>
          </div>
          <div className="input-group mt-md">
            <label htmlFor="st-footer">Footer message</label>
            <input id="st-footer" className="input" value={settings.receipt_footer ?? ''} onChange={(e) => set('receipt_footer', e.target.value)} placeholder="Thank you for visiting!" />
          </div>
          <div className="mt-md">
            <label className="flex gap-sm items-center mb-sm">
              <input type="checkbox" checked={!!settings.receipt_show_address} onChange={(e) => set('receipt_show_address', e.target.checked)} />
              <span className="text-sm">Show address on receipt</span>
            </label>
            <label className="flex gap-sm items-center">
              <input type="checkbox" checked={!!settings.receipt_show_phone} onChange={(e) => set('receipt_show_phone', e.target.checked)} />
              <span className="text-sm">Show phone on receipt</span>
            </label>
          </div>
        </Panel>
      )
    }

    if (section === 'hours') {
      return (
        <Panel
          title="Business hours"
          icon="🕐"
          onSave={() => saveSection({ hours: settings.hours || DEFAULT_HOURS }, 'Business hours')}
        >
          <div className="text-sm text-muted mb-md">
            Default: {formatHour12((settings.hours || DEFAULT_HOURS).mon?.open)} – {formatHour12((settings.hours || DEFAULT_HOURS).mon?.close)}, every day. You can adjust each day separately.
            <button
              className="btn btn-secondary btn-sm ml-sm"
              onClick={() => setHoursForAll('mon', {})}
            >
              Apply today&apos;s times to all days
            </button>
          </div>
          <div className="hours-grid">
            {DAYS.map(([code, label]) => {
              const day = settings.hours?.[code] || DEFAULT_HOURS[code]
              return (
                <div className={`hours-row${day.closed ? ' is-closed' : ''}`} key={code}>
                  <div className="hours-day">
                    <strong>{label}</strong>
                    <span className="hours-summary text-muted text-sm">
                      {day.closed ? 'Closed' : `${formatHour12(day.open)} – ${formatHour12(day.close)}`}
                    </span>
                  </div>
                  <label className="hours-closed-check">
                    <input
                      type="checkbox"
                      checked={!!day.closed}
                      onChange={(e) => updateHours(code, { closed: e.target.checked })}
                    />
                    <span>Closed</span>
                  </label>
                  {!day.closed && (
                    <div className="hours-times">
                      <div className="input-group">
                        <label>Opens</label>
                        <input className="input" type="time" value={day.open} onChange={(e) => updateHours(code, { open: e.target.value })} />
                      </div>
                      <div className="input-group">
                        <label>Closes</label>
                        <input className="input" type="time" value={day.close} onChange={(e) => updateHours(code, { close: e.target.value })} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      )
    }

    if (section === 'payments') {
      return (
        <Panel title="Payment methods" icon="💳">
          <div className="flex gap-sm mb-md" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="input-group" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="pm-name">Name</label>
              <input id="pm-name" className="input" value={newPm.name} onChange={(e) => setNewPm({ ...newPm, name: e.target.value })} placeholder="Cash" />
            </div>
            <div className="input-group" style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="pm-code">Code</label>
              <input id="pm-code" className="input" value={newPm.code} onChange={(e) => setNewPm({ ...newPm, code: e.target.value })} placeholder="CASH" />
            </div>
            <button className="btn btn-secondary" disabled={!newPm.name.trim() || !newPm.code.trim()} onClick={addPm}>Add</button>
          </div>
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            {paymentMethods.map((m) => (
              <button
                key={m.id}
                className={`btn btn-sm${m.is_active ? ' btn-primary' : ' btn-secondary'}`}
                onClick={() => togglePm(m)}
                title={`Click to ${m.is_active ? 'deactivate' : 'activate'}`}
              >
                {m.name} {m.is_active ? '✓' : '(off)'}
              </button>
            ))}
          </div>
        </Panel>
      )
    }

    if (section === 'display') {
      return (
        <Panel
          title="Customer display"
          icon="🖥️"
          onSave={() =>
            saveSection(
              {
                customer_display_enabled: settings.customer_display_enabled,
                customer_thank_you_message: settings.customer_thank_you_message,
                customer_thank_you_seconds: settings.customer_thank_you_seconds,
              },
              'Customer display'
            )
          }
        >
          <label className="flex gap-sm items-center mb-md">
            <input
              type="checkbox"
              checked={settings.customer_display_enabled !== false}
              onChange={(e) => {
                const v = e.target.checked
                set('customer_display_enabled', v)
                if (v) {
                  customerDisplay.connect({ settings: { ...settings, customer_display_enabled: v } })
                  customerDisplay.setEnabled(true)
                  customerDisplay.ensureOpen()
                } else {
                  customerDisplay.setEnabled(false)
                }
              }}
            />
            <span className="text-sm">
              Enable customer display (a second screen that shows the current order while the cashier works)
            </span>
          </label>

          <div className="grid-2">
            <div className="input-group">
              <label htmlFor="cd-thanks">Thank-you message after payment</label>
              <input
                id="cd-thanks"
                className="input"
                value={settings.customer_thank_you_message ?? 'THANK YOU!'}
                onChange={(e) => set('customer_thank_you_message', e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="input-group">
              <label htmlFor="cd-seconds">Thank-you screen duration (seconds, 3-30)</label>
              <input
                id="cd-seconds"
                className="input"
                type="number"
                min="3"
                max="30"
                value={settings.customer_thank_you_seconds ?? '8'}
                onChange={(e) => set('customer_thank_you_seconds', e.target.value)}
              />
            </div>
          </div>

          <div className="mt-md">
            <button
              className="btn btn-secondary"
              onClick={() => {
                customerDisplay.connect({ settings: { ...settings, customer_display_enabled: true } })
                customerDisplay.setEnabled(true)
                customerDisplay.ensureOpen({ force: true })
              }}
            >
              Open customer display now
            </button>
            <span className="text-sm text-muted ml-sm">
              Opens the customer window even if no second monitor is detected (for testing).
            </span>
          </div>
        </Panel>
      )
    }

    if (section === 'users') {
      return (
        <Panel title="Staff & roles" icon="👥">
          {users.length === 0 && <EmptyState icon="👤" message="No staff yet." />}
          {users.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong>{u.id === user.id && <span className="text-muted text-sm"> (you)</span>}</td>
                      <td>{u.email}</td>
                      <td>{u.role}</td>
                      <td><Badge status={u.status === 'ACTIVE' ? 'Active' : 'Inactive'} /></td>
                      <td className="text-right">
                        <div className="flex gap-sm justify-end">
                          <button className="btn btn-secondary btn-sm" onClick={() => openUserModal(u)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleUser(u)}>
                            {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )
    }

    return null
  }

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      {section === null ? (
        <div className="settings-menu">
          {sections.map((s) => (
            <button key={s.id} className="settings-row" onClick={() => setSection(s.id)}>
              <span className="settings-icon">{s.icon}</span>
              <span className="settings-label">{s.label}</span>
              <span className="settings-chevron">›</span>
            </button>
          ))}
        </div>
      ) : (
        renderPanel()
      )}

      <Modal open={!!userModal} title={userModal ? `Edit ${userModal.name}` : ''} onClose={() => setUserModal(null)}>
        <div className="grid-2">
          <div className="input-group">
            <label htmlFor="u-name">Name</label>
            <input id="u-name" className="input" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
          </div>
          <div className="input-group">
            <label htmlFor="u-role">Role</label>
            <select id="u-role" className="select" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="u-email">Email</label>
            <input id="u-email" className="input" type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          </div>
          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="u-pass">New password (leave blank to keep)</label>
            <input id="u-pass" className="input" type="password" autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-sm mt-md justify-end">
          <button className="btn" onClick={() => setUserModal(null)}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!userForm.name.trim()}
            onClick={saveUser}
          >
            Save changes
          </button>
        </div>
      </Modal>
    </div>
  )
}