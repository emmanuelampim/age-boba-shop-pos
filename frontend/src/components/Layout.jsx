import { useState, useEffect } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../store/auth'
import * as api from '../api/client'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊', exact: true },
  { to: '/sale', label: 'New Sale', icon: '🧋' },
  { to: '/sales', label: 'Sales', icon: '🧾' },
  { to: '/products', label: 'Products', icon: '🍹' },
  { to: '/inventory', label: 'Inventory', icon: '📦' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [shopName, setShopName] = useState(null)

  useEffect(() => {
    api.get('/settings').then((s) => setShopName(s.shop_name)).catch(() => {})
  }, [])

  const brand = shopName || 'AGE BOBA SHOP'

  return (
    <div className="app-shell">
      {open && (
        <div className="sidebar-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
      )}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <Link to="/" style={{ color: '#fff', textDecoration: 'none' }} onClick={() => setOpen(false)}>
            🧋 {brand}
          </Link>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{user?.name}</div>
          <div style={{ opacity: 0.7, marginBottom: 6 }}>{user?.role.replace('_', ' ')}</div>
          <button
            className="sidebar-link"
            onClick={logout}
            style={{ padding: '6px 0', width: '100%', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.78)' }}
          >
            ⏻ Log out
          </button>
        </div>
      </aside>

      <div className="mobile-header">
        <button className="hamburger" onClick={() => setOpen(!open)} aria-label="Toggle menu">
          ☰
        </button>
        <h1>{brand}</h1>
      </div>

      <main className="main-content">{children}</main>
    </div>
  )
}