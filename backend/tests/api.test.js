import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { hashPassword } from '../src/lib/crypto.js';
import { createUser } from '../src/services/userService.js';
import { initDatabase, closeDb, getDb } from '../src/db/connection.js';

let app;

before(async () => {
  await initDatabase({ inMemory: true });
  const db = getDb();

  await seed(db);

  // add a cashier used by role-enforcement tests
  db.prepare(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
  ).run('Cashier', 'cashier@example.com', hashPassword('Cashier123'), 'CASHIER');

  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
  app = await createApp({ runMigrationsOnStart: false });
});

after(() => {
  closeDb();
  delete process.env.JWT_SECRET;
});

const agent = () => request.agent(app);

async function ownerAgent() {
  const a = agent();
  await a.post('/api/auth/login').send({ email: 'mavisampim@gmail.com', password: 'Owner@123' }).expect(200);
  return a;
}

async function cashierAgent() {
  const a = agent();
  await a.post('/api/auth/login').send({ email: 'cashier@example.com', password: 'Cashier123' }).expect(200);
  return a;
}

async function listBoba(a) {
  const res = await a.get('/api/products').expect(200);
  return res.body.data.find((p) => p.name === 'Boba');
}

test('auth: rejects empty body and bad password', async () => {
  await request(app).post('/api/auth/login').send({}).expect(400);
  await agent().post('/api/auth/login').send({ email: 'mavisampim@gmail.com', password: 'wrong-pass' }).expect(401);
});

test('auth: login, /auth/me, and logout', async () => {
  const a = agent();
  const res = await a.post('/api/auth/login').send({ email: 'mavisampim@gmail.com', password: 'Owner@123' }).expect(200);
  assert.equal(res.body.data.role, 'OWNER');

  const me = await a.get('/api/auth/me').expect(200);
  assert.equal(me.body.data.email, 'mavisampim@gmail.com');

  await a.post('/api/auth/logout').expect(200);
  await a.get('/api/auth/me').expect(401);
});

test('auth: unauthorized requests are rejected', async () => {
  await request(app).get('/api/dashboard/summary').expect(401);
  await request(app).get('/api/products').expect(401);
});

test('products: seeds menu with sizes, toppings, and category endpoint', async () => {
  const a = await ownerAgent();
  const res = await a.get('/api/products').expect(200);
  assert.ok(res.body.data.length >= 1);
  const boba = res.body.data.find((p) => p.name === 'Boba');
  assert.equal(boba.sizes.length, 3);
  assert.equal(boba.sizes[0].price, 2000);
  assert.ok(boba.toppings.length >= 3);

  const cats = await a.get('/api/products/categories').expect(200);
  assert.ok(cats.body.data.some((c) => c.name === 'Drinks'));
});

test('products: create and toggle; cashier forbidden', async () => {
  const a = await ownerAgent();
  const created = await a
    .post('/api/products')
    .send({ name: 'Matcha Latte', categoryId: 1, price: 1800, toppingIds: [1] })
    .expect(201);
  assert.equal(created.body.data.price, 1800);

  const off = await a.post(`/api/products/${created.body.data.id}/toggle`).expect(200);
  assert.equal(off.body.data.status, 'INACTIVE');
  await a.post(`/api/products/${created.body.data.id}/toggle`).expect(200);

  const cashier = await cashierAgent();
  await cashier.post('/api/products').send({ name: 'Nope' }).expect(403);
});

