import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import { formatCents } from '../lib/money'
import { formatTime } from '../lib/date'
import Badge from '../components/Badge'
import Skeleton from '../components/ui/Skeleton'
import ErrorState from '../components/ui/ErrorState'
import EmptyState from '../components/ui/EmptyState'
import { useAuth } from '../store/auth'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [dateLabel, setDateLabel] = useState('')
  const [currencySymbol, setCurrencySymbol] = useState('GH₵')

  const load = useCallback(() => {
    setError(null)
    api
      .get('/dashboard/summary')
      .then((d) => {
        setData(d)
        return api.get('/settings')
      })
      .then((s) => setCurrencySymbol(s.currency_symbol || 'GH₵'))
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
    const label = new Intl.DateTimeFormat('en-GH', {
      timeZone: 'Africa/Accra',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date())
    setDateLabel(label)
  }, [load])

  const c = (n) => formatCents(n, currencySymbol)

  const canManage = ['OWNER', 'MANAGER'].includes(user?.role)

  if (error) {
    return (
      <ErrorState message={error} onRetry={load} />
    )
  }

  if (!data) {
    return (
      <div>
        <div className="page-header"><h1>Dashboard</h1></div>
        <div className="stat-grid">
          {[0, 1, 2].map((i) => <div className="card" key={i}><Skeleton height={40} /></div>)}
        </div>
      </div>
    )
  }

  const bestSellers = data.best_sellers || []
  const lowStock = data.low_stock || []
  const recent = data.recent_orders || []

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="text-muted text-sm">{dateLabel}</div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => navigate('/sale')}>
          + New Sale
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Today's Sales</div>
          <div className="stat-value success">{c(data.today.sales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Orders</div>
          <div className="stat-value">{data.today.order_count}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Order Value</div>
          <div className="stat-value">{c(data.today.average_order_value)}</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-header">Best sellers today</div>
          {bestSellers.length === 0 && <EmptyState icon="🍃" message="No sales yet." />}
          {bestSellers.map((p) => (
            <div className="best-seller-row" key={p.id}>
              <span>
                <strong>{p.name}</strong>{' '}
                <span className="text-muted">× {p.quantity}</span>
              </span>
              <span className="font-mono">{c(p.revenue)}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">Stock warnings</div>
          {lowStock.length === 0 && <EmptyState icon="✅" message="All stock levels are healthy." />}
          {lowStock.map((i) => (
            <div className="low-stock-row" key={i.id}>
              <span>
                <strong>{i.name}</strong>{' '}
                <span className="text-muted">({i.quantity} {i.unit})</span>
              </span>
              <Badge status="Low Stock" />
            </div>
          ))}
          {canManage && lowStock.length > 0 && (
            <button className="btn btn-secondary btn-sm mt-sm" onClick={() => navigate('/inventory')}>
              Go to Inventory
            </button>
          )}
        </div>
      </div>

      <div className="card mt-md">
        <div className="card-header">Recent sales</div>
        {recent.length === 0 && <EmptyState icon="🧾" message="No sales yet today." />}
        {recent.map((o) => (
          <div className="recent-row" key={o.id}>
            <span>
              <strong className="font-mono">{o.order_number_display}</strong>
              <div className="recent-meta">{formatTime(o.created_at)} · {o.payment_method} · {o.user_name}</div>
            </span>
            <span className="font-mono">{c(o.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}