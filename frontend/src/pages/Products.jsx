import { useState, useEffect, useCallback } from 'react'
import * as api from '../api/client'
import { formatCents } from '../lib/money'
import Badge from '../components/Badge'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import Skeleton from '../components/ui/Skeleton'
import { useToast } from '../store/toast'
import { useAuth } from '../store/auth'

const CENTS_FIELD_HELP = 'Prices are in pesewas as integers (e.g. 2500 = GH₵25.00).'

export default function Products() {
  const { addToast } = useToast()
  const { user } = useAuth()
  const canManage = ['OWNER', 'MANAGER'].includes(user?.role)

  const [products, setProducts] = useState(null)
  const [toppings, setToppings] = useState([])
  const [categories, setCategories] = useState([])
  const [inventoryOptions, setInventoryOptions] = useState([])
  const [error, setError] = useState(null)

  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setError(null)
    Promise.all([api.get('/products?all=1'), api.get('/toppings'), api.get('/products/categories'), api.get('/inventory?all=1')])
      .then(([p, t, cats, inv]) => {
        setProducts(p)
        setToppings(t)
        setCategories(cats)
        setInventoryOptions(inv)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => { load() }, [load])

  const c = (n) => formatCents(n)

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', categoryId: categories[0]?.id ?? null, price: '', hasSizes: false, sizes: [], sizeInv: {}, toppingIds: [], status: 'ACTIVE' })
  }

  const openEdit = (p) => {
    setEditing(p)
    setForm({
      name: p.name,
      categoryId: p.category_id,
      price: p.price ?? '',
      hasSizes: p.sizes.length > 0,
      sizes: p.sizes.map((s) => ({ id: s.id, name: s.name, price: s.price, inventoryItemId: s.inventory_item_id ?? '' })),
      toppingIds: p.toppings.map((t) => t.id),
      status: p.status,
    })
  }

  const toggleStatus = async (p) => {
    try {
      await api.post(`/products/${p.id}/toggle`)
      addToast(`${p.name} ${p.status === 'ACTIVE' ? 'deactivated' : 'activated'}`)
      load()
    } catch (e) {
      addToast(e.message, 'error')
    }
  }

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId || null,
    }
    if (form.status) payload.status = form.status
    if (form.hasSizes) {
      payload.sizes = form.sizes
        .filter((s) => s.name.trim() !== '')
        .map((s) => ({
          name: s.name.trim(),
          price: Number(s.price),
          ...(s.inventoryItemId ? { inventoryItemId: Number(s.inventoryItemId) } : {}),
        }))
      payload.price = null
    } else {
      payload.sizes = []
      payload.price = form.price === '' ? null : Number(form.price)
    }
    payload.toppingIds = form.toppingIds

    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/products/${editing.id}`, payload)
        addToast('Product updated')
      } else {
        await api.post('/products', payload)
        addToast('Product created')
      }
      setForm(null)
      setEditing(null)
      load()
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateSize = (i, patch) => {
    setForm((f) => ({ ...f, sizes: f.sizes.map((s, si) => (si === i ? { ...s, ...patch } : s)) }))
  }

  const toggleTopping = (id) => {
    setForm((f) => ({ ...f, toppingIds: f.toppingIds.includes(id) ? f.toppingIds.filter((x) => x !== id) : [...f.toppingIds, id] }))
  }

  const hasProducts = products && products.length > 0

  return (
    <div>
      <div className="page-header">
        <h1>Products</h1>
        {canManage && (
          <button className="btn btn-primary" onClick={openCreate}>+ Add product</button>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {!products && !error && <div className="card"><Skeleton count={6} height={40} /></div>}

      {products && !hasProducts && <EmptyState icon="🍹" message="No products yet. Add your menu to get started." />}

      {hasProducts && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Options</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{categories.find((c2) => c2.id === p.category_id)?.name ?? '—'}</td>
                  <td className="text-sm text-muted">
                    {p.sizes.length > 0
                      ? p.sizes.map((s) => `${s.name} ${c(s.price)}`).join(', ')
                      : p.price != null ? c(p.price) : '—'}
                    {p.toppings.length > 0 && <span> · {p.toppings.length} topping{p.toppings.length > 1 ? 's' : ''}</span>}
                  </td>
                  <td><Badge status={p.status === 'ACTIVE' ? 'Active' : 'Inactive'} /></td>
                  <td className="text-right">
                    <div className="flex gap-sm justify-end">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                      {canManage && (
                        <button className={`btn ${p.status === 'ACTIVE' ? 'btn-ghost' : 'btn-success'} btn-sm`} onClick={() => toggleStatus(p)}>
                          {p.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!form}
        title={editing ? `Edit ${editing.name}` : 'Add product'}
        onClose={() => setForm(null)}
        footer={
          <>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={saving || !form?.name?.trim()} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {form && (
          <div className="grid-2">
            <div className="input-group">
              <label htmlFor="p-name">Name</label>
              <input id="p-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="input-group">
              <label htmlFor="p-cat">Category</label>
              <select id="p-cat" className="select" value={form.categoryId ?? ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">None</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <label htmlFor="p-status">Status</label>
              <select id="p-status" className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </div>
        )}

        {form && (
          <div className="mt-md">
            <label className="flex gap-sm items-center">
              <input
                type="checkbox"
                checked={form.hasSizes}
                onChange={(e) => setForm({ ...form, hasSizes: e.target.checked })}
              />
              <span className="text-sm">This product has sizes (e.g. Small / Medium / Large)</span>
            </label>
          </div>
        )}

        {form && !form.hasSizes && (
          <div className="input-group mt-md">
            <label htmlFor="p-price">Price {form.status && '(pesewas)'}</label>
            <input id="p-price" className="input" type="number" min="0" step="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="e.g. 1000" />
            <div className="input-error">{CENTS_FIELD_HELP}</div>
          </div>
        )}

        {form && form.hasSizes && (
          <div className="mt-md">
            <div className="text-sm text-muted mb-sm">Sizes (prices in pesewas)</div>
            {form.sizes.map((s, si) => (
              <div className="flex gap-sm mb-sm" key={si} style={{ alignItems: 'flex-end' }}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label>Size name</label>
                  <input className="input" value={s.name} onChange={(e) => updateSize(si, { name: e.target.value })} placeholder="Large" />
                </div>
                <div className="input-group" style={{ width: 110 }}>
                  <label>Price</label>
                  <input className="input" type="number" min="0" value={s.price} onChange={(e) => updateSize(si, { price: e.target.value })} />
                </div>
                <div className="input-group" style={{ flex: 1 }}>
                  <label>Cup item</label>
                  <select className="select" value={s.inventoryItemId} onChange={(e) => updateSize(si, { inventoryItemId: e.target.value })}>
                    <option value="">—</option>
                    {inventoryOptions.map((io) => (
                      <option key={io.id} value={io.id}>{io.name}</option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, sizes: f.sizes.filter((_, x) => x !== si) }))}>✕</button>
              </div>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={() => setForm((f) => ({ ...f, sizes: [...f.sizes, { name: '', price: '', inventoryItemId: '' }] }))}>+ Add size</button>
          </div>
        )}

        {form && toppings.length > 0 && (
          <div className="mt-md">
            <div className="text-sm text-muted mb-sm">Available toppings</div>
            <div className="topping-row">
              {toppings.map((t) => (
                <button
                  key={t.id}
                  className={`topping-chip${form.toppingIds.includes(t.id) ? ' active' : ''}`}
                  onClick={() => toggleTopping(t.id)}
                >
                  {t.name} · {c(t.price)}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}