test('order: full sale math, idempotency, and order numbering', async () => {
  const a = await ownerAgent();
  const boba = await listBoba(a);
  const sizes = (await a.get('/api/products').expect(200)).body.data.find((p) => p.name === 'Boba').sizes;
  const largeId = boba.sizes.find((s) => s.code === 'LARGE').id;
  void sizes;

  const toppings = (await a.get('/api/toppings').expect(200)).body.data;
  const tapioca = toppings.find((t) => t.name === 'Tapioca');
  const jelly = toppings.find((t) => t.name === 'Jelly');

  const first = await a
    .post('/api/orders')
    .send({
      requestId: 'e2e-order-0001',
      branchId: 1,
      paymentMethodId: 1,
      items: [
        { productId: boba.id, sizeId: largeId, quantity: 2, toppingIds: [tapioca.id, jelly.id] },
      ],
    })
    .expect(201);

  const order = first.body.data;
  assert.equal(order.order_number_display, '#000001');
  assert.equal(order.status, 'COMPLETED');
  // 2 x (Large 3000 + Tapioca 1000 + Jelly 300) = 2 x 4300 = 8600
  assert.equal(order.subtotal, 8600);
  assert.equal(order.total, 8600);
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].unit_price, 3000);
  assert.equal(order.items[0].total_price, 8600);
  assert.equal(order.items[0].toppings.length, 2);

  // idempotent retry -> duplicate, same id, no second sale
  const retry = await a
    .post('/api/orders')
    .send({
      requestId: 'e2e-order-0001',
      branchId: 1,
      paymentMethodId: 1,
      items: [{ productId: boba.id, sizeId: largeId, quantity: 2, toppingIds: [tapioca.id, jelly.id] }],
    })
    .expect(200);
  assert.equal(retry.body.data.id, order.id);
  assert.equal(retry.body.data.duplicate, true);

  const third = await a
    .post('/api/orders')
    .send({
      requestId: 'e2e-order-0002',
      branchId: 1,
      paymentMethodId: 1,
      items: [{ productId: boba.id, sizeId: largeId, quantity: 1, toppingIds: [] }],
    })
    .expect(201);
  assert.equal(third.body.data.order_number_display, '#000002');
});

test('order: discount is applied without going negative', async () => {
  const a = await ownerAgent();
  const boba = await listBoba(a);
  const largeId = boba.sizes.find((s) => s.code === 'LARGE').id;
  const res = await a
    .post('/api/orders')
    .send({
      requestId: `e2e-disc-${Date.now()}`,
      branchId: 1,
      paymentMethodId: 1,
      discount: 500,
      items: [{ productId: boba.id, sizeId: largeId, quantity: 1, toppingIds: [] }],
    })
    .expect(201);
  assert.equal(res.body.data.subtotal, 3000);
  assert.equal(res.body.data.discount, 500);
  assert.equal(res.body.data.total, 2500);

  // discount larger than subtotal rejected
  await a
    .post('/api/orders')
    .send({
      requestId: `e2e-disc2-${Date.now()}`,
      branchId: 1,
      paymentMethodId: 1,
      discount: 99999,
      items: [{ productId: boba.id, sizeId: largeId, quantity: 1, toppingIds: [] }],
    })
    .expect(400);
});

test('order: insufficient stock is rejected atomically (no partial deduction)', async () => {
  const a = await ownerAgent();
  const boba = await listBoba(a);
  const smallId = boba.sizes.find((s) => s.code === 'SMALL').id;

  const inventory = (await a.get('/api/inventory?all=1').expect(200)).body.data;
  const cup = inventory.find((i) => i.name === 'Small Cup');
  const before = cup.quantity;

  const res = await a
    .post('/api/orders')
    .send({
      requestId: `e2e-stock-${Date.now()}`,
      branchId: 1,
      paymentMethodId: 1,
      items: [{ productId: boba.id, sizeId: smallId, quantity: 500, toppingIds: [] }],
    })
    .expect(400);
  assert.equal(res.body.error.code, 'INSUFFICIENT_STOCK');

  const afterInv = (await a.get('/api/inventory?all=1').expect(200)).body.data;
  assert.equal(afterInv.find((i) => i.name === 'Small Cup').quantity, before);
});

