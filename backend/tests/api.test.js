import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { hashPassword } from '../src/lib/crypto.js';
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
  assert.ok(res.body.data.length >= 8);
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
  // 2 x (Large 3000 + Tapioca 300 + Jelly 300) = 2 x 3600 = 7200
  assert.equal(order.subtotal, 7200);
  assert.equal(order.total, 7200);
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].unit_price, 3000);
  assert.equal(order.items[0].total_price, 7200);
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
  assert.ok(Array.isArray(res.body.data.best_sellers));
  assert.ok(Array.isArray(res.body.data.low_stock));
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

test('settings: logo upload saves file and updates receipt_logo_url', async () => {
  const a = await ownerAgent();
  // 1x1 red PNG
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const dataUri = `data:image/png;base64,${pixel}`;
  const res = await a.post('/api/settings/logo').send({ dataUri }).expect(200);
  assert.ok(res.body.data.url.startsWith('/uploads/logo.'));

  const s = await a.get('/api/settings').expect(200);
  assert.ok(s.body.data.receipt_logo_url.includes('/uploads/logo.'));

  // cashier denied
  const cashier = await cashierAgent();
  await cashier.post('/api/settings/logo').send({ dataUri }).expect(403);
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

test('users: owner CRUD, role/status validation', async () => {
  const a = await ownerAgent();
  const created = await a
    .post('/api/users')
    .send({ name: 'New Staff', email: 'staff@example.com', password: 'Staff123', role: 'CASHIER' })
    .expect(201);
  assert.equal(created.body.data.role, 'CASHIER');

  await a.patch(`/api/users/${created.body.data.id}`).send({ role: 'MANAGER' }).expect(200);
  await a.patch(`/api/users/${created.body.data.id}`).send({ status: 'INACTIVE' }).expect(200);

  await a.post('/api/users').send({ name: 'Bad', email: 'bad@example.com', password: 'short', role: 'CASHIER' }).expect(400);

  const cashier = await cashierAgent();
  await cashier.get('/api/users').expect(403);
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