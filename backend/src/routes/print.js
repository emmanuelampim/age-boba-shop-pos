import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { AppError, sendError, ok, badRequest } from '../lib/http.js';
import { printText } from '../lib/printer.js';
import { logger } from '../lib/logger.js';

export function createRouter() {
  const router = Router();

  // Receives ready-to-print receipt text and sends it to the Windows
  // default printer. Only works when this server runs on the POS machine;
  // the frontend falls back to the browser print dialog when it cannot.
  router.post('/print', authenticate, (req, res, next) => {
    try {
      const { text } = req.body ?? {};
      if (typeof text !== 'string' || text.trim().length < 10) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'Receipt text is required.'));
      }
      if (text.length > 8192) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'Receipt text is too long.'));
      }
      printText(text);
      logger.info('receipt_printed', { chars: text.length, by: req.user.email });
      return ok(res, { spooled: true });
    } catch (err) {
      if (err.code === 'PRINT_LOCAL_ONLY') {
        return sendError(
          res,
          new AppError(503, 'PRINT_LOCAL_ONLY', 'Direct printing is only available on the on-site POS machine.'),
        );
      }
      if (err.code === 'PRINT_FAILED') {
        logger.error('printer_failed', { message: err.message });
        return sendError(
          res,
          new AppError(
            502,
            'PRINT_FAILED',
            'Could not send to the printer. Check the printer is switched on and is the Windows default printer.',
          ),
        );
      }
      return next(err);
    }
  });

  return router;
}