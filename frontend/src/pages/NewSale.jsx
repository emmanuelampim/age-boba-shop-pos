import { useState, useEffect, useCallback, useMemo } from 'react'
import * as api from '../api/client'
import { useCart } from '../store/cart'
import { useToast } from '../store/toast'
import { useAuth } from '../store/auth'
import { formatCents } from '../lib/money'
import { showThankYou, setMethodName } from '../lib/customerDisplay'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import Skeleton from '../components/ui/Skeleton'
import ReceiptView from '../components/ReceiptView'

const PRODUCT_ICON = '🧋'

export default function NewSale() {
  const { items, subtotal, discount, total, itemCount, dispatch } = useCart()
  const { addToast } = useToast()

  const [products, setProducts] = useState(null)
  const [toppings, setToppings] = useState([])
  const [categories, setCategories] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [branchId, setBranchId] = useState(null)
  const [error, setError] = useState(null)

  const [activeCat, setActiveCat] = useState('ALL')
  const [customizing, setCustomizing] = useState(null)
  const [sizeId, setSizeId] = useState(null)
  const [selectedTops, setSelectedTops] = useState([])
  const [qty, setQty] = useState(1)

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [payMethod, setPayMethod] = useState(null)
  const [discountInput, setDiscountInput] = useState('')
  const [notes, setNotes] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [paymentRef, setPaymentRef] = useState('')
  
  const [settings, setSettings] = useState({})
  const [requestId, setRequestId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const { user } = useAuth()

  const load = useCallback(() => {
    setError(null)
    Promise.all([api.get('/products'), api.get('/toppings'), api.get('/products/categories'), api.get('/settings/payment-methods'), api.get('/branches'), api.get('/settings')])
      .then(([p, t, cats, pms, branches, s]) => {
        setProducts(p)
        setToppings(t)
        setCategories(cats)
        setPaymentMethods(pms.filter((m) => m.is_active))
        setPayMethod((prev) => prev ?? pms.find((m) => m.is_active)?.id ?? null)
        setBranchId((prev) => prev ?? branches[0]?.id ?? null)
        setSettings(s)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const c = (n) => formatCents(n)

  const iconFor = () => PRODUCT_ICON

  const visibleProducts = useMemo(() => {
    if (!products) return []
    if (activeCat === 'ALL') return products
    return products.filter((p) => p.category_id === activeCat)
  }, [products, activeCat])

  const openCustomize = (product) => {
    setCustomizing(product)
    setSizeId(product.sizes?.length ? product.sizes[0]?.id ?? null : null)
    setSelectedTops([])
    setQty(1)
  }

  const toggleTopping = (id) => {
    setSelectedTops((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const unitPrice = customizing
    ? customizing.sizes?.length
      ? customizing.sizes.find((s) => s.id === sizeId)?.price ?? 0
      : customizing.price ?? 0
    : 0
  const toppingUnitTotal = customizing
    ? customizing.toppings.filter((t) => selectedTops.includes(t.id)).reduce((s, t) => s + t.price, 0)
    : 0
  const lineTotal = customizing ? (unitPrice + toppingUnitTotal) * qty : 0

  const addToCart = () => {
    const topList = customizing.toppings.filter((t) => selectedTops.includes(t.id))
    const sortedIds = topList.map((t) => t.id).sort((a, b) => a - b)
    const itemId = [customizing.id, sizeId ?? 'x', ...sortedIds].join('-')
    const item = {
      id: itemId,
      productId: customizing.id,
      sizeId: sizeId ?? null,
      sizeName: customizing.sizes.find((s) => s.id === sizeId)?.name ?? null,
      productName: customizing.name,
      unitPrice,
      toppingUnitTotal,
      toppings: topList.map((t) => ({ id: t.id, name: t.name, price: t.price })),
      quantity: qty,
    }
    dispatch({ type: 'ADD_ITEM', item })
    addToast(`${customizing.name} added to cart`)
    setCustomizing(null)
  }

  const discountCents = discount
  const displayTotal = total

  // Keep the "amount" text field a plain local entry point that writes into
  // the shared cart store (single source of truth for both screens).
  useEffect(() => {
    const cents = Math.round((parseFloat(discountInput) || 0) * 100)
    if (cents !== discount) dispatch({ type: 'SET_DISCOUNT', cents })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountInput])

  const openCheckout = () => {
    if (items.length === 0) return
    setRequestId(crypto.randomUUID())
    setCheckoutOpen(true)
  }

  const completeSale = async () => {
    setSubmitting(true)
    try {
      const order = await api.post('/orders', {
        requestId,
        branchId,
        paymentMethodId: payMethod,
        discount: discountCents,
        notes,
        customerPhone: customerPhone.trim() || undefined,
        paymentRef: last4 || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          ...(i.sizeId ? { sizeId: i.sizeId } : {}),
          toppingIds: i.toppings.map((t) => t.id),
          quantity: i.quantity,
        })),
      })
      if (order.duplicate) {
        addToast('This sale was already recorded.', 'info')
        setCheckoutOpen(false)
        setReviewOpen(false)
        setReceipt(order)
        return
      }
      addToast(`Sale ${order.order_number_display} completed`)
      setMethodName(selectedPayName || 'Payment')
      showThankYou(selectedPayName || 'Payment', order.total ?? displayTotal)
      dispatch({ type: 'CLEAR' })
      setCheckoutOpen(false)
      setReviewOpen(false)
      setDiscountInput('')
      setNotes('')
      setCustomerPhone('')
      setPaymentRef('')
      setReceipt(order)
    } catch (e) {
      addToast(e.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const printReceipt = () => {
    if (!receipt) return
    window.print()
  }

  const selectedPayName = paymentMethods.find((m) => m.id === payMethod)?.name || ''
  const momoPay = paymentMethods.find((m) => m.code === 'MOMO')?.id ?? null
  const isMoMo = payMethod === momoPay
  const last4 = paymentRef.replace(/\D/g, '').slice(0, 4)
  const momoMissingContact = isMoMo && !customerPhone.trim() && !last4
  const momoPreviewRef = isMoMo && last4 ? `****${last4}` : ''

  const draftOrder = {
    order_number_display: '—',
    created_at: new Date().toISOString(),
    items: items.map((i) => ({
      product_name: i.productName,
      size_name: i.sizeName,
      toppings: i.toppings.map((t) => ({ topping_name: t.name })),
      quantity: i.quantity,
      unit_price: i.unitPrice,
      total_price: (i.unitPrice + i.toppingUnitTotal) * i.quantity,
    })),
    subtotal,
    discount: discountCents,
    total: displayTotal,
    payment_method: selectedPayName || '—',
    customer_phone: customerPhone.trim() || '',
    payment_ref: momoPreviewRef,
    momo_status: isMoMo ? 'MANUAL_CONFIRMATION' : '',
    user: { name: user?.name },
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!products) {
    return (
      <div>
        <div className="page-header"><h1>New Sale</h1></div>
        <Skeleton count={6} height={60} />
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>New Sale</h1>
      </div>

      <div className="pos-layout">
        <div className="pos-products">
          <div className="pos-categories" role="tablist" aria-label="Categories">
            <button
              className={`pos-cat-btn${activeCat === 'ALL' ? ' active' : ''}`}
              onClick={() => setActiveCat('ALL')}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={`pos-cat-btn${activeCat === c.id ? ' active' : ''}`}
                onClick={() => setActiveCat(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>

          {visibleProducts.length === 0 && (
            <EmptyState icon="🍽️" message="No products in this category." />
          )}

          <div className="product-grid">
            {visibleProducts.map((p, idx) => (
              <button
                key={p.id}
                className="product-btn"
                onClick={() => openCustomize(p)}
              >
                <span className="icon" aria-hidden="true">{iconFor(idx)}</span>
                <span className="name">{p.name}</span>
                <span className="price">{c(p.sizes?.[0]?.price ?? p.price)}</span>
                {p.sizes?.length > 1 && <span className="price">from {c(p.sizes[0].price)}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="cart">
          <div className="cart-header">
            <span>Current Order</span>
            {items.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  dispatch({ type: 'CLEAR' })
                  setDiscountInput('')
                }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="cart-items">
            {items.length === 0 && (
              <EmptyState icon="🛒" message="Cart is empty. Tap a product to begin." />
            )}
            {items.map((it) => (
              <div className="cart-item" key={it.id}>
                <div className="cart-item-header">
                  <span>
                    {it.productName}
                    {it.sizeName && <span className="text-muted"> · {it.sizeName}</span>}
                  </span>
                  <span className="font-mono">{c((it.unitPrice + it.toppingUnitTotal) * it.quantity)}</span>
                </div>
                {it.toppings.length > 0 && (
                  <div className="cart-item-meta">
                    {it.toppings.map((t) => `+ ${t.name}`).join(', ')}
                  </div>
                )}
                <div className="cart-item-controls">
                  <button className="qty-btn" aria-label="Decrease quantity" onClick={() => dispatch({ type: 'UPDATE_QUANTITY', id: it.id, quantity: it.quantity - 1 })}>−</button>
                  <span className="font-mono">{it.quantity}</span>
                  <button className="qty-btn" aria-label="Increase quantity" onClick={() => dispatch({ type: 'UPDATE_QUANTITY', id: it.id, quantity: it.quantity + 1 })}>+</button>
                  <span className="text-muted text-sm">@ {c(it.unitPrice + it.toppingUnitTotal)} each</span>
                  <button className="cart-remove" onClick={() => dispatch({ type: 'REMOVE_ITEM', id: it.id })}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="cart-footer">
            <div className="cart-row">
              <span>Subtotal</span>
              <span className="font-mono">{c(subtotal)}</span>
            </div>
            {discountCents > 0 && (
              <div className="cart-row discount">
                <span>Discount</span>
                <span className="font-mono">-{c(discountCents)}</span>
              </div>
            )}
            <div className="cart-total">
              <span>Total</span>
              <span className="font-mono">{c(displayTotal)}</span>
            </div>
          </div>
          <div className="checkout-actions">
            <button className="btn btn-primary btn-lg" disabled={items.length === 0} onClick={openCheckout}>
              Checkout
            </button>
          </div>
        </div>
      </div>

      {/* Customization modal */}
      <Modal open={!!customizing} title={customizing?.name ?? ''} onClose={() => setCustomizing(null)}>
        {customizing && (
          <>
            {customizing.sizes?.length > 0 && (
              <div>
                <div className="text-sm text-muted mb-sm">Size</div>
                <div className="size-selector" role="radiogroup" aria-label="Size">
                  {customizing.sizes.map((s) => (
                    <button
                      key={s.id}
                      role="radio"
                      aria-checked={sizeId === s.id}
                      className={`size-btn${sizeId === s.id ? ' active' : ''}`}
                      onClick={() => setSizeId(s.id)}
                    >
                      {s.name} · {c(s.price)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {customizing.toppings?.length > 0 && (
              <div>
                <div className="text-sm text-muted mb-sm">Toppings (multiple)</div>
                <div className="topping-row">
                  {customizing.toppings.map((t) => (
                    <button
                      key={t.id}
                      className={`topping-chip${selectedTops.includes(t.id) ? ' active' : ''}`}
                      onClick={() => toggleTopping(t.id)}
                    >
                      {t.name} · {c(t.price)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-sm text-muted mb-sm">Quantity</div>
              <div className="cart-item-controls">
                <button className="qty-btn" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <span className="font-mono">{qty}</span>
                <button className="qty-btn" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(999, q + 1))}>+</button>
                <span className="text-muted text-sm ms-auto" style={{ marginLeft: 'auto' }}>Line total: <strong className="font-mono">{c(lineTotal)}</strong></span>
              </div>
            </div>

            <button className="btn btn-primary w-full mt-md" onClick={addToCart}>
              Add to cart · {c(lineTotal)}
            </button>
          </>
        )}
      </Modal>

      {/* Checkout modal — step 1: payment details */}
      <Modal open={checkoutOpen} title="Checkout" onClose={() => !submitting && setCheckoutOpen(false)}>
        <div className="review-summary">
          <div className="cart-row"><span>Items</span><span className="font-mono">{itemCount}</span></div>
          <div className="cart-row"><span>Subtotal</span><span className="font-mono">{c(subtotal)}</span></div>
        </div>
        <div className="input-group mt-md">
          <label htmlFor="discount">Discount / price reduction ({settings.currency_symbol || 'GH₵'})</label>
          <input
            id="discount"
            className="input"
            type="number"
            min="0"
            step="0.01"
            value={discountInput}
            onChange={(e) => setDiscountInput(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="cart-total"><span>Total due</span><span className="font-mono">{c(displayTotal)}</span></div>

        <div className="text-sm text-muted mt-md mb-sm">Payment method</div>
        <div className="size-selector">
          {paymentMethods.map((m) => (
            <button
              key={m.id}
              className={`size-btn${payMethod === m.id ? ' active' : ''}`}
              onClick={() => setPayMethod(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>

        {isMoMo && (
          <div className="mt-md">
            <div className="text-sm text-muted mb-sm">Mobile Money — confirm the payment before continuing</div>
            <div className="input-group">
              <label htmlFor="customer-phone">Customer phone number</label>
              <input
                id="customer-phone"
                className="input"
                type="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 0241234567"
                maxLength={40}
              />
            </div>
            <div className="input-group mt-sm">
              <label htmlFor="payment-ref">Last 4 digits of MoMo transaction (optional)</label>
              <input
                id="payment-ref"
                className="input"
                type="text"
                inputMode="numeric"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="e.g. 4821"
                maxLength={4}
                autoComplete="off"
              />
            </div>
            {momoMissingContact && (
              <div className="login-error mt-sm" role="alert">Enter the customer&apos;s phone number or the last 4 digits of the transaction.</div>
            )}
          </div>
        )}

        <div className="input-group mt-md">
          <label htmlFor="notes">Notes (optional)</label>
          <input id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="e.g. table number" />
        </div>

        {discountCents > subtotal && (
          <div className="login-error mt-md" role="alert">Discount cannot exceed the subtotal.</div>
        )}

        <button
          className="btn btn-primary btn-lg w-full mt-md"
          disabled={discountCents > subtotal || !payMethod || momoMissingContact}
          onClick={() => { setCheckoutOpen(false); setReviewOpen(true) }}
        >
          Review order & receipt
        </button>
      </Modal>

      {/* Review modal — step 2: confirm the sale before it is finalized/printed */}
      <Modal open={reviewOpen} title="Review receipt" onClose={() => !submitting && setReviewOpen(false)}>
        <ReceiptView order={draftOrder} settings={settings} />
        <div className="mt-md text-sm text-muted">
          {!payMethod
            ? 'Select a payment method before confirming.'
            : momoMissingContact
              ? 'Enter the customer phone number or the last 4 digits of the MoMo transaction before confirming.'
              : discountCents > subtotal
                  ? 'Fix the discount before confirming.'
                  : 'Confirming finalizes the sale and allows printing. Double-check items, prices and payment.'}
        </div>
        <div className="flex gap-sm mt-md">
          <button className="btn" disabled={submitting} onClick={() => { setReviewOpen(false); setCheckoutOpen(true) }}>
            ← Back
          </button>
          <button
            className="btn btn-success btn-lg w-full"
            disabled={submitting || !payMethod || momoMissingContact || discountCents > subtotal}
            onClick={completeSale}
          >
            {submitting ? 'Confirming sale…' : `Confirm sale · ${c(displayTotal)}`}
          </button>
        </div>
      </Modal>

      {/* Receipt modal — after the sale is confirmed */}
      <Modal open={!!receipt} title="Receipt" onClose={() => setReceipt(null)}>
        <ReceiptView order={receipt} settings={settings} />
        <div className="mt-md">
          <button className="btn btn-primary w-full" onClick={printReceipt}>
            🖨️ Print receipt
          </button>
          <button className="btn btn-secondary w-full mt-sm" onClick={() => setReceipt(null)}>
            New sale
          </button>
        </div>
      </Modal>
    </div>
  )
}