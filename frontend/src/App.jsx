import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './store/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewSale from './pages/NewSale'
import Sales from './pages/Sales'
import Products from './pages/Products'
import Inventory from './pages/Inventory'
import Settings from './pages/Settings'
import CustomerDisplay from './pages/CustomerDisplay'
import Spinner from './components/ui/Spinner'

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()

  // The customer-facing screen is display-only and needs no login. It is
  // fed exclusively through BroadcastChannel snapshots from the cashier
  // window, so it never talks to the API.
  if (location.pathname === '/customer') {
    return <CustomerDisplay />
  }

  if (loading) {
    return (
      <div className="login-page">
        <Spinner size={40} style={{ color: '#fff' }} />
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sale" element={<NewSale />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/products" element={<Products />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}