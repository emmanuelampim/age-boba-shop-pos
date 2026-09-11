import { Router } from 'express';
import { getDb } from '../db/connection.js';
import {
  listInventory,
  adjust,
  listTransactions,
  getInventoryItem,
} from '../services/inventoryService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendError, ok, page, badRequest, notFound } from '../lib/http.js';
import { audit } from '../lib/audit.js';

export function createRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/', (req, res) => {
    try {
      return ok(res, listInventory({ status: req.query.all === '1' ? undefined : 'ACTIVE' }));
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post(
    '/adjust',
    requireRole('OWNER', 'MANAGER', 'INVENTORY_MANAGER'),
    (req, res, next) => {
      try {
        const { itemId, type, quantity, note } = req.body ?? {};
        if (!Number.isInteger(itemId)) {
          return sendError(res, badRequest('VALIDATION_ERROR', 'itemId is required.'));
        }
        if (!['RESTOCK', 'ADJUSTMENT', 'WASTE'].includes(type)) {
          return sendError(res, badRequest('VALIDATION_ERROR', 'type must be RESTOCK, ADJUSTMENT, or WASTE.'));
        }
        if (!Number.isInteger(quantity) || quantity === 0) {
          return sendError(res, badRequest('VALIDATION_ERROR', 'quantity must be a non-zero integer.'));
        }
        const result = adjust({ itemId, type, quantity, note, user: req.user });
        return ok(res, result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/transactions', (req, res) => {
    try {
      const pageNum = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
      const { rows, total } = listTransactions({
        itemId: req.query.itemId ? Number(req.query.itemId) : undefined,
        type: req.query.type,
        limit,
        offset: (pageNum - 1) * limit,
      });
      return page(res, rows, { page: pageNum, limit, total });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post('/', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const { name, unit, lowStockThreshold } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'name is required.'));
      }
      const db = getDb();
      const created = db
        .prepare(
          'INSERT INTO inventory_items (name, unit, quantity, low_stock_threshold) VALUES (?, ?, 0, ?)',
        )
        .run(name.trim(), (unit ?? 'unit').trim(), lowStockThreshold ?? 0);
      audit({
        user: req.user,
        action: 'INVENTORY_ITEM_CREATED',
        entityType: 'inventory_item',
        entityId: created.lastInsertRowid,
        details: { name: name.trim() },
      });
      return ok(res, getInventoryItem(created.lastInsertRowid), 201);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const item = getInventoryItem(id);
      if (!item) return sendError(res, notFound('INVENTORY_ITEM_NOT_FOUND', 'Inventory item not found.'));
      const patch = req.body ?? {};
      if (patch.lowStockThreshold !== undefined && (!Number.isInteger(patch.lowStockThreshold) || patch.lowStockThreshold < 0)) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'lowStockThreshold must be a non-negative integer.'));
      }
      const name = patch.name !== undefined ? patch.name.trim() : item.name;
      const unit = patch.unit !== undefined ? patch.unit : item.unit;
      const threshold = patch.lowStockThreshold !== undefined ? patch.lowStockThreshold : item.low_stock_threshold;
      const status = patch.status !== undefined ? patch.status : item.status;
      getDb()
        .prepare("UPDATE inventory_items SET name = ?, unit = ?, low_stock_threshold = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(name, unit, threshold, status, id);
      audit({
        user: req.user,
        action: 'INVENTORY_ITEM_UPDATED',
        entityType: 'inventory_item',
        entityId: id,
        details: { fields: Object.keys(patch) },
      });
      return ok(res, getInventoryItem(id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}