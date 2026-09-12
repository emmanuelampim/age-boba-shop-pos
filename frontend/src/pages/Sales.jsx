import { useState, useEffect, useCallback } from 'react'
import * as api from '../api/client'
import { formatCents } from '../lib/money'
import { formatDateTime } from '../lib/date'
import Badge from '../components/Badge'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import ErrorState from '../components/ui/ErrorState'
import EmptyState from '../components/ui/EmptyState'
import Skeleton from '../components/ui/Skeleton'
import ReceiptView from '../components/ReceiptView'
import { useToast } from '../store/toast'
import { useAuth } from '../store/auth'

const STATUSES = ['ALL', 'COMPLETED', 'CANCELLED', 'REFUNDED']

export default function Sales() {
  const { addToast } = useToast()
  const { user } = useAuth()
  const canManage = ['OWNER', 'MANAGER'].includes(user?.role)

  const [orders, setOrders] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [paymentMethods, setPaymentMethods] = useState([])
  const [error, setError] = useState(null)

  const [filters, setFilters] = useState({ from: '', to: '', paymentMethodId: '', status: 'ALL', search: '' })
  const [debounced, setDebounced] = useState({ ...filters })

  const [detail, setDetail] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [settings, setSettings] = useState({})
  const [detailError, setDetailError] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [currencySymbol, setCurrencySymbol] = useState('GH₵')
  const [exporting, setExporting] = useState(false)

  const printReceipt = () => {
    if (!detail) return
    window.print()
  }

  const downloadReport = () => {
    setExporting(true)
    const from = filters.from || ''
    const to = filters.to || ''
    const range = [from, to].filter(Boolean).join('_to_') || 'all'
    api
      .downloadFile('/export/sales', { from: from || undefined, to: to || undefined }, `boba-sales-${range}.csv`)
      .then(() => addToast('Spreadsheet downloaded.'))
      .catch((e) => addToast(e.message, 'error'))
      .finally(() => setExporting(false))
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 350)
    return () => clearTimeout(t)
  }, [filters])

  const load = useCallback((page = 1) => {
    setError(null)
    api
      .get('/orders', {
        page,
        limit: 20,
        from: debounced.from || undefined,
        to: debounced.to || undefined,
        paymentMethodId: debounced.paymentMethodId || undefined,
        status: debounced.status !== 'ALL' ? debounced.status : undefined,
        search: debounced.search || undefined,
      })
      .then((res) => {
        setOrders(res)
        setPagination({
          page: res.pagination.page,
          limit: res.pagination.limit,
          total: res.pagination.total,
          totalPages: res.pagination.totalPages,
        })
      })
      .catch((e) => setError(e.message))
  }, [debounced])

  useEffect(() => {
    load(1)
  }, [load])

  useEffect(() => {
    api.get('/settings/payment-methods').then(setPaymentMethods).catch(() => {})
    api.get('/settings').then((s) => setCurrencySymbol(s.currency_symbol || 'GH₵')).catch(() => {})
  }, [])

  const openDetail = (id) => {
    setDetailError(null)
    setDetailId(id)
    setDetail(null)
    api
      .get(`/orders/${id}`)
      .then((d) => {
        setDetail(d.order)
        setSettings(d.settings)
      })
      .catch((e) => setDetailError(e.message))
  }

  const runAction = (action) => {
    const wasId = detail?.id
    api
      .post(`/orders/${wasId}/${action}`, { reason: confirm?.reason })
      .then(() => {
        addToast(`Order ${action}d`)
        setConfirm(null)
        if (wasId) openDetail(wasId)
        load(pagination.page)
      })
      .catch((e) => addToast(e.message, 'error'))
  }

  const c = (n) => formatCents(n, currencySymbol)

  return (
    <div>
      <div className="page-header">
        <h1>Sales</h1>
      </div>

      <div className="card mb-md">
        <div className="flex items-center justify-between mb-sm">
          <span className="text-muted text-sm">Filter sales, then download a spreadsheet that opens in Excel.</span>
          <button className="btn btn-secondary btn-sm" onClick={downloadReport} disabled={exporting}>
            {exporting ? 'Preparing…' : '⬇ Download report (Excel/CSV)'}
          </button>
        </div>
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="input-group">
            <label htmlFor="s-from">From</label>
            <input id="s-from" className="input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </div>
          <div className="input-group">
            <label htmlFor="s-to">To</label>
            <input id="s-to" className="input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </div>
          <div className="input-group">
            <label htmlFor="s-pay">Payment</label>
            <select id="s-pay" className="select" value={filters.paymentMethodId} onChange={(e) => setFilters({ ...filters, paymentMethodId: e.target.value })}>
              <option value="">All</option>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="s-status">Status</label>
            <select id="s-status" className="select" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s}</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="s-search">Search order #</label>
            <input id="s-search" className="input" type="text" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="#000123" />
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!orders && !error && <div className="card"><Skeleton count={8} height={32} /></div>}

      {orders && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Status</th>
                <th className="text-right">Total</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((o) => (
                <tr key={o.id}>
                  <td className="font-mono"><strong>{o.order_number_display}</strong></td>
                  <td>{formatDateTime(o.created_at)}</td>
                  <td>{o.item_count ?? '—'}</td>
                  <td>{o.payment_method}</td>
                  <td><Badge status={o.status} /></td>
                  <td className="font-mono text-right">{c(o.total)}</td>
                  <td className="text-right">
                    <button className="btn btn-secondary btn-sm" onClick={() => openDetail(o.id)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.data.length === 0 && <EmptyState icon="🧾" message="No sales match these filters." />}
        </div>
      )}

      {orders && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-md">
          <span className="text-muted text-sm">Page {pagination.page} of {pagination.totalPages} · {pagination.total} sales</span>
          <div className="flex gap-sm">
            <button className="btn btn-secondary btn-sm" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>‹ Prev</button>
            <button className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)}>Next ›</button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Modal open={!!detail || !!detailError} title={detail ? `Order ${detail.order_number_display}` : 'View sale'} onClose={() => { setDetail(null); setDetailError(null) }}>
        {detailError && <ErrorState message={detailError} onRetry={() => detailId && openDetail(detailId)} />}
        {detail && (
          <>
            <ReceiptView order={detail} settings={settings} />
            <div className="mt-md">
              {detail.status === 'COMPLETED' && canManage && (
                <div className="flex gap-sm">
                  <button className="btn btn-danger w-full" onClick={() => setConfirm({ action: 'cancel', reason: '' })}>Cancel order</button>
                  <button className="btn btn-danger w-full" onClick={() => setConfirm({ action: 'refund', reason: '' })}>Refund order</button>
                </div>
              )}
              <button className="btn btn-primary w-full mt-sm" onClick={printReceipt}>🖨️ Print receipt</button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.action === 'cancel' ? 'Cancel this order?' : 'Refund this order?'}
        message={`This will update the order status and restore the sold stock. Historical records are kept. The reason is saved with the order.`}
        confirmLabel={confirm?.action === 'cancel' ? 'Cancel order' : 'Refund order'}
        withReason
        reason={confirm?.reason ?? ''}
        onReasonChange={(v) => setConfirm((c) => ({ ...c, reason: v }))}
        onConfirm={() => confirm && runAction(confirm.action)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}