test('order: cancel restores stock, cannot cancel twice, list shows item_count', async () => {
  const a = await ownerAgent();
  const boba = await listBoba(a);
  const smallId = boba.sizes.find((s) => s.code === 'SMALL').id;

  const inventory = (await a.get('/api/inventory?all=1').expect(200)).body.data;
  const before = inventory.find((i) => i.name === 'Small Cup').quantity;

  const created = await a
    .post('/api/orders')
    .send({
      requestId: `e2e-cancel-${Date.now()}`,
      branchId: 1,
      paymentMethodId: 1,
      items: [{ productId: boba.id, sizeId: smallId, quantity: 5, toppingIds: [] }],
    })
    .expect(201);
  assert.equal(
    (await a.get('/api/inventory?all=1').expect(200)).body.data.find((i) => i.name === 'Small Cup').quantity,
    before - 5,
  );

  const cancelled = await a.post(`/api/orders/${created.body.data.id}/cancel`).send({ reason: 'Test' }).expect(200);
  assert.equal(cancelled.body.data.status, 'CANCELLED');
  assert.equal(
    (await a.get('/api/inventory?all=1').expect(200)).body.data.find((i) => i.name === 'Small Cup').quantity,
    before,
  );

  await a.post(`/api/orders/${created.body.data.id}/cancel`).expect(400);

  const list = await a.get('/api/orders?limit=20').expect(200);
  assert.ok(list.body.data.every((o) => typeof o.item_count === 'number'));
});

