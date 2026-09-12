// Pure logic for the customer display. No React, no browser APIs - this
// module is unit-tested. Everything here must stay platform-agnostic.
import { formatCents } from './money.js';

export const CHANNEL_NAME = 'boba-pos-customer-display';
export const WINDOW_NAME = 'boba-customer-display';
export const CUSTOMER_PATH = '/customer';

export function displayItems(cart) {
  return (cart?.items || []).map((it) => ({
    name: it.productName,
    sizeName: it.sizeName || null,
    toppings: (it.toppings || []).map((t) => t.name),
    quantity: it.quantity,
    unitCents: (it.unitPrice || 0) + (it.toppingUnitTotal || 0),
    lineCents: ((it.unitPrice || 0) + (it.toppingUnitTotal || 0)) * it.quantity,
  }));
}

export function brandingOf(settings) {
  return {
    shopName: (settings && settings.shop_name) || 'AGE BOBA SHOP',
    address: (settings && settings.shop_address) || '',
    phone: (settings && settings.shop_phone) || '',
    currencySymbol: (settings && settings.currency_symbol) || 'GH₵',
    thankYouMessage: (settings && settings.customer_thank_you_message) || 'THANK YOU!',
    thankYouSeconds: Number.parseInt(String(settings && settings.customer_thank_you_seconds), 10) || 8,
  };
}

export function buildCartSnapshot(settings, cart, methodName) {
  const items = displayItems(cart);
  return {
    type: 'cart',
    cart: {
      items,
      subtotal: cart.subtotal,
      discount: cart.discount,
      total: cart.total,
      methodName: methodName || null,
    },
    branding: brandingOf(settings),
    at: Date.now(),
  };
}

export function buildThankYouSnapshot(settings, methodName, total) {
  return {
    type: 'thankyou',
    methodName,
    total,
    branding: brandingOf(settings),
    at: Date.now(),
  };
}

export function buildIdleSnapshot(settings) {
  return { type: 'idle', branding: brandingOf(settings), at: Date.now() };
}

export function buildStandbySnapshot() {
  return { type: 'disable', at: Date.now() };
}

export function initialState() {
  return { view: 'idle', branding: brandingOf({}) };
}

// The customer screen's state machine. `msg` is one of the broadcast
// messages produced above; `state` is the current customer view.
export function reduceCustomerView(state, msg) {
  if (!msg || typeof msg !== 'object') return state;
  switch (msg.type) {
    case 'disable':
      return { view: 'standby', branding: state.branding };
    case 'thankyou':
      return {
        view: 'thankyou',
        methodName: msg.methodName,
        total: msg.total,
        branding: msg.branding || state.branding,
        at: msg.at || Date.now(),
      };
    case 'cart': {
      if (msg.cart.items.length > 0) {
        return { view: 'order', cart: msg.cart, branding: msg.branding || state.branding };
      }
      // An empty cart (e.g. freshly cleared) never cuts a running
      // thank-you short; the thank-you timer handles that.
      if (state.view === 'thankyou') return state;
      return { view: 'idle', branding: msg.branding || state.branding };
    }
    case 'idle':
      return { view: 'idle', branding: msg.branding || state.branding };
    default:
      return state;
  }
}

// Re-exported so the customer display uses exactly the same formatter as
// the rest of the POS (single money-formatting source).
export { formatCents };