import { getDb, transaction, formatRow, formatRows } from '../db/connection.js';
import { AppError } from '../lib/http.js';
import { audit } from '../lib/audit.js';

function attachOptions(products) {
  const db = getDb();
  return products.map((p) => {
    const sizes = db
      .prepare('SELECT * FROM product_sizes WHERE product_id = ? ORDER BY price, id')
      .all(p.id);
    const toppings = db
      .prepare(
        `SELECT t.* FROM product_toppings pt JOIN toppings t ON t.id = pt.topping_id
         WHERE pt.product_id = ? ORDER BY t.name`,
      )
      .all(p.id);
    return { ...formatRow(p), sizes: formatRows(sizes), toppings: formatRows(toppings) };
  });
}

export function listProducts({ status } = {}) {
  const db = getDb();
  const rows = status
    ? db.prepare('SELECT * FROM products WHERE status = ? ORDER BY name').all(status)
    : db.prepare('SELECT * FROM products ORDER BY name').all();
  return attachOptions(rows);
}

export function getProduct(productId) {
  const db = getDb();
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!p) return null;
  return attachOptions([p])[0];
}

export function createProduct({ name, description, imageUrl, categoryId, price, sizes, toppingIds, user }) {
  return transaction(() => {
    const db = getDb();
    if (categoryId) {
      const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
      if (!cat) throw new AppError(400, 'CATEGORY_NOT_FOUND', 'Category not found.');
    }
    const res = db
      .prepare(
        `INSERT INTO products (category_id, name, description, image_url, price)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(categoryId ?? null, name.trim(), description ?? null, imageUrl ?? null, price ?? null);
    const productId = res.lastInsertRowid;
    saveSizes(db, productId, sizes ?? []);
    saveToppings(db, productId, toppingIds ?? []);
    audit({
      user,
      action: 'PRODUCT_CREATED',
      entityType: 'product',
      entityId: productId,
      details: { name: name.trim() },
    });
    return getProduct(productId);
  });
}

export function updateProduct({ productId, patch, user }) {
  return transaction(() => {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!existing) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');

    if (patch.categoryId !== undefined) {
      const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(patch.categoryId);
      if (!cat) throw new AppError(400, 'CATEGORY_NOT_FOUND', 'Category not found.');
    }
    const name = patch.name !== undefined ? patch.name.trim() : existing.name;
    const price = patch.price !== undefined ? patch.price : existing.price;
    const status = patch.status !== undefined ? patch.status : existing.status;

    db.prepare(
      `UPDATE products SET name = ?, description = ?, image_url = ?, price = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(
      name,
      patch.description !== undefined ? patch.description : existing.description,
      patch.imageUrl !== undefined ? patch.imageUrl : existing.image_url,
      price,
      status,
      productId,
    );

    if (patch.sizes !== undefined) {
      db.prepare('DELETE FROM product_sizes WHERE product_id = ?').run(productId);
      saveSizes(db, productId, patch.sizes);
    }
    if (patch.toppingIds !== undefined) {
      db.prepare('DELETE FROM product_toppings WHERE product_id = ?').run(productId);
      saveToppings(db, productId, patch.toppingIds);
    }

    audit({
      user,
      action: 'PRODUCT_UPDATED',
      entityType: 'product',
      entityId: productId,
      details: {
        fields: Object.keys(patch),
        priceChanged: patch.price !== undefined && patch.price !== existing.price,
      },
    });
    return getProduct(productId);
  });
}

export function toggleProduct(productId, user) {
  return transaction(() => {
    const db = getDb();
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!p) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    const newStatus = p.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    db.prepare("UPDATE products SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      newStatus,
      productId,
    );
    audit({
      user,
      action: 'PRODUCT_STATUS_CHANGED',
      entityType: 'product',
      entityId: productId,
      details: { from: p.status, to: newStatus },
    });
    return getProduct(productId);
  });
}

