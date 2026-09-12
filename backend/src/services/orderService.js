import { getDb, transaction, formatRow } from '../db/connection.js';
import { AppError } from '../lib/http.js';
import { deductInTxn } from './inventoryService.js';
import { auditInTxn } from '../lib/audit.js';
import { todayStartUtc, todayEndUtc } from '../lib/time.js';

const ORDER_STATUSES = ['COMPLETED', 'CANCELLED', 'REFUNDED'];
const MAX_LINE_QUANTITY = 999;
const PHONE_RE = /^0\d{9}$/;

export function normalizePhone(value) {
  if (value == null) return '';
  let s = String(value).replace(/[\s\-()]/g, '');
  if (s.startsWith('+')) s = s.replace(/^\+?233/, '0');
  return s;
}

function formatOrderNumber(n) {
  return `#${String(n).padStart(6, '0')}`;
}

function nextOrderNumber(tx, branchId) {
  const existing = tx.prepare('SELECT current_value FROM order_sequences WHERE branch_id = ?').get(branchId);
  let current = existing ? existing.current_value : 0;
  current += 1;
  if (existing) {
    tx.prepare('UPDATE order_sequences SET current_value = ? WHERE branch_id = ?').run(current, branchId);
  } else {
    tx.prepare('INSERT INTO order_sequences (branch_id, current_value) VALUES (?, ?)').run(branchId, current);
  }
  return current;
}

function loadProductWithOptions(productId) {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return null;
  const sizes = db
    .prepare('SELECT * FROM product_sizes WHERE product_id = ? AND status = ? ORDER BY price')
    .all(productId, 'ACTIVE');
  const toppingRows = db
    .prepare(
      `SELECT t.* FROM product_toppings pt JOIN toppings t ON t.id = pt.topping_id
       WHERE pt.product_id = ? AND t.status = ?`,
    )
    .all(productId, 'ACTIVE');
  return { ...formatRow(product), sizes: formatRow(sizes), toppings: formatRow(toppingRows) };
}

export function getOrder(orderId) {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  return enrichOrder(order);
}

export function getOrderByNumber(orderNumber) {
  const order = getDb().prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);
  return order ? enrichOrder(order) : null;
}

function enrichOrder(order) {
  const db = getDb();
  const items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id')
    .all(order.id)
    .map((item) => {
      const toppings = db
        .prepare('SELECT * FROM order_item_toppings WHERE order_item_id = ? ORDER BY id')
        .all(item.id);
      return { ...formatRow(item), toppings: formatRow(toppings) };
    });
  const history = db
    .prepare('SELECT * FROM order_status_histories WHERE order_id = ? ORDER BY id')
    .all(order.id);
  const branch = db.prepare('SELECT id, name, address, phone FROM branches WHERE id = ?').get(order.branch_id);
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(order.user_id);
  const payment = db.prepare('SELECT id, name, code FROM payment_methods WHERE id = ?').get(order.payment_method_id) ?? null;
  return {
    ...formatRow(order),
    order_number_display: formatOrderNumber(order.order_number),
    items: formatRow(items),
    history: formatRow(history),
    branch: branch ?? null,
    user,
    payment,
  };
}

