import { useState, useEffect, useCallback } from 'react'
import * as api from '../api/client'
import { useToast } from '../store/toast'
import { useAuth } from '../store/auth'
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

  const saveSettings = async () => {
    setSaving(true)
    try {
      await api.patch('/settings', {
        shop_name: settings.shop_name,
        shop_address: settings.shop_address,
        shop_phone: settings.shop_phone,
        shop_email: settings.shop_email,
        receipt_footer: settings.receipt_footer,
        receipt_logo_url: settings.receipt_logo_url,
        receipt_show_logo: settings.receipt_show_logo,
        receipt_show_address: settings.receipt_show_address,
        receipt_show_phone: settings.receipt_show_phone,
        currency_code: settings.currency_code,
        currency_symbol: settings.currency_symbol,
        hours: settings.hours || DEFAULT_HOURS,
      })
      addToast('Settings saved')
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const uploadLogo = async (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const res = await api.post('/settings/logo', { dataUri: reader.result })
        set('receipt_logo_url', res.receipt_logo_url)
        set('receipt_show_logo', res.show_logo)
        addToast('Logo uploaded')
      } catch (e) {
        addToast(e.message, 'error')
      }
    }
    reader.onerror = () => addToast('Could not read the selected file.', 'error')
    reader.readAsDataURL(file)
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
    setUserModal(u)
    setUserForm(u ? { name: u.name, email: u.email, password: '', role: u.role } : { name: '', email: '', password: '', role: 'CASHIER' })
  }

  const saveUser = async () => {
    try {
      const payload = {
        name: userForm.name.trim(),
        ...(userForm.role && { role: userForm.role }),
      }
      if (userModal?.id) {
        if (userForm.password) payload.password = userForm.password
        if (userModal.email !== userForm.email.trim() && userForm.email.trim()) {
          payload.email = userForm.email.trim()
        }
        await api.patch(`/users/${userModal.id}`, payload)
        addToast('User updated')
      } else {
        await api.post('/users', { ...payload, email: userForm.email.trim(), password: userForm.password })
        addToast('User created')
      }
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

  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }))

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        {isOwner && (
          <button className="btn btn-primary" disabled={saving} onClick={saveSettings}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        )}
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-header">Shop information</div>
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
        </div>

        <div className="card">
          <div className="card-header">Receipt</div>
          <div className="input-group">
            <label htmlFor="st-footer">Footer message</label>
            <input id="st-footer" className="input" value={settings.receipt_footer ?? ''} onChange={(e) => set('receipt_footer', e.target.value)} placeholder="Thank you for visiting!" />
          </div>
          <div className="input-group mt-md">
            <label htmlFor="st-logo">Logo URL</label>
            <input id="st-logo" className="input" value={settings.receipt_logo_url ?? ''} onChange={(e) => set('receipt_logo_url', e.target.value)} placeholder="https://…/logo.png" />
          </div>
          <div className="input-group mt-md">
            <label htmlFor="st-logo-file">Upload logo</label>
            <input
              id="st-logo-file"
              className="input"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              onChange={(e) => uploadLogo(e.target.files?.[0])}
            />
            <div className="text-sm text-muted">PNG, JPG, GIF, WebP or SVG, max 1 MB. Show the logo on the receipt to enable it.</div>
            {settings.receipt_logo_url && (
              <div className="logo-preview">
                <img src={settings.receipt_logo_url} alt="Current logo preview" />
              </div>
            )}
          </div>
          <div className="mt-md">
            <label className="flex gap-sm items-center mb-sm">
              <input type="checkbox" checked={!!settings.receipt_show_logo} onChange={(e) => set('receipt_show_logo', e.target.checked)} />
              <span className="text-sm">Show logo on receipt</span>
            </label>
            <label className="flex gap-sm items-center mb-sm">
              <input type="checkbox" checked={!!settings.receipt_show_address} onChange={(e) => set('receipt_show_address', e.target.checked)} />
              <span className="text-sm">Show address on receipt</span>
            </label>
            <label className="flex gap-sm items-center">
              <input type="checkbox" checked={!!settings.receipt_show_phone} onChange={(e) => set('receipt_show_phone', e.target.checked)} />
              <span className="text-sm">Show phone on receipt</span>
            </label>
          </div>
</div>
      </div>

      {isOwner && (
        <>
          <div className="card mt-md">
        <div className="card-header">Business hours</div>
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
      </div>

          <div className="card mt-md">
            <div className="card-header">Payment methods</div>
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
          </div>

          <div className="card mt-md">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Staff & roles</span>
              <button className="btn btn-primary btn-sm" onClick={() => openUserModal()}>+ Add user</button>
            </div>
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
          </div>
        </>
      )}

      {/* User modal */}
      <Modal open={!!userModal || !!userForm} title={userModal ? `Edit ${userModal.name}` : 'Add user'} onClose={() => setUserModal(null)}>
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
            {userModal && <div className="input-error">Email is fixed; create a new account instead.</div>}
          </div>
          <div className="input-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="u-pass">{userModal ? 'New password (leave blank to keep)' : 'Password (min 8 chars)'}</label>
            <input id="u-pass" className="input" type="password" autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-sm mt-md justify-end">
          <button className="btn" onClick={() => setUserModal(null)}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!userForm.name.trim() || (!userModal && (!userForm.email.trim() || userForm.password.length < 8))}
            onClick={saveUser}
          >
            {userModal ? 'Save changes' : 'Create user'}
          </button>
        </div>
      </Modal>
    </div>
  )
}