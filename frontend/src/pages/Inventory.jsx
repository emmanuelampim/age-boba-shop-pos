import { useState, useEffect, useCallback } from 'react'
import * as api from '../api/client'
import Badge from '../components/Badge'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import Skeleton from '../components/ui/Skeleton'
import { useToast } from '../store/toast'
import { useAuth } from '../store/auth'

export default function Inventory() {
  const { addToast } = useToast()
  const { user } = useAuth()
  const canManage = ['OWNER', 'MANAGER'].includes(user?.role)
  const canAdjust = ['OWNER', 'MANAGER', 'INVENTORY_MANAGER'].includes(user?.role)

  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  const [adjust, setAdjust] = useState(null)
  const [adjForm, setAdjForm] = useState({ type: 'RESTOCK', quantity: '', note: '' })
  const [saving, setSaving] = useState(false)

  const [txns, setTxns] = useState(null)
  const [txnPage, setTxnPage] = useState(1)
  const [txnFor, setTxnFor] = useState(null)
  const [txnError, setTxnError] = useState(null)

  const load = useCallback(() => {
    setError(null)
    api.get('/inventory?all=1').then(setItems).catch((e) => setError(e.message))
  }, [])

  useEffect(() => { load() }, [load])

  const openAdjust = (item) => {
    setAdjust(item)
    setAdjForm({ type: 'RESTOCK', quantity: '', note: '' })
  }

  const submitAdjust = async () => {
    setSaving(true)
    try {
      const res = await api.post('/inventory/adjust', {
        itemId: adjust.id,
        type: adjForm.type,
        quantity: Number(adjForm.quantity),
        note: adjForm.note,
      })
      addToast(`${adjust.name}: ${res.previous} → ${res.newQuantity} ${adjust.unit}`)
      setAdjust(null)
      load()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const openTxns = (itemId) => {
    setTxns(null)
    setTxnError(null)
    setTxnPage(1)
    api
      .get('/inventory/transactions', { itemId, page: 1, limit: 20 })
      .then((d) => {
        setTxns(d)
        setTxnFor(itemId)
      })
      .catch((e) => setTxnError(e.message))
  }

  return (
    <div>
      <div className="page-header">
        <h1>Inventory</h1>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!items && !error && <div className="card"><Skeleton count={6} height={40} /></div>}

      {items && items.length === 0 && <EmptyState icon="📦" message="No inventory items." />}

      {items && items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Unit</th>
                <th>On hand</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const low = it.quantity <= it.low_stock_threshold
                return (
                  <tr key={it.id}>
                    <td>
                      <strong>{it.name}</strong>
                      {low && it.status === 'ACTIVE' && <span className="text-muted text-sm"> · low threshold {it.low_stock_threshold}</span>}
                    </td>
                    <td>{it.unit}</td>
                    <td>
                      <span className={`font-mono${low && it.status === 'ACTIVE' ? ' stat-value warning' : ''}`}>{it.quantity}</span>
                      {low && it.status === 'ACTIVE' && <span className="ml" style={{ marginLeft: 8 }}><Badge status="Low Stock" /></span>}
                    </td>
                    <td><Badge status={it.status === 'ACTIVE' ? 'Active' : 'Inactive'} /></td>
                    <td className="text-right">
                      <div className="flex gap-sm justify-end">
                        {canAdjust && (
                          <button className="btn btn-secondary btn-sm" onClick={() => openAdjust(it)}>Adjust</button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => openTxns(it.id)}>History</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjust modal */}
      <Modal
        open={!!adjust}
        title={`Adjust ${adjust?.name ?? ''}`}
        onClose={() => setAdjust(null)}
        footer={
          <>
            <button className="btn" onClick={() => setAdjust(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving || !adjForm.quantity || Number(adjForm.quantity) === 0} onClick={submitAdjust}>
              {saving ? 'Saving…' : 'Apply adjustment'}
            </button>
          </>
        }
      >
        <div className="input-group mb-md">
          <label htmlFor="adj-type">Type</label>
          <select id="adj-type" className="select" value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}>
            <option value="RESTOCK">Restock (add)</option>
            <option value="WASTE">Waste (remove)</option>
            <option value="ADJUSTMENT">Adjustment (add or remove)</option>
          </select>
        </div>
        <div className="input-group">
          <label htmlFor="adj-qty">Quantity ({adjust?.unit ?? 'unit'})</label>
          <input
            id="adj-qty"
            className="input"
            type="number"
            min={adjForm.type === 'WASTE' ? 1 : undefined}
            step="1"
            value={adjForm.quantity}
            onChange={(e) => setAdjForm({ ...adjForm, quantity: e.target.value })}
          />
          {adjForm.type === 'ADJUSTMENT' && <div className="input-error">Use a negative number to remove stock.</div>}
        </div>
        <div className="input-group mt-md">
          <label htmlFor="adj-note">Note / reason</label>
          <input id="adj-note" className="input" value={adjForm.note} onChange={(e) => setAdjForm({ ...adjForm, note: e.target.value })} placeholder="e.g. delivery from supplier" />
        </div>
      </Modal>

      {/* Transactions modal */}
      <Modal open={!!txns || !!txnError} title="Transaction history" onClose={() => { setTxns(null); setTxnError(null) }}>
        {txnError && <ErrorState message={txnError} onRetry={() => txnFor && openTxns(txnFor)} />}
        {txns && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th className="text-right">Delta</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.data.map((t) => (
                    <tr key={t.id}>
                      <td className="text-sm">{new Date(t.created_at + 'Z').toLocaleString('en-GH', { timeZone: 'Africa/Accra', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', ' ')}</td>
                      <td><Badge status={t.type.replace('_', ' ')} /></td>
                      <td className={`font-mono text-right ${t.quantity_change < 0 ? 'stat-value danger' : 'stat-value success'}`}>
                        {t.quantity_change > 0 ? '+' : ''}{t.quantity_change}
                      </td>
                      <td className="font-mono text-right">{t.new_quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {txns.data.length === 0 && <EmptyState icon="📜" message="No transactions for this item." />}
            </div>
            {txns.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-md">
                <span className="text-muted text-sm">Page {txns.pagination.page} of {txns.pagination.totalPages}</span>
                <div className="flex gap-sm">
                  <button className="btn btn-secondary btn-sm" disabled={txns.pagination.page <= 1} onClick={() => loadTxnPage(txnFor, txns.pagination.page - 1, setTxns, setTxnError)}>‹ Prev</button>
                  <button className="btn btn-secondary btn-sm" disabled={txns.pagination.page >= txns.pagination.totalPages} onClick={() => loadTxnPage(txnFor, txns.pagination.page + 1, setTxns, setTxnError)}>Next ›</button>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}

async function loadTxnPage(itemId, page, setTxns, setTxnError) {
  try {
    const d = await api.get('/inventory/transactions', { itemId, page, limit: 20 })
    setTxns(d)
  } catch (e) {
    setTxnError(e.message)
  }
}