export function listOrders({ page = 1, limit = 20, from, to, paymentMethodId, status, search } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (from) {
    where.push('o.created_at >= ?');
    params.push(from);
  }
  if (to) {
    const toEnd = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to} 23:59:59` : to;
    where.push('o.created_at <= ?');
    params.push(toEnd);
  }
  if (paymentMethodId) {
    where.push('o.payment_method_id = ?');
    params.push(paymentMethodId);
  }
  if (status && status !== 'ALL') {
    where.push('o.status = ?');
    params.push(status);
  }
  if (search) {
    where.push('(CAST(o.order_number AS TEXT) LIKE ? OR o.notes LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM orders o ${whereSql}`)
    .get(...params).c;

  const rows = db
    .prepare(
      `SELECT o.*, u.name AS user_name, b.name AS branch_name, pm.name AS payment_method_display,
              (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o
       JOIN users u ON u.id = o.user_id
       JOIN branches b ON b.id = o.branch_id
       LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
       ${whereSql}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, (page - 1) * limit);

  return {
    rows: rows.map((r) => ({
      ...formatRow(r),
      order_number_display: formatOrderNumber(r.order_number),
    })),
    total,
  };
}

export function validateOrderPayload(input) {
  const errs = [];
  const requestId = input.requestId;
  if (requestId !== undefined && (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 64)) {
    errs.push('requestId must be a string between 8 and 64 characters.');
  }
  if (!input.branchId) errs.push('branchId is required.');
  if (!input.paymentMethodId) errs.push('paymentMethodId is required.');
  if (!Array.isArray(input.items) || input.items.length === 0) {
    errs.push('At least one item is required.');
  } else {
    for (const [i, it] of input.items.entries()) {
      const label = `items[${i}]`;
      if (!Number.isInteger(it.productId)) errs.push(`${label}.productId must be an integer.`);
      if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_LINE_QUANTITY) {
        errs.push(`${label}.quantity must be between 1 and ${MAX_LINE_QUANTITY}.`);
      }
      if (it.toppingIds !== undefined && !Array.isArray(it.toppingIds)) {
        errs.push(`${label}.toppingIds must be an array.`);
      } else if (Array.isArray(it.toppingIds)) {
        for (const t of it.toppingIds) {
          if (!Number.isInteger(t)) errs.push(`${label}.toppingIds must contain integers.`);
        }
      }
    }
  }
  if (input.discount !== undefined && (!Number.isInteger(input.discount) || input.discount < 0)) {
    errs.push('discount must be a non-negative integer (in pesewas).');
  }
  if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 500)) {
    errs.push('notes must be a string of 500 characters or fewer.');
  }
  if (input.customerPhone !== undefined) {
    if (typeof input.customerPhone !== 'string' || input.customerPhone.length === 0) {
      errs.push('customerPhone must be a non-empty string.');
    } else if (input.customerPhone.length > 40) {
      errs.push('customerPhone must be 40 characters or fewer.');
    } else if (!PHONE_RE.test(normalizePhone(input.customerPhone))) {
      errs.push('customerPhone must be a valid phone number (e.g. 0241234567).');
    }
  }
  if (input.paymentRef !== undefined) {
    if (typeof input.paymentRef !== 'string' || input.paymentRef.trim().length === 0) {
      errs.push('paymentRef must be a non-empty string.');
    } else if (input.paymentRef.trim().length > 64) {
      errs.push('paymentRef must be 64 characters or fewer.');
    }
  }
  if (input.momoConfirmed !== undefined && typeof input.momoConfirmed !== 'boolean') {
    errs.push('momoConfirmed must be a boolean.');
  }
  return errs.join(' ') || null;
}

export function createOrder({
  requestId = null,
  branchId,
  paymentMethodId,
  discount = 0,
  notes = null,
  items,
  customerPhone = null,
  paymentRef = null,
  momoConfirmed = false,
  user,
}) {
  const result = transaction(() => {
    const db = getDb();

    if (requestId) {
      const existing = db.prepare('SELECT * FROM orders WHERE request_id = ?').get(requestId);
      if (existing) return { order: enrichOrder(existing), duplicate: true, created: false };
    }

    const branch = db.prepare('SELECT * FROM branches WHERE id = ? AND status = ?').get(branchId, 'ACTIVE');
    if (!branch) throw new AppError(400, 'BRANCH_NOT_AVAILABLE', 'Branch is not available.');

    const payment = db.prepare('SELECT * FROM payment_methods WHERE id = ? AND is_active = 1').get(paymentMethodId);
    if (!payment) throw new AppError(400, 'PAYMENT_METHOD_NOT_AVAILABLE', 'Payment method is not available.');

    const phone = customerPhone ? normalizePhone(customerPhone) : '';
    const ref = paymentRef != null ? String(paymentRef).trim() : '';

    let storedRef = null;
    let momoFlag = 0;
    let momoStatus = null;
    if (payment.code === 'MOMO') {
      // Mobile Money needs a way to trace the payment: the customer's phone
      // number or the last 4 digits of the MoMo transaction.
      if (!phone && !ref) {
        throw new AppError(
          400,
          'PAYMENT_CONTACT_REQUIRED',
          'Customer phone number or the last 4 digits of the Mobile Money transaction is required.',
        );
      }
      if (ref) {
        if (!/^\d{4}$/.test(ref)) {
          throw new AppError(
            400,
            'INVALID_PAYMENT_REF',
            'Mobile Money reference must be exactly the last 4 digits of the transaction.',
          );
        }
        storedRef = `****${ref}`;
      }
      // The cashier must manually confirm they saw the MoMo payment arrive on
      // the shop's MoMo device. There is no automatic provider verification.
      if (momoConfirmed !== true) {
        throw new AppError(
          400,
          'MOMO_CONFIRMATION_REQUIRED',
          'Confirm that the Mobile Money payment was received before finalizing the sale.',
        );
      }
      momoFlag = 1;
      momoStatus = 'MANUAL_CONFIRMATION';
    }
    if (phone && !PHONE_RE.test(phone)) {
      throw new AppError(400, 'INVALID_PHONE', 'Customer phone number is invalid (e.g. use 0241234567).');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError(400, 'EMPTY_ORDER', 'Cannot create an order with no items.');
    }

    const orderItems = [];
    let subtotal = 0;

    for (const it of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(it.productId);
      if (!product || product.status !== 'ACTIVE') {
        throw new AppError(400, 'PRODUCT_NOT_AVAILABLE', `Product #${it.productId} is not available.`);
      }
      const qty = it.quantity;
      const activeSizes = db
        .prepare("SELECT * FROM product_sizes WHERE product_id = ? AND status = 'ACTIVE' ORDER BY price")
        .all(product.id);

      let unitPrice;
      let size = null;
      if (activeSizes.length > 0) {
        if (!it.sizeId) {
          throw new AppError(400, 'SIZE_REQUIRED', `Select a size for "${product.name}".`);
        }
        size = activeSizes.find((s) => s.id === it.sizeId);
        if (!size) {
          throw new AppError(400, 'INVALID_SIZE', `Invalid size for "${product.name}".`);
        }
        unitPrice = size.price;
      } else {
        if (it.sizeId) {
          throw new AppError(400, 'SIZE_NOT_SUPPORTED', `"${product.name}" does not have sizes.`);
        }
        if (product.price == null) {
          throw new AppError(400, 'PRODUCT_NO_PRICE', `"${product.name}" has no price.`);
        }
        unitPrice = product.price;
        size = null;
      }

      const allowedToppings = db
        .prepare(
          `SELECT t.* FROM product_toppings pt JOIN toppings t ON t.id = pt.topping_id
           WHERE pt.product_id = ? AND t.status = 'ACTIVE'`,
        )
        .all(product.id);
      const toppingIds = Array.isArray(it.toppingIds) ? it.toppingIds : [];
      if (toppingIds.length > 0 && allowedToppings.length === 0) {
        throw new AppError(400, 'TOPPINGS_NOT_SUPPORTED', `"${product.name}" does not support toppings.`);
      }
      const toppingMap = new Map(allowedToppings.map((t) => [t.id, t]));
      const selectedToppings = [];
      for (const tid of toppingIds) {
        const topping = toppingMap.get(tid);
        if (!topping) {
          throw new AppError(400, 'INVALID_TOPPING', `Topping #${tid} is not available for "${product.name}".`);
        }
        selectedToppings.push(topping);
      }

      // Ensure unique cash line: no duplicate topping ids.
      const uniqueTops = [...new Set(toppingIds)];
      if (uniqueTops.length !== toppingIds.length) {
        throw new AppError(400, 'DUPLICATE_TOPPING', 'Each topping can be selected at most once.');
      }

      const toppingUnitTotal = selectedToppings.reduce((s, t) => s + t.price, 0);
      const lineUnitPrice = unitPrice + toppingUnitTotal;
      const lineTotal = lineUnitPrice * qty;
      subtotal += lineTotal;

      // Deduct cup inventory from the size, if linked.
      if (size && size.inventory_item_id) {
        deductInTxn(db, size.inventory_item_id, qty, {
          type: 'SALE_DEDUCTION',
          referenceType: 'ORDER',
          user,
        });
      }
      // Deduct topping inventory.
      for (const topping of selectedToppings) {
        if (topping.inventory_item_id) {
          deductInTxn(db, topping.inventory_item_id, qty, {
            type: 'SALE_DEDUCTION',
            referenceType: 'ORDER',
            user,
          });
        }
      }

      orderItems.push({
        product,
        size,
        selectedToppings,
        quantity: qty,
        unitPrice,
        lineTotal,
        requested: it,
      });
    }

    if (discount < 0) throw new AppError(400, 'INVALID_DISCOUNT', 'Discount cannot be negative.');
    if (discount > subtotal) {
      throw new AppError(400, 'INVALID_DISCOUNT', 'Discount cannot exceed subtotal.');
    }
    const total = subtotal - discount;

    const orderNumber = nextOrderNumber(db, branchId);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const businessDate = new Date().toISOString().slice(0, 10);

    const orderResult = db
      .prepare(
        `INSERT INTO orders
           (order_number, request_id, branch_id, user_id, subtotal, discount, total,
            payment_method_id, payment_method, customer_phone, payment_ref,
            momo_confirmed, momo_status, business_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?)`,
      )
      .run(
        orderNumber,
        requestId || null,
        branchId,
        user.id,
        subtotal,
        discount,
        total,
        payment.id,
        payment.name,
        phone || null,
        storedRef || null,
        momoFlag,
        momoStatus,
        businessDate,
        now,
        now,
      );
    const orderId = orderResult.lastInsertRowid;

    for (const entry of orderItems) {
      const itemRes = db
        .prepare(
          `INSERT INTO order_items
             (order_id, product_id, product_size_id, product_name, size_name, unit_price, quantity, total_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          orderId,
          entry.product.id,
          entry.size ? entry.size.id : null,
          entry.product.name,
          entry.size ? entry.size.name : null,
          entry.unitPrice,
          entry.quantity,
          entry.lineTotal,
        );
      const itemId = itemRes.lastInsertRowid;
      for (const topping of entry.selectedToppings) {
        db.prepare(
          `INSERT INTO order_item_toppings
             (order_item_id, topping_id, topping_name, unit_price, quantity)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(itemId, topping.id, topping.name, topping.price, entry.quantity);
      }
    }

    auditInTxn(db, {
      user,
      action: 'ORDER_CREATED',
      entityType: 'order',
      entityId: orderId,
      details: { number: orderNumber, subtotal, discount, total, items: orderItems.length, momoStatus },
    });

    if (momoStatus) {
      auditInTxn(db, {
        user,
        action: 'MOMO_PAYMENT_CONFIRMED',
        entityType: 'order',
        entityId: orderId,
        details: {
          number: orderNumber,
          amount: total,
          reference: storedRef,
          confirmedBy: user.name ?? null,
        },
      });
    }

    return { order: enrichOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)), created: true, duplicate: false };
  });

  return result;
}

