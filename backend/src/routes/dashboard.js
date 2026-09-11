import { Router } from 'express';
import { dashboardSummary } from '../services/orderService.js';
import { authenticate } from '../middleware/auth.js';
import { sendError, ok } from '../lib/http.js';

export function createRouter() {
  const router = Router();
  router.use(authenticate);

  router.get('/summary', (req, res) => {
    try {
      return ok(res, dashboardSummary(req.user));
    } catch (err) {
      return sendError(res, err);
    }
  });

  return router;
}