test('validation: empty basket and duplicate toppings rejected', async () => {
  const a = await ownerAgent();
  const res = await a
    .post('/api/orders')
    .send({ requestId: `e2e-empty-${Date.now()}`, branchId: 1, paymentMethodId: 1, items: [] })
    .expect(400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('orders: Mobile Money requires contact and manual confirmation', async () => {
  const a = await ownerAgent();
  const boba = await listBoba(a);
  const sizeId = boba.sizes.find((s) => s.code === 'LARGE').id;

  // MoMo without any contact info is rejected.
  const missing = await a
    .post('/api/orders')
    .send({ requestId: `e2e-momo-missing-${Date.now()}`, branchId: 1, paymentMethodId: 2, items: [{ productId: boba.id, sizeId, quantity: 1, toppingIds: [] }] })
    .expect(400);
  assert.equal(missing.body.error.code, 'PAYMENT_CONTACT_REQUIRED');

  // MoMo with an invalid phone is rejected at validation time.
  const badPhone = await a
    .post('/api/orders')
    .send({ requestId: `e2e-momo-bad-${Date.now()}`, branchId: 1, paymentMethodId: 2, customerPhone: 'abc', items: [{ productId: boba.id, sizeId, quantity: 1, toppingIds: [] }] })
    .expect(400);
  assert.equal(badPhone.body.error.code, 'VALIDATION_ERROR');

  // Last-4-digits must be exactly 4 digits.
  const shortRef = await a
    .post('/api/orders')
    .send({ requestId: `e2e-momo-short-${Date.now()}`, branchId: 1, paymentMethodId: 2, paymentRef: '123', momoConfirmed: true, items: [{ productId: boba.id, sizeId, quantity: 1, toppingIds: [] }] })
    .expect(400);
  assert.equal(shortRef.body.error.code, 'INVALID_PAYMENT_REF');

  const letterRef = await a
    .post('/api/orders')
    .send({ requestId: `e2e-momo-letters-${Date.now()}`, branchId: 1, paymentMethodId: 2, paymentRef: 'ab12', momoConfirmed: true, items: [{ productId: boba.id, sizeId, quantity: 1, toppingIds: [] }] })
    .expect(400);
  assert.equal(letterRef.body.error.code, 'INVALID_PAYMENT_REF');

  // Payment-ref without manual confirmation is rejected.
  const noConfirm = await a
    .post('/api/orders')
    .send({ requestId: `e2e-momo-noconfirm-${Date.now()}`, branchId: 1, paymentMethodId: 2, paymentRef: '4821', items: [{ productId: boba.id, sizeId, quantity: 1, toppingIds: [] }] })
    .expect(400);
  assert.equal(noConfirm.body.error.code, 'MOMO_CONFIRMATION_REQUIRED');

  // MoMo with phone + last-4 + confirmation is accepted; ref is masked and stored.
  const withPhone = await a
    .post('/api/orders')
    .send({ requestId: `e2e-momo-phone-${Date.now()}`, branchId: 1, paymentMethodId: 2, customerPhone: '+233 24 123 4567', paymentRef: '4821', momoConfirmed: true, items: [{ productId: boba.id, sizeId, quantity: 1, toppingIds: [] }] })
    .expect(201);
  assert.equal(withPhone.body.data.customer_phone, '0241234567');
  assert.equal(withPhone.body.data.payment_ref, '****4821');
  assert.equal(withPhone.body.data.momo_confirmed, 1);
  assert.equal(withPhone.body.data.momo_status, 'MANUAL_CONFIRMATION');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(withPhone.body.data.business_date));

  // The manual confirmation is recorded in the audit log.
  const auditRow = getDb()
    .prepare(
      `SELECT action, details FROM audit_logs
       WHERE action = 'MOMO_PAYMENT_CONFIRMED' AND entity_id = ?`,
    )
    .get(String(withPhone.body.data.id));
  assert.ok(auditRow, 'MOMO_PAYMENT_CONFIRMED audit entry missing');
  assert.ok(auditRow.details.includes('****4821'));

  // MoMo with last-4 only (no phone) is accepted when confirmed.
  const withRef = await a
    .post('/api/orders')
    .send({ requestId: `e2e-momo-ref-${Date.now()}`, branchId: 1, paymentMethodId: 2, paymentRef: '9999', momoConfirmed: true, items: [{ productId: boba.id, sizeId, quantity: 1, toppingIds: [] }] })
    .expect(201);
  assert.equal(withRef.body.data.payment_ref, '****9999');
  assert.equal(withRef.body.data.momo_status, 'MANUAL_CONFIRMATION');

  // Cash has no MoMo fields and no contact requirement.
  const cash = await a
    .post('/api/orders')
    .send({ requestId: `e2e-cash-${Date.now()}`, branchId: 1, paymentMethodId: 1, items: [{ productId: boba.id, sizeId, quantity: 1, toppingIds: [] }] })
    .expect(201);
  assert.equal(cash.body.data.customer_phone, null);
  assert.equal(cash.body.data.payment_ref, null);
  assert.equal(cash.body.data.momo_confirmed, 0);
  assert.equal(cash.body.data.momo_status, null);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(cash.body.data.business_date));
});

test('inventory: restock, waste rejection, history', async () => {
  const a = await ownerAgent();
  const restock = await a
    .post('/api/inventory/adjust')
    .send({ itemId: 1, type: 'RESTOCK', quantity: 10, note: 'supplier' })
    .expect(200);
  assert.equal(restock.body.data.previous, 200);
  assert.equal(restock.body.data.newQuantity, 210);

  await a.post('/api/inventory/adjust').send({ itemId: 1, type: 'WASTE', quantity: 99999 }).expect(400);
  await a.post('/api/inventory/adjust').send({ itemId: 1, type: 'BOGUS', quantity: 5 }).expect(400);

  const tx = await a.get('/api/inventory/transactions?itemId=1').expect(200);
  assert.ok(tx.body.data.some((t) => t.type === 'RESTOCK' && t.quantity_change === 10));
});

test('dashboard: summary is well-formed', async () => {
  const a = await ownerAgent();
  const res = await a.get('/api/dashboard/summary').expect(200);
  assert.equal(typeof res.body.data.today.sales, 'number');
  assert.ok(Array.isArray(res.body.data.today.payment_breakdown));
  assert.ok(Array.isArray(res.body.data.best_sellers));
  assert.ok(Array.isArray(res.body.data.low_stock));
});

test('export: sales CSV requires auth and is a spreadsheet', async () => {
  await request(app).get('/api/export/sales').expect(401);

  const a = await ownerAgent();
  const res = await a.get('/api/export/sales').expect(200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /attachment/);
  // BOM strips for Excel, then the header row.
  assert.match(res.text.replace(/^\uFEFF/, ''), /^Date,Time,Order #,Product,Size,Toppings,Qty,Unit price/);
  // seeded sales from earlier tests are inside the CSV, with prices in GH₵.
  assert.match(res.text, /BROWN SUGAR MILK TEA BOBA|BLUEBERRY MILK TEA BOBA|Tapioca/);
  assert.match(res.text, /Cash,Mavis Ampim,COMPLETED/);
});

test('settings: owner can read/update, cashier denied', async () => {
  const a = await ownerAgent();
  const s = await a.get('/api/settings').expect(200);
  assert.equal(s.body.data.shop_name, 'AGE BOBA SHOP');

  await a.patch('/api/settings').send({ shop_name: 'AGE BOBA SHOP TEST' }).expect(200);
  assert.equal((await a.get('/api/settings').expect(200)).body.data.shop_name, 'AGE BOBA SHOP TEST');
  await a.patch('/api/settings').send({ shop_name: 'AGE BOBA SHOP' }).expect(200);

  const cashier = await cashierAgent();
  await cashier.patch('/api/settings').send({ shop_name: 'x' }).expect(403);
});

test('settings: email can be set and cleared', async () => {
  const a = await ownerAgent();
  await a.patch('/api/settings').send({ shop_email: 'info@ageboba.com' }).expect(200);
  const s = await a.get('/api/settings').expect(200);
  assert.equal(s.body.data.shop_email, 'info@ageboba.com');

  // invalid email rejected
  await a.patch('/api/settings').send({ shop_email: 'not-an-email' }).expect(400);

  // clear
  await a.patch('/api/settings').send({ shop_email: '' }).expect(200);
  const cleared = await a.get('/api/settings').expect(200);
  assert.equal(cleared.body.data.shop_email, '');
});

test('settings: hours are stored as parsed object', async () => {
  const a = await ownerAgent();
  const s = await a.get('/api/settings').expect(200);
  assert.ok(s.body.data.hours && typeof s.body.data.hours === 'object');
  assert.equal(s.body.data.hours.mon.open, '15:00');
  assert.equal(s.body.data.hours.mon.close, '21:00');
  assert.equal(s.body.data.hours.mon.closed, false);

  await a.patch('/api/settings').send({
    hours: {
      mon: { open: '09:00', close: '17:00', closed: false },
      sun: { open: '00:00', close: '00:00', closed: true },
    },
  }).expect(200);
  const updated = await a.get('/api/settings').expect(200);
  assert.equal(updated.body.data.hours.mon.open, '09:00');
  assert.equal(updated.body.data.hours.sun.closed, true);
  assert.equal(updated.body.data.hours.wed.open, '15:00'); // unchanged days kept
});

test('settings: customer display defaults seed into GET /settings', async () => {
  const a = await ownerAgent();
  const s = await a.get('/api/settings').expect(200);
  assert.equal(s.body.data.customer_display_enabled, true);
  assert.equal(s.body.data.customer_thank_you_message, 'THANK YOU!');
  assert.equal(s.body.data.customer_thank_you_seconds, '8');
});

test('settings: customer display values update and validate', async () => {
  const a = await ownerAgent();

  // boolean toggle persisted
  await a.patch('/api/settings').send({ customer_display_enabled: false }).expect(200);
  assert.equal((await a.get('/api/settings').expect(200)).body.data.customer_display_enabled, false);
  // non-boolean rejected
  await a.patch('/api/settings').send({ customer_display_enabled: 'no' }).expect(400);
  await a.patch('/api/settings').send({ customer_display_enabled: true }).expect(200);

  // thank-you message saved
  await a.patch('/api/settings').send({ customer_thank_you_message: 'Come again!' }).expect(200);
  assert.equal((await a.get('/api/settings').expect(200)).body.data.customer_thank_you_message, 'Come again!');

  // seconds: 3..30 only
  await a.patch('/api/settings').send({ customer_thank_you_seconds: '2' }).expect(400);
  await a.patch('/api/settings').send({ customer_thank_you_seconds: '31' }).expect(400);
  await a.patch('/api/settings').send({ customer_thank_you_seconds: 'abc' }).expect(400);
  await a.patch('/api/settings').send({ customer_thank_you_seconds: '12' }).expect(200);
  assert.equal((await a.get('/api/settings').expect(200)).body.data.customer_thank_you_seconds, '12');
});

test('settings: logo upload endpoint removed (fixed receipt logo)', async () => {
  const a = await ownerAgent();
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const dataUri = `data:image/png;base64,${pixel}`;
  await a.post('/api/settings/logo').send({ dataUri }).expect(404);
});

test('shutdown: endpoint is only exposed outside test mode (safety)', async () => {
  const a = await ownerAgent();
  await a.post('/api/shutdown').expect(404);
});

test('settings: payment methods default to Cash and Mobile Money only', async () => {
  const a = await ownerAgent();
  const methods = await a.get('/api/settings/payment-methods').expect(200);
  const active = methods.body.data.filter((m) => m.is_active);
  assert.ok(active.some((m) => m.code === 'CASH'));
  assert.ok(active.some((m) => m.code === 'MOMO'));
  assert.ok(!active.some((m) => m.code === 'CARD'));
  assert.ok(!active.some((m) => m.code === 'OTHER'));
});

test('payment methods: list and toggle', async () => {
  const a = await ownerAgent();
  const methods = await a.get('/api/settings/payment-methods').expect(200);
  assert.ok(methods.body.data.length >= 4);

  const cash = methods.body.data.find((m) => m.name === 'Cash');
  await a.patch(`/api/settings/payment-methods/${cash.id}`).send({ isActive: false }).expect(200);
  const updated = await a.get('/api/settings/payment-methods').expect(200);
  assert.equal(updated.body.data.find((m) => m.id === cash.id).is_active, 0);
  await a.patch(`/api/settings/payment-methods/${cash.id}`).send({ isActive: true }).expect(200);
});

test('users: owner can list and update users (no user creation API)', async () => {
  const a = await ownerAgent();
  const created = createUser({
    name: 'New Staff',
    email: 'staff@example.com',
    password: 'Staff123',
    role: 'CASHIER',
    user: { id: 1 },
  });
  assert.equal(created.role, 'CASHIER');

  await a.patch(`/api/users/${created.id}`).send({ role: 'MANAGER' }).expect(200);
  await a.patch(`/api/users/${created.id}`).send({ status: 'INACTIVE' }).expect(200);

  await a.patch(`/api/users/${created.id}`).send({ role: 'NOPE' }).expect(400);
  await a.patch(`/api/users/${created.id}`).send({ status: 'BAD' }).expect(400);
  await a.post('/api/users').send({ name: 'X' }).expect(404);

  const cashier = await cashierAgent();
  await cashier.get('/api/users').expect(403);
});

test('users: the last active owner cannot be deactivated (lockout guard)', async () => {
  const a = await ownerAgent();
  const me = (await a.get('/api/auth/me').expect(200)).body.data;
  assert.equal(me.role, 'OWNER');

  // One active owner exists -> deactivating them must be refused.
  const res = await a.patch(`/api/users/${me.id}`).send({ status: 'INACTIVE' }).expect(409);
  assert.equal(res.body.error.code, 'LAST_OWNER');

  // Profile still active afterwards.
  const after = await a.get('/api/auth/me').expect(200);
  assert.equal(after.body.data.status, 'ACTIVE');
});

test('permissions: cashier can read but not write admin resources', async () => {
  const cashier = await cashierAgent();
  await cashier.post('/api/inventory/adjust').send({ itemId: 1, type: 'RESTOCK', quantity: 1 }).expect(403);
  await cashier.patch('/api/products/1').send({ price: 1 }).expect(403);
  await cashier.post('/api/orders/1/cancel').expect(403);
  await cashier.get('/api/users').expect(403);

  await cashier.get('/api/products').expect(200);
  await cashier.get('/api/inventory/transactions?itemId=1').expect(200);
  await cashier.get('/api/orders?limit=5').expect(200);
});

test('getDb is wired and queryable', async () => {
  const row = getDb().prepare('SELECT 1 AS ok').get();
  assert.equal(row.ok, 1);
});