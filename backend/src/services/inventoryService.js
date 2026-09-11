import { getDb } from '../db/connection.js';
import { transaction } from '../db/connection.js';
import { AppError } from '../lib/http.js';
import { audit } from '../lib/audit.js';

export const TXN_TYPES = [
  'RESTOCK',
  'ADJUSTMENT',
  'WASTE',
  'SALE_DEDUCTION',
  'CANCELLATION_RESTORE',
  'REFUND_RESTORE',
];

export function listInventory({ status } = {}) {
  const rows = status
    ? getDb().prepare('SELECT * FROM inventory_items WHERE status = ? ORDER BY name').all(status)
    : getDb().prepare('SELECT * FROM inventory_items ORDER BY name').all();
  return rows;
}

export function getInventoryItem(itemId) {
  return getDb().prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId) ?? null;
}

function logTxn(tx, { itemId, type, quantityChange, previousQuantity, user, note, referenceType, referenceId }) {
  const newQuantity = previousQuantity + quantityChange;
  tx.prepare(
    `INSERT INTO inventory_transactions
       (inventory_item_id, type, quantity_change, previous_quantity, new_quantity,
        reference_type, reference_id, user_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    itemId,
    type,
    quantityChange,
    previousQuantity,
    newQuantity,
    referenceType ?? null,
    referenceId ?? null,
    user?.id ?? null,
    note ?? null,
  );
  return newQuantity;
}

export function deductInTxn(tx, itemId, quantity, { type, referenceType, referenceId, user, note }) {
  const item = tx.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  if (!item) throw new AppError(400, 'INVENTORY_ITEM_NOT_FOUND', 'Inventory item not found.');
  if (item.quantity < quantity) {
    throw new AppError(
      400,
      'INSUFFICIENT_STOCK',
      `Insufficient stock for "${item.name}" (${item.quantity} ${item.unit} available, ${quantity} needed).`,
    );
  }
  const newQuantity = logTxn(tx, {
    itemId,
    type,
    quantityChange: -quantity,
    previousQuantity: item.quantity,
    user,
    note,
    referenceType,
    referenceId,
  });
  tx.prepare('UPDATE inventory_items SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newQuantity, itemId);
  return { item, newQuantity };
}

export function adjust({ itemId, type, quantity, note, user }) {
  if (!TXN_TYPES.filter((t) => t !== 'SALE_DEDUCTION').includes(type)) {
    throw new AppError(400, 'INVALID_TXN_TYPE', 'Invalid inventory transaction type.');
  }
  if (!Number.isInteger(quantity) || quantity === 0) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a non-zero integer.');
  }
  if (type === 'RESTOCK' && quantity < 0) {
    throw new AppError(400, 'INVALID_QUANTITY', 'RESTOCK quantity must be positive.');
  }

  const result = transaction(() => {
    const tx = getDb();
    const item = tx.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
    if (!item) throw new AppError(404, 'INVENTORY_ITEM_NOT_FOUND', 'Inventory item not found.');
    if (item.status !== 'ACTIVE') {
      throw new AppError(400, 'ITEM_INACTIVE', 'Inventory item is not active.');
    }

    let change = quantity;
    if (type === 'WASTE') change = -Math.abs(quantity);

    const previous = item.quantity;
    const newQuantity = previous + change;
    if (newQuantity < 0) {
      throw new AppError(
        400,
        'NEGATIVE_STOCK',
        `Cannot have negative stock for "${item.name}".`,
      );
    }

    tx.prepare('UPDATE inventory_items SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newQuantity, itemId);
    logTxn(tx, {
      itemId,
      type,
      quantityChange: change,
      previousQuantity: previous,
      user,
      note,
    });

    audit({ user, action: 'INVENTORY_ADJUST', entityType: 'inventory_item', entityId: itemId, details: { type, change, previous, newQuantity, note } });
    return { item: { ...item, quantity: newQuantity }, change, previous, newQuantity };
  });
  return result;
}

export function listTransactions({ itemId, type, limit = 20, offset = 0 }) {
  let sql = 'SELECT t.*, i.name AS item_name FROM inventory_transactions t JOIN inventory_items i ON i.id = t.inventory_item_id';
  const where = [];
  const params = [];
  if (itemId) {
    where.push('t.inventory_item_id = ?');
    params.push(itemId);
  }
  if (type) {
    where.push('t.type = ?');
    params.push(type);
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = getDb().prepare(sql).all(...params);
  const total = getDb()
    .prepare(
      'SELECT COUNT(*) AS c FROM inventory_transactions t ' +
        (where.length ? 'WHERE ' + where.join(' AND ') : ''),
    )
    .get(...params.slice(0, -2)).c;
  return { rows, total };
}