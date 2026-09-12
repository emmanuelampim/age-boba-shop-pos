import { useEffect, useReducer, useRef } from 'react';
import {
  CHANNEL_NAME,
  WINDOW_NAME,
  initialState,
  reduceCustomerView,
} from '../lib/customerDisplayCore';

function statusMessage(state) {
  switch (state.view) {
    case 'standby':
      return 'Waiting for operator\u2026';
    case 'thankyou':
      return state.methodName || 'Payment received';
    case 'order':
      return 'YOUR ORDER';
    default:
      return null;
  }
}

export default function CustomerDisplay() {
  const [view, dispatch] = useReducer(reduceCustomerView, null, initialState);
  const viewRef = useRef(view);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // A thankyou is short-lived (operator setting): fall back to idle when it
  // expires. Rebroadcasts from the cashier (fresh `at`) keep it alive.
  useEffect(() => {
    if (view.view !== 'thankyou') return undefined;
    const ttl = (view.branding?.thankYouSeconds || 8) * 1000;
    const timer = window.setTimeout(
      () => {
        if (viewRef.current.view === 'thankyou') {
          dispatch({ type: 'idle', branding: viewRef.current.branding });
        }
      },
      ttl,
    );
    return () => window.clearTimeout(timer);
  }, [view.view, view.branding, view.at]);

  useEffect(() => {
    // Identify ourselves so a named window.open() reuse can find us and
    // request state on reload.
    window.name = WINDOW_NAME;

    // Try to take over the whole second screen (best-effort, browser may
    // require a user gesture).
    document.documentElement.requestFullscreen?.().catch(() => {});
    // Prevent context menu so the display looks like a kiosk.
    const preventCtx = (e) => e.preventDefault();
    document.addEventListener('contextmenu', preventCtx);

    let channel;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return undefined;
    }
    channel.onmessage = (event) => dispatch(event.data);
    channel.postMessage({ type: 'hello' });
    return () => {
      document.removeEventListener('contextmenu', preventCtx);
      channel.close();
    };
  }, []);

  const status = statusMessage(view);
  const currencySymbol = view?.branding?.currencySymbol || 'GH\u20B5';
  const fmt = (cents) =>
    `${currencySymbol}${Math.abs(cents || 0).toFixed(2)}`;

  if (view.view === 'standby') {
    return (
      <div className="customer-screen customer-standby">
        <div className="customer-standby-text">Screen waiting\u2026</div>
      </div>
    );
  }

  if (view.view === 'thankyou') {
    const message =
      (view.branding && view.branding.thankYouMessage) || 'THANK YOU!';
    return (
      <div className="customer-screen customer-thankyou">
        <div className="customer-thankyou-box">
          <div className="customer-thankyou-big">PAYMENT RECEIVED</div>
          <div className="customer-thankyou-amount">{fmt(view.total)}</div>
          <div className="customer-thankyou-method">{view.methodName || 'PAYMENT'}</div>
          <div className="customer-thankyou-msg">{message}</div>
        </div>
      </div>
    );
  }

  // Idle state
  if (view.view === 'idle') {
    const b = view.branding || {};
    return (
      <div className="customer-screen customer-idle">
        <div className="customer-idle-box">
          <img
            src="/logo.png"
            alt={b.shopName || 'AGE BOBA SHOP'}
            className="customer-idle-logo"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div className="customer-idle-name">{b.shopName || 'AGE BOBA SHOP'}</div>
          <div className="customer-idle-welcome">Welcome!</div>
          {b.address && <div className="customer-idle-addr">{b.address}</div>}
          {b.phone && <div className="customer-idle-phone">{b.phone}</div>}
        </div>
      </div>
    );
  }

  // Active order view
  const items = (view.cart && view.cart.items) || [];
  return (
    <div className="customer-screen customer-order">
      <div className="customer-order-header">
        {view.branding?.shopName || 'AGE BOBA SHOP'}
      </div>
      <div className="customer-order-sub">{status || 'YOUR ORDER'}</div>

      <table className="customer-order-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const detail = [it.productName, it.sizeName || null, (it.toppings || []).join(', ') || null]
              .filter(Boolean)
              .join('\n');
            return (
              <tr key={i} className="customer-order-row">
                <td>
                  <span className="customer-item-detail">{detail}</span>
                  {it.quantity > 1 && <span className="customer-item-qty"> x{it.quantity}</span>}
                </td>
                <td className="right font-mono">{fmt(it.lineCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="customer-order-totals">
        <div className="customer-order-row customer-order-subtotal">
          <span>Subtotal</span>
          <span className="right font-mono">{fmt(view.cart.subtotal)}</span>
        </div>
        {view.cart.discount > 0 && (
          <div className="customer-order-row customer-order-discount">
            <span>Discount</span>
            <span className="right font-mono">-{fmt(view.cart.discount)}</span>
          </div>
        )}
        <div className="customer-order-row customer-order-total">
          <span>TOTAL</span>
          <span className="right font-mono">{fmt(view.cart.total)}</span>
        </div>
      </div>
    </div>
  );
}