function saveSizes(db, productId, sizes) {
  for (const s of sizes) {
    if (!s.name || typeof s.name !== 'string') throw new AppError(400, 'VALIDATION_ERROR', 'Each size needs a name.');
    if (!Number.isInteger(s.price) || s.price < 0) throw new AppError(400, 'VALIDATION_ERROR', `Size "${s.name}" needs a non-negative integer price.`);
    db.prepare(
      `INSERT INTO product_sizes (product_id, name, code, price, inventory_item_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      productId,
      s.name.trim(),
      s.code && typeof s.code === 'string' ? String(s.code).trim() : s.name.trim().toUpperCase().replace(/\s+/g, '_'),
      s.price,
      Number.isInteger(s.inventoryItemId) ? s.inventoryItemId : null,
      s.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    );
  }
}

function saveToppings(db, productId, toppingIds) {
  for (const tid of toppingIds) {
    const t = db.prepare('SELECT id FROM toppings WHERE id = ?').get(tid);
    if (!t) throw new AppError(400, 'TOPPING_NOT_FOUND', `Topping #${tid} not found.`);
    db.prepare('INSERT INTO product_toppings (product_id, topping_id) VALUES (?, ?)').run(productId, tid);
  }
}

// ---- Toppings ----

export function listToppings() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.*, i.name AS inventory_item_name FROM toppings t
       LEFT JOIN inventory_items i ON i.id = t.inventory_item_id ORDER BY t.name`,
    )
    .all();
  return formatRows(rows);
}

export function createTopping({ name, price, inventoryItemId, user }) {
  return transaction(() => {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM toppings WHERE name = ? COLLATE NOCASE').get(name.trim());
    if (existing) throw new AppError(409, 'TOPPING_EXISTS', 'A topping with that name already exists.');
    const res = db
      .prepare('INSERT INTO toppings (name, price, inventory_item_id) VALUES (?, ?, ?)')
      .run(name.trim(), price, inventoryItemId ?? null);
    audit({ user, action: 'TOPPING_CREATED', entityType: 'topping', entityId: res.lastInsertRowid, details: { name: name.trim() } });
    return db.prepare('SELECT * FROM toppings WHERE id = ?').get(res.lastInsertRowid);
  });
}

export function updateTopping({ toppingId, patch, user }) {
  return transaction(() => {
    const db = getDb();
    const t = db.prepare('SELECT * FROM toppings WHERE id = ?').get(toppingId);
    if (!t) throw new AppError(404, 'TOPPING_NOT_FOUND', 'Topping not found.');
    const name = patch.name !== undefined ? patch.name.trim() : t.name;
    const price = patch.price !== undefined ? patch.price : t.price;
    const status = patch.status !== undefined ? patch.status : t.status;
    db.prepare('UPDATE toppings SET name = ?, price = ?, status = ? WHERE id = ?').run(name, price, status, toppingId);
    if (patch.inventoryItemId !== undefined) {
      db.prepare('UPDATE toppings SET inventory_item_id = ? WHERE id = ?').run(patch.inventoryItemId, toppingId);
    }
    audit({ user, action: 'TOPPING_UPDATED', entityType: 'topping', entityId: toppingId, details: { fields: Object.keys(patch) } });
    return db.prepare('SELECT * FROM toppings WHERE id = ?').get(toppingId);
  });
}

export function toggleTopping(toppingId, user) {
  return transaction(() => {
    const db = getDb();
    const t = db.prepare('SELECT * FROM toppings WHERE id = ?').get(toppingId);
    if (!t) throw new AppError(404, 'TOPPING_NOT_FOUND', 'Topping not found.');
    const newStatus = t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    db.prepare('UPDATE toppings SET status = ? WHERE id = ?').run(newStatus, toppingId);
    audit({ user, action: 'TOPPING_STATUS_CHANGED', entityType: 'topping', entityId: toppingId, details: { from: t.status, to: newStatus } });
    return db.prepare('SELECT * FROM toppings WHERE id = ?').get(toppingId);
  });
}

// ---- Categories ----

export function listCategories() {
  const rows = getDb().prepare('SELECT * FROM categories ORDER BY name').all();
  return formatRows(rows);
}

export function createCategory({ name, user }) {
  return transaction(() => {
    const db = getDb();
    const code = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const existing = db.prepare('SELECT id FROM categories WHERE code = ?').get(code);
    if (existing) throw new AppError(409, 'CATEGORY_EXISTS', 'Category already exists.');
    const res = db
      .prepare('INSERT INTO categories (name, code) VALUES (?, ?)')
      .run(name.trim(), code);
    audit({ user, action: 'CATEGORY_CREATED', entityType: 'category', entityId: res.lastInsertRowid, details: { name: name.trim() } });
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(res.lastInsertRowid);
  });
}