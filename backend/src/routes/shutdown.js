import { Router } from 'express';
import { getDb, closeDb } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { ok, sendError } from '../lib/http.js';
import { logger } from '../lib/logger.js';

let shuttingDown = false;

export function createRouter() {
  const router = Router();

  router.post('/shutdown', authenticate, (req, res) => {
    try {
      if (shuttingDown) return ok(res, { saved: true, message: 'Already shutting down.' });
      shuttingDown = true;

      // Force a final flush of every buffered write to disk.
      getDb().exec('SELECT 1');
      closeDb();

      logger.info('day_closed', { user: req.user?.email ?? 'unknown' });

      ok(res, { saved: true, message: 'All data saved.' });

      // Give the browser time to receive the response before exiting.
      setTimeout(() => process.exit(0), 1500);
    } catch (err) {
      shuttingDown = false;
      sendError(res, err);
    }
  });

  return router;
}