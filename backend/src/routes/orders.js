import { Router } from 'express';
import {
  createOrder,
  getOrder,
  listOrders,
  cancelOrder,
  refundOrder,
  validateOrderPayload,
} from '../services/orderService.js';
import { getSettings } from '../services/settingsService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendError, ok, page, badRequest, notFound } from '../lib/http.js';

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit };
}

export function createRouter() {
  const router = Router();
  router.use(authenticate);

  router.post('/', (req, res, next) => {
    try {
      const input = req.body ?? {};
      const error = validateOrderPayload(input);
      if (error) return sendError(res, badRequest('VALIDATION_ERROR', error));
      const result = createOrder({
        requestId: input.requestId ?? null,
        branchId: input.branchId,
        paymentMethodId: input.paymentMethodId,
        discount: input.discount ?? 0,
        notes: input.notes ?? null,
        customerPhone: input.customerPhone ?? null,
        paymentRef: input.paymentRef ?? null,
        items: input.items,
        user: req.user,
      });
      const status = result.created ? 201 : 200;
      return ok(res, { ...result.order, duplicate: result.duplicate }, status);
    } catch (err) {
      next(err);
    }
  });

  router.get('/', (req, res) => {
    try {
      const { page: pageNum, limit: pageSize } = parsePagination(req.query);
      const { rows, total } = listOrders({
        page: pageNum,
        limit: pageSize,
        from: req.query.from,
        to: req.query.to,
        paymentMethodId: req.query.paymentMethodId ? Number(req.query.paymentMethodId) : undefined,
        status: req.query.status,
        search: req.query.search,
      });
      return page(res, rows, { page: pageNum, limit: pageSize, total });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const order = getOrder(Number(req.params.id));
      if (!order) return sendError(res, notFound('ORDER_NOT_FOUND', 'Order not found.'));
      const settings = getSettings();
      return ok(res, { order, settings });
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post('/:id/cancel', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const order = cancelOrder({
        orderId: Number(req.params.id),
        user: req.user,
        reason: (req.body?.reason ?? '').toString().slice(0, 500) || null,
      });
      return ok(res, order);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/refund', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const order = refundOrder({
        orderId: Number(req.params.id),
        user: req.user,
        reason: (req.body?.reason ?? '').toString().slice(0, 500) || null,
      });
      return ok(res, order);
    } catch (err) {
      next(err);
    }
  });

  return router;
}