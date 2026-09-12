import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { ordersToCsvRows, toCsv, csvHeader } from '../services/backupService.js';

function isValidDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v || '');
}

function sanitizeDate(v, fallback) {
  return isValidDate(v) ? v : fallback;
}

export function createRouter() {
  const router = Router();

  // GET /api/export/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Returns a spreadsheet (CSV) of sales that opens directly in Excel.
  router.get('/export/sales', authenticate, (req, res) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    const from = sanitizeDate(String(req.query.from || ''), todayStr);
    const to = sanitizeDate(String(req.query.to || ''), todayStr);

    const rows = ordersToCsvRows({ from: `${from} 00:00:00`, to: `${to} 23:59:59` });
    const csv = `\ufeff${rows.length ? toCsv(rows) : csvHeader()}`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="boba-sales-${from}-to-${to}.csv"`,
    );
    return res.send(csv);
  });

  return router;
}