import { Router } from 'express';
import { getDb } from '../db/connection.js';
import {
  getSettings,
  updateSettings,
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  uploadLogo,
} from '../services/settingsService.js';
import { listUsers, createUser, updateUser, ROLES } from '../services/userService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sendError, ok, badRequest } from '../lib/http.js';

export function createRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/settings', (req, res) => {
    try {
      return ok(res, getSettings());
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.patch('/settings', requireRole('OWNER'), (req, res, next) => {
    try {
      return ok(res, updateSettings(req.body ?? {}, req.user));
    } catch (err) {
      next(err);
    }
  });

  router.post('/settings/logo', requireRole('OWNER'), (req, res, next) => {
    try {
      const { dataUri } = req.body ?? {};
      if (typeof dataUri !== 'string' || !dataUri) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'dataUri is required.'));
      }
      const result = uploadLogo({ dataUri, user: req.user });
      return ok(res, result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/settings/payment-methods', (req, res) => {
    try {
      return ok(res, getPaymentMethods());
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post('/settings/payment-methods', requireRole('OWNER'), (req, res, next) => {
    try {
      const { name, code } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'name is required.'));
      }
      if (typeof code !== 'string' || !code.trim()) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'code is required.'));
      }
      const pm = createPaymentMethod({
        name,
        code,
        isActive: req.body.isActive,
        user: req.user,
      });
      return ok(res, pm, 201);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/settings/payment-methods/:id', requireRole('OWNER'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const pm = updatePaymentMethod({ id, patch: req.body ?? {}, user: req.user });
      return ok(res, pm);
    } catch (err) {
      next(err);
    }
  });

  router.get('/users', requireRole('OWNER'), (req, res) => {
    try {
      return ok(res, listUsers());
    } catch (err) {
      return sendError(res, err);
    }
  });

  router.post('/users', requireRole('OWNER'), (req, res, next) => {
    try {
      const { name, email, password, role } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'name is required.'));
      }
      if (typeof email !== 'string' || !email.trim()) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'email is required.'));
      }
      if (!ROLES.includes(role)) {
        return sendError(res, badRequest('VALIDATION_ERROR', `role must be one of: ${ROLES.join(', ')}.`));
      }
      const user = createUser({ name, email, password, role, user: req.user });
      return ok(res, user, 201);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:id', requireRole('OWNER'), (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const patch = req.body ?? {};
      if (patch.role !== undefined && !ROLES.includes(patch.role)) {
        return sendError(res, badRequest('VALIDATION_ERROR', `role must be one of: ${ROLES.join(', ')}.`));
      }
      if (patch.status !== undefined && !['ACTIVE', 'INACTIVE'].includes(patch.status)) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'status must be ACTIVE or INACTIVE.'));
      }
      if (patch.email !== undefined && (typeof patch.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.email.trim()))) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'email must be a valid email address.'));
      }
      const user = updateUser({ userId: id, patch, user: req.user });
      return ok(res, user);
    } catch (err) {
      next(err);
    }
  });

  router.get('/branches', (req, res) => {
    try {
      const rows = getDb().prepare('SELECT * FROM branches WHERE status = ? ORDER BY name').all('ACTIVE');
      return ok(res, rows);
    } catch (err) {
      return sendError(res, err);
    }
  });

  return router;
}