import { getDb, closeDb, initDatabase } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { hashPassword } from './lib/crypto.js';
import { config } from './config.js';

const bp = (ghs) => Math.round(ghs * 100);

function insertOrSkip(db, table, whereSql, matchParams, insertSql, insertParams) {
  const existing = db.prepare(`SELECT id FROM ${table} WHERE ${whereSql}`).get(...matchParams);
  if (existing) return existing.id;
  const res = db.prepare(insertSql).run(...insertParams);
  return res.lastInsertRowid;
}

export async function seed(db = getDb()) {
  await runMigrations(db);

  const ownerId = insertOrSkip(
    db,
    'users',
    'email = ? COLLATE NOCASE',
    ['mavisampim@gmail.com'],
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    ['Owner', 'mavisampim@gmail.com', hashPassword('Owner@123'), 'OWNER'],
  );

  const branchId = insertOrSkip(
    db,
    'branches',
    'name = ?',
    ['AGE BOBA SHOP'],
    'INSERT INTO branches (name, address, phone) VALUES (?, ?, ?)',
    ['AGE BOBA SHOP', 'Agbogba Police Station, Agbogba, Accra', '024 764 4123'],
  );

  db.exec(`
    INSERT INTO payment_methods (name, code, is_active) VALUES
      ('Cash', 'CASH', 1),
      ('Mobile Money', 'MOMO', 1),
      ('Card', 'CARD', 0),
      ('Other', 'OTHER', 0)
    ON CONFLICT(code) DO UPDATE SET is_active = excluded.is_active;
  `);

  const hours = JSON.stringify({
    sun: { open: '15:00', close: '21:00', closed: false },
    mon: { open: '15:00', close: '21:00', closed: false },
    tue: { open: '15:00', close: '21:00', closed: false },
    wed: { open: '15:00', close: '21:00', closed: false },
    thu: { open: '15:00', close: '21:00', closed: false },
    fri: { open: '15:00', close: '21:00', closed: false },
    sat: { open: '15:00', close: '21:00', closed: false },
  });

  const settings = {
    shop_name: 'AGE BOBA SHOP',
    shop_address: 'Agbogba Police Station, Agbogba, Accra',
    shop_phone: '024 764 4123',
    shop_email: '',
    receipt_footer: 'Thank you for visiting AGE BOBA SHOP!',
    currency_code: 'GHS',
    currency_symbol: 'GH₵',
    timezone: 'Africa/Accra',
    hours,
    receipt_show_logo: '0',
    receipt_show_address: '1',
    receipt_show_phone: '1',
  };
  for (const [k, v] of Object.entries(settings)) {
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run(k, v);
  }

  // Inventory
  const cupItems = {};
  const toppingItems = {};
  {
    const defs = [
      ['Small Cup', 'cup', 200, 20, 'SMALL_CUP'],
      ['Medium Cup', 'cup', 200, 20, 'MEDIUM_CUP'],
      ['Large Cup', 'cup', 200, 20, 'LARGE_CUP'],
      ['Tapioca', 'portion', 100, 10, 'TAPIOCA'],
      ['Popping Boba', 'portion', 100, 10, 'POPPING_BOBA'],
      ['Jelly', 'portion', 100, 10, 'JELLY'],
      ['Pudding', 'portion', 100, 10, 'PUDDING'],
    ];
    for (const [name, unit, qty, threshold, key] of defs) {
      const id = insertOrSkip(
        db,
        'inventory_items',
        'name = ?',
        [name],
        'INSERT INTO inventory_items (name, unit, quantity, low_stock_threshold) VALUES (?, ?, ?, ?)',
        [name, unit, qty, threshold],
      );
      if (key.endsWith('_CUP')) cupItems[key] = id;
      else toppingItems[key] = id;
    }
  }

  // Categories + products
  const catId = (name) =>
    insertOrSkip(
      db,
      'categories',
      'code = ?',
      [name.toLowerCase().replace(/[^a-z0-9]+/g, '_')],
      'INSERT INTO categories (name, code) VALUES (?, ?)',
      [name, name.toLowerCase().replace(/[^a-z0-9]+/g, '_')],
    );
  const drinksCat = catId('Drinks');
  const snacksCat = catId('Snacks');
  const bakedCat = catId('Baked');

  {
    const defs = {
      Tapioca: [300, toppingItems.TAPIOCA],
      'Popping Boba': [400, toppingItems.POPPING_BOBA],
      Jelly: [300, toppingItems.JELLY],
      Pudding: [500, toppingItems.PUDDING],
    };
    for (const [name, [price, invId]] of Object.entries(defs)) {
      insertOrSkip(
        db,
        'toppings',
        'name = ?',
        [name],
        'INSERT INTO toppings (name, price, inventory_item_id) VALUES (?, ?, ?)',
        [name, price, invId ?? null],
      );
    }
  }

  const products = {
    Boba: {
      cat: drinksCat,
      sizes: [
        ['Small', 'SMALL', bp(20), cupItems.SMALL_CUP],
        ['Medium', 'MEDIUM', bp(25), cupItems.MEDIUM_CUP],
        ['Large', 'LARGE', bp(30), cupItems.LARGE_CUP],
      ],
      toppings: ['Tapioca', 'Popping Boba', 'Jelly', 'Pudding'],
    },
    'Fruit Juice': {
      cat: drinksCat,
      sizes: [
        ['Small', 'SMALL', bp(15), cupItems.SMALL_CUP],
        ['Medium', 'MEDIUM', bp(20), cupItems.MEDIUM_CUP],
        ['Large', 'LARGE', bp(25), cupItems.LARGE_CUP],
      ],
    },
    Yoghurt: {
      cat: drinksCat,
      sizes: [
        ['Small', 'SMALL', bp(15), cupItems.SMALL_CUP],
        ['Medium', 'MEDIUM', bp(20), cupItems.MEDIUM_CUP],
        ['Large', 'LARGE', bp(25), cupItems.LARGE_CUP],
      ],
    },
    Popcorn: { cat: snacksCat, price: bp(10) },
    Pie: { cat: bakedCat, price: bp(15) },
    Muffin: { cat: bakedCat, price: bp(10) },
    Samosa: { cat: snacksCat, price: bp(5) },
    'Spring Onions': { cat: snacksCat, price: bp(5) },
  };

  for (const [name, def] of Object.entries(products)) {
    const productId = insertOrSkip(
      db,
      'products',
      'name = ? COLLATE NOCASE AND category_id = ?',
      [name, def.cat],
      'INSERT INTO products (category_id, name, price) VALUES (?, ?, ?)',
      [def.cat, name, def.price ?? null],
    );
    const existingSizes = new Set(
      db.prepare('SELECT code FROM product_sizes WHERE product_id = ?').all(productId).map((r) => r.code),
    );
    for (const [sName, sCode, sPrice, invId] of def.sizes ?? []) {
      if (existingSizes.has(sCode)) continue;
      db.prepare(
        'INSERT INTO product_sizes (product_id, name, code, price, inventory_item_id) VALUES (?, ?, ?, ?, ?)',
      ).run(productId, sName, sCode, sPrice, invId ?? null);
    }
    for (const tName of def.toppings ?? []) {
      const topping = db.prepare('SELECT id FROM toppings WHERE name = ?').get(tName);
      if (!topping) continue;
      db.prepare('INSERT OR IGNORE INTO product_toppings (product_id, topping_id) VALUES (?, ?)').run(productId, topping.id);
    }
  }

  return { ownerId, branchId };
}

async function main() {
  try {
    await initDatabase({ filePath: config.dbPath });
    const { ownerId, branchId } = await seed();
    console.log(`Seeded. owner(id=${ownerId}), branch(id=${branchId})`);
    console.log('Login: mavisampim@gmail.com / Owner@123  (change it!)');
    closeDb();
  } catch (err) {
    console.error('Seed failed:', err);
    closeDb();
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();