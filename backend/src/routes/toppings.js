import { Router } from 'express';
import {
  listToppings,
  createTopping,
  updateTopping,
  toggleTopping,
} from '../services/productService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendError, ok, badRequest } from '../lib/http.js';

export function createRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/', (req, res) => {
    try {
      return ok(res, listToppings());
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post('/', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const { name, price, inventoryItemId } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'name is required.'));
      }
      if (!Number.isInteger(price) || price < 0) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'price must be a non-negative integer.'));
      }
      const topping = createTopping({ name, price, inventoryItemId, user: req.user });
      return ok(res, topping, 201);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const patch = req.body ?? {};
      if (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim())) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'name must be a non-empty string.'));
      }
      if (patch.price !== undefined && (!Number.isInteger(patch.price) || patch.price < 0)) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'price must be a non-negative integer.'));
      }
      const topping = updateTopping({ toppingId: id, patch, user: req.user });
      return ok(res, topping);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/toggle', requireRole('OWNER', 'MANAGER'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const topping = toggleTopping(id, req.user);
      return ok(res, topping);
    } catch (err) {
      next(err);
    }
  });

  return router;
}