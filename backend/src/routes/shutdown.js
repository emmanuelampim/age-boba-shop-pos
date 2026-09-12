import { Router } from 'express';
import { getDb, closeDb } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';
import { ok, sendError } from '../lib/http.js';
import { createDailyBackup, buildDailyCsv, dayStamp } from '../services/backupService.js';
import { config } from '../config.js';
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

      // Build the spreadsheet copy of today's sales while the DB is open.
      const csv = buildDailyCsv();
      const dateStr = dayStamp();
      const download = { filename: `boba-sales-${dateStr}.csv`, csv };

      // On web hosting the server must stay up: the database is persisted
      // continuously, so a fresh Excel copy + a full DB snapshot is enough.
      // On the offline shop PC we close the DB and exit as before.
      if (config.isProduction) {
        const backup = createDailyBackup({ csvContent: csv });
        shuttingDown = false;
        logger.info('day_closed', { user: req.user?.email ?? 'unknown', stayedUp: true });
        return ok(res, {
          saved: true,
          message: 'All data saved. The server stays running.',
          download,
          backup: {
            files: backup.local,
            usb: backup.usb,
            csvWritten: backup.csv,
          },
        });
      }

      closeDb();

      // Copy the saved database + spreadsheet into local backups and any USB.
      const backup = createDailyBackup({ csvContent: csv });

      logger.info('day_closed', { user: req.user?.email ?? 'unknown' });

      ok(res, {
        saved: true,
        message: 'All data saved.',
        download,
        backup: {
          files: backup.local,
          usb: backup.usb,
          csvWritten: backup.csv,
        },
      });

      // Give the browser time to receive the response before exiting.
      setTimeout(() => process.exit(0), 1500);
    } catch (err) {
      shuttingDown = false;
      sendError(res, err);
    }
  });

  return router;
}