function restoreStockForOrder(db, orderId, user, type, reason) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (order.status !== 'COMPLETED') {
    throw new AppError(400, 'INVALID_ORDER_STATUS', `Cannot ${type === 'REFUND_RESTORE' ? 'refund' : 'cancel'} an order with status "${order.status}".`);
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  for (const item of items) {
    if (item.product_size_id) {
      const size = db.prepare('SELECT * FROM product_sizes WHERE id = ?').get(item.product_size_id);
      if (size && size.inventory_item_id) {
        restockInTxn(db, size.inventory_item_id, item.quantity, { type, referenceId: orderId, user });
      }
    }
    const toppings = db.prepare('SELECT * FROM order_item_toppings WHERE order_item_id = ?').all(item.id);
    for (const topping of toppings) {
      if (!topping.topping_id) continue;
      const t = db.prepare('SELECT * FROM toppings WHERE id = ?').get(topping.topping_id);
      if (t && t.inventory_item_id && t.status === 'ACTIVE') {
        restockInTxn(db, t.inventory_item_id, topping.quantity, { type, referenceId: orderId, user });
      }
    }
  }
  return order;
}

function restockInTxn(db, itemId, quantity, { type, referenceId, user }) {
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  if (!item) return;
  const newQty = item.quantity + quantity;
  db.prepare("UPDATE inventory_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, itemId);
  db.prepare(
    `INSERT INTO inventory_transactions
       (inventory_item_id, type, quantity_change, previous_quantity, new_quantity, reference_type, reference_id, user_id)
     VALUES (?, ?, ?, ?, ?, 'ORDER', ?, ?)`,
  ).run(itemId, type, quantity, item.quantity, newQty, referenceId, user?.id ?? null);
}

export function cancelOrder({ orderId, user, reason = null }) {
  return transaction(() => {
    const db = getDb();
    const order = restoreStockForOrder(db, orderId, user, 'CANCELLATION_RESTORE', reason);
    db.prepare("UPDATE orders SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?").run(orderId);
    db.prepare(
      `INSERT INTO order_status_histories (order_id, from_status, to_status, user_id, reason)
       VALUES (?, 'COMPLETED', 'CANCELLED', ?, ?)`,
    ).run(orderId, user.id, reason ?? null);
    auditInTxn(db, {
      user,
      action: 'ORDER_CANCELLED',
      entityType: 'order',
      entityId: orderId,
      details: { reason },
    });
    return enrichOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId));
  });
}

export function refundOrder({ orderId, user, reason = null }) {
  return transaction(() => {
    const db = getDb();
    const order = restoreStockForOrder(db, orderId, user, 'REFUND_RESTORE', reason);
    db.prepare("UPDATE orders SET status = 'REFUNDED', updated_at = datetime('now') WHERE id = ?").run(orderId);
    db.prepare(
      `INSERT INTO order_status_histories (order_id, from_status, to_status, user_id, reason)
       VALUES (?, 'COMPLETED', 'REFUNDED', ?, ?)`,
    ).run(orderId, user.id, reason ?? null);
    auditInTxn(db, {
      user,
      action: 'ORDER_REFUNDED',
      entityType: 'order',
      entityId: orderId,
      details: { amount: order.total, reason },
    });
    return enrichOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId));
  });
}

export function dashboardSummary(user) {
  const db = getDb();
  const today = requireTodayRange();
  const todayOrders = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS sales, COUNT(*) AS count
       FROM orders WHERE status = 'COMPLETED' AND created_at >= ? AND created_at < ?`,
    )
    .get(today.start, today.end);

  const avg = todayOrders.count > 0 ? Math.round(todayOrders.sales / todayOrders.count) : 0;

  const paymentBreakdown = db
    .prepare(
      `SELECT payment_method, COALESCE(SUM(total), 0) AS sales, COUNT(*) AS count
       FROM orders WHERE status = 'COMPLETED' AND created_at >= ? AND created_at < ?
       GROUP BY payment_method ORDER BY sales DESC`,
    )
    .all(today.start, today.end);

  const bestSellers = db
    .prepare(
      `SELECT oi.product_id AS id, oi.product_name AS name, SUM(oi.quantity) AS quantity, SUM(oi.total_price) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'COMPLETED' AND o.created_at >= ?
       GROUP BY oi.product_id, oi.product_name
       ORDER BY quantity DESC LIMIT 5`,
    )
    .all(today.start);

  const lowStock = db
    .prepare(
      `SELECT * FROM inventory_items WHERE status = 'ACTIVE' AND quantity <= low_stock_threshold ORDER BY quantity`,
    )
    .all();

  const recent = db
    .prepare(
      `SELECT o.*, u.name AS user_name FROM orders o
       JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC, o.id DESC LIMIT 8`,
    )
    .all();

  return {
    today: {
      ...formatRow(todayOrders),
      order_count: todayOrders.count,
      average_order_value: avg,
      payment_breakdown: formatRow(paymentBreakdown),
    },
    best_sellers: formatRow(bestSellers),
    low_stock: formatRow(lowStock),
    recent_orders: formatRow(recent),
  };
}

function requireTodayRange() {
  const toSql = (iso) => iso.slice(0, 19).replace('T', ' ');
  return { start: toSql(todayStartUtc()), end: toSql(todayEndUtc()) };
}

export function formatOrderNumberFn(displayOrderNumber) {
  return formatOrderNumber(displayOrderNumber);
}