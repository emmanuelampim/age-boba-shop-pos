import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_NAME,
  WINDOW_NAME,
  CUSTOMER_PATH,
  displayItems,
  brandingOf,
  buildCartSnapshot,
  buildThankYouSnapshot,
  buildIdleSnapshot,
  buildStandbySnapshot,
  initialState,
  reduceCustomerView,
  formatCents,
} from '../../frontend/src/lib/customerDisplayCore.js';

const SETTINGS = {
  shop_name: 'AGE BOBA SHOP',
  shop_address: '1 Main St',
  shop_phone: '+233555',
  currency_symbol: 'GH₵',
  customer_thank_you_message: 'THANK YOU!',
  customer_thank_you_seconds: '8',
};

const CART = {
  items: [
    {
      productName: 'Green Milk Tea',
      sizeName: 'Large',
      unitPrice: 2500,
      toppingUnitTotal: 400,
      toppings: [{ name: 'Tapioca' }, { name: 'Jelly' }],
      quantity: 2,
    },
  ],
  subtotal: 5800,
  discount: 300,
  total: 5500,
};

test('channel identity constants', () => {
  assert.equal(CHANNEL_NAME, 'boba-pos-customer-display');
  assert.equal(WINDOW_NAME, 'boba-customer-display');
  assert.equal(CUSTOMER_PATH, '/customer');
});

test('displayItems maps to the customer-facing item shape', () => {
  const items = displayItems(CART);
  assert.equal(items.length, 1);
  const it = items[0];
  assert.equal(it.name, 'Green Milk Tea');
  assert.equal(it.sizeName, 'Large');
  assert.deepEqual(it.toppings, ['Tapioca', 'Jelly']);
  assert.equal(it.quantity, 2);
  assert.equal(it.unitCents, 2900);
  assert.equal(it.lineCents, 5800);
  assert.deepEqual(displayItems({}), []);
});

test('brandingOf falls back to sensible defaults', () => {
  assert.equal(brandingOf({}).shopName, 'AGE BOBA SHOP');
  assert.equal(brandingOf({}).currencySymbol, 'GH₵');
  assert.equal(brandingOf({}).thankYouMessage, 'THANK YOU!');
  assert.equal(brandingOf({}).thankYouSeconds, 8);
});

test('brandingOf reads from settings', () => {
  const b = brandingOf(SETTINGS);
  assert.equal(b.shopName, 'AGE BOBA SHOP');
  assert.equal(b.address, '1 Main St');
  assert.equal(b.phone, '+233555');
  assert.equal(b.currencySymbol, 'GH₵');
  assert.equal(b.thankYouSeconds, 8);
});

test('buildCartSnapshot carries the cart, method and branding', () => {
  const snap = buildCartSnapshot(SETTINGS, CART, 'Mobile Money');
  assert.equal(snap.type, 'cart');
  assert.equal(snap.cart.subtotal, 5800);
  assert.equal(snap.cart.discount, 300);
  assert.equal(snap.cart.total, 5500);
  assert.equal(snap.cart.methodName, 'Mobile Money');
  assert.equal(snap.branding.shopName, 'AGE BOBA SHOP');
  assert.ok(Number.isFinite(snap.at));
});

test('buildThankYouSnapshot carries total, method and branding', () => {
  const snap = buildThankYouSnapshot(SETTINGS, 'Cash', 5500);
  assert.equal(snap.type, 'thankyou');
  assert.equal(snap.total, 5500);
  assert.equal(snap.methodName, 'Cash');
  assert.equal(snap.branding.thankYouSeconds, 8);
});

test('buildIdleSnapshot shows active branding', () => {
  const snap = buildIdleSnapshot(SETTINGS);
  assert.equal(snap.type, 'idle');
  assert.equal(snap.branding.shopName, 'AGE BOBA SHOP');
});

test('buildStandbySnapshot is a bare disable message', () => {
  const snap = buildStandbySnapshot();
  assert.equal(snap.type, 'disable');
  assert.ok(Number.isFinite(snap.at));
});

test('initialState is idle with default branding', () => {
  const s = initialState();
  assert.equal(s.view, 'idle');
  assert.equal(s.branding.shopName, 'AGE BOBA SHOP');
});

test('reducer: ignores malformed / unknown messages', () => {
  const s = initialState();
  assert.equal(reduceCustomerView(s, null), s);
  assert.equal(reduceCustomerView(s, 'hello'), s);
  assert.equal(reduceCustomerView(s, { type: 'whatever' }), s);
});

test('reducer: non-empty cart shows the order', () => {
  const s = reduceCustomerView(initialState(), buildCartSnapshot(SETTINGS, CART, null));
  assert.equal(s.view, 'order');
  assert.equal(s.cart.total, 5500);
});

test('reducer: empty cart from idle stays idle', () => {
  const s = reduceCustomerView(initialState(), buildCartSnapshot(SETTINGS, { ...CART, items: [] }, null));
  assert.equal(s.view, 'idle');
});

test('reducer: empty-cart broadcast never cuts a running thank-you short', () => {
  const s1 = reduceCustomerView(initialState(), buildThankYouSnapshot(SETTINGS, 'Cash', 5500));
  assert.equal(s1.view, 'thankyou');
  const s2 = reduceCustomerView(s1, buildCartSnapshot(SETTINGS, { ...CART, items: [] }, null));
  assert.equal(s2.view, 'thankyou');
});

test('reducer: a new non-empty cart overrides a running thank-you', () => {
  const s1 = reduceCustomerView(initialState(), buildThankYouSnapshot(SETTINGS, 'Cash', 5500));
  const s2 = reduceCustomerView(s1, buildCartSnapshot(SETTINGS, CART, null));
  assert.equal(s2.view, 'order');
});

test('reducer: disable switches to standby and keeps branding', () => {
  const s = reduceCustomerView(initialState(), buildStandbySnapshot());
  assert.equal(s.view, 'standby');
  assert.equal(s.branding.shopName, 'AGE BOBA SHOP');
});

test('reducer: explicit idle broadcast after thankyou returns to idle', () => {
  const s1 = reduceCustomerView(initialState(), buildThankYouSnapshot(SETTINGS, 'Cash', 5500));
  const s2 = reduceCustomerView(s1, buildIdleSnapshot(SETTINGS));
  assert.equal(s2.view, 'idle');
});

test('formatCents re-export matches the shared money formatter', () => {
  assert.equal(formatCents(5500), 'GH₵55.00');
  assert.equal(formatCents(-50), '-GH₵0.50');
});