module.exports = function up(db) {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'CASHIER',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      price INTEGER,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (price IS NULL OR price >= 0)
    );

    CREATE TABLE product_sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (product_id, code)
    );

    CREATE TABLE toppings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price INTEGER NOT NULL CHECK (price >= 0),
      inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE product_toppings (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      topping_id INTEGER NOT NULL REFERENCES toppings(id) ON DELETE CASCADE,
      PRIMARY KEY (product_id, topping_id)
    );

    CREATE TABLE payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE order_sequences (
      branch_id INTEGER PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
      current_value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number INTEGER NOT NULL,
      request_id TEXT UNIQUE,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
      discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
      total INTEGER NOT NULL CHECK (total >= 0),
      payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE RESTRICT,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (total <= subtotal)
    );

    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_size_id INTEGER REFERENCES product_sizes(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      size_name TEXT,
      unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      total_price INTEGER NOT NULL CHECK (total_price >= 0)
    );

    CREATE TABLE order_item_toppings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      topping_id INTEGER REFERENCES toppings(id) ON DELETE SET NULL,
      topping_name TEXT NOT NULL,
      unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0)
    );

    CREATE TABLE order_status_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'unit',
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      low_stock_threshold INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      type TEXT NOT NULL,
      quantity_change INTEGER NOT NULL,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      user_id INTEGER,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE INDEX idx_products_category ON products(category_id, status);
    CREATE INDEX idx_product_sizes_product ON product_sizes(product_id, status);
    CREATE INDEX idx_product_toppings_topping ON product_toppings(topping_id);
    CREATE INDEX idx_orders_branch_created ON orders(branch_id, created_at DESC);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_orders_number ON orders(order_number);
    CREATE INDEX idx_orders_user ON orders(user_id);
    CREATE INDEX idx_order_items_order ON order_items(order_id);
    CREATE INDEX idx_order_item_toppings_item ON order_item_toppings(order_item_id);
    CREATE INDEX idx_inventory_transactions_item ON inventory_transactions(inventory_item_id, created_at DESC);
    CREATE INDEX idx_inventory_status ON inventory_items(status);
    CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX idx_status_histories_order ON order_status_histories(order_id);
  `);
};
