import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getDb, formatRow } from '../db/connection.js';
import { logger } from '../lib/logger.js';

const MAX_KEEP_DAYS = 30;

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function dayStamp(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ordersToCsvRows({ from, to } = {}) {
  const db = getDb();
  const where = ['1=1'];
  const params = [];
  if (from) {
    where.push('o.created_at >= ?');
    params.push(from);
  }
  if (to) {
    const toEnd = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to} 23:59:59` : to;
    where.push('o.created_at <= ?');
    params.push(toEnd);
  }
  const orders = db
    .prepare(
      `SELECT o.id, o.order_number, o.created_at, o.subtotal, o.discount, o.total, o.status, o.payment_method,
              o.customer_phone, o.payment_ref, o.momo_status,
              u.name AS user_name
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY o.created_at ASC, o.id ASC`,
    )
    .all(...params);

  const rows = [];
  for (const o of orders) {
    const items = db
      .prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id')
      .all(o.id)
      .map((it) => {
        const toppings = db
          .prepare(
            'SELECT topping_name, unit_price, quantity FROM order_item_toppings WHERE order_item_id = ? ORDER BY id',
          )
          .all(it.id)
          .map((t) => (t.quantity && t.quantity > 1 ? `${t.topping_name} x${t.quantity}` : t.topping_name));
        return { ...formatRow(it), toppings };
      });

    const created = new Date(`${o.created_at.replace(' ', 'T')}Z`);
    const date = isNaN(created.getTime()) ? o.created_at?.slice(0, 10) ?? '' : dayStamp(created);
    const time = isNaN(created.getTime()) ? '' : created.toISOString().slice(11, 19);

    for (const it of items) {
      rows.push({
        Date: date,
        Time: time,
        'Order #': o.order_number ? formatOrderNumber(o.order_number) : '',
        Product: it.product_name,
        Size: it.size_name ?? '',
        Toppings: it.toppings.join('; '),
        Qty: it.quantity,
        'Unit price (GH₵)': (it.unit_price / 100).toFixed(2),
        'Line total (GH₵)': (it.total_price / 100).toFixed(2),
        'Order subtotal (GH₵)': (o.subtotal / 100).toFixed(2),
        'Discount (GH₵)': (o.discount / 100).toFixed(2),
        'Order total (GH₵)': (o.total / 100).toFixed(2),
        Payment: o.payment_method ?? '',
        Staff: o.user_name ?? '',
        Status: o.status ?? '',
        'Customer phone': o.customer_phone ?? '',
        'Payment ref': o.payment_ref ?? '',
        'Momo status': o.momo_status ?? '',
      });
    }
  }
  return rows;
}

function formatOrderNumber(n) {
  return `#${String(n).padStart(6, '0')}`;
}

export function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  return lines.join('\r\n');
}

export function csvHeader() {
  return 'Date,Time,Order #,Product,Size,Toppings,Qty,Unit price (GH₵),Line total (GH₵),Order subtotal (GH₵),Discount (GH₵),Order total (GH₵),Payment,Staff,Status,Customer phone,Payment ref,Momo status\r\n';
}

export function buildDailyCsv(dateStr = dayStamp()) {
  const rows = ordersToCsvRows({ from: `${dateStr} 00:00:00`, to: `${dateStr} 23:59:59` });
  return toCsv(rows);
}

function findUsbBackupDir() {
  if (config.usbBackupDir) {
    try {
      fs.mkdirSync(config.usbBackupDir, { recursive: true });
      return config.usbBackupDir;
    } catch {
      logger.warn('usb_backup_config_unreachable', { dir: config.usbBackupDir });
      return null;
    }
  }
  if (process.platform !== 'win32') return null;
  const letters = 'DEFGHIJKLMNOPQRSTUVWXYZ';
  for (const letter of letters) {
    const root = `${letter}:\\`;
    try {
      fs.accessSync(root, fs.constants.W_OK);
      const dir = path.join(root, 'BobaPOS Backups');
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      // drive not present or not writable — try next
    }
  }
  return null;
}

function pruneOldBackups(dir, prefix) {
  try {
    const cutoff = Date.now() - MAX_KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(prefix)) continue;
      const file = path.join(dir, name);
      const st = fs.statSync(file);
      if (st.isFile() && st.mtimeMs < cutoff) {
        fs.unlinkSync(file);
      }
    }
  } catch {
    // best effort
  }
}

export function createDailyBackup({ dateStr = dayStamp(), csvContent = null, writeCsv = true } = {}) {
  const results = { saved: true, date: dateStr, local: [], usb: null, csv: csvContent !== null };
  const backupDir = config.backupDir;
  fs.mkdirSync(backupDir, { recursive: true });

  // Spreadsheet (CSV) of today's sales — readable in Excel on any computer.
  if (writeCsv) {
    try {
      const csv = csvContent !== null ? csvContent : buildDailyCsv(dateStr);
      const csvPath = path.join(backupDir, `sales-${dateStr}.csv`);
      fs.writeFileSync(csvPath, `\ufeff${csv}`, 'utf8');
      results.local.push(path.basename(csvPath));
      results.csv = true;
    } catch (err) {
      logger.error('backup_csv_failed', { message: err.message });
      results.csv = false;
    }
  }

  // A copy of the whole database for this day (restore = copy this back).
  const dbFile = config.dbPath;
  if (config.dbPath && fs.existsSync(dbFile)) {
    const dbFileName = `pos-${dateStr}.db`;
    try {
      fs.copyFileSync(dbFile, path.join(backupDir, dbFileName));
      results.local.push(dbFileName);
    } catch (err) {
      logger.error('backup_db_failed', { message: err.message });
    }
  }

  // Copy to a USB pendrive if one is present.
  const usb = findUsbBackupDir();
  if (usb) {
    const copied = [];
    try {
      for (const name of results.local) {
        const src = path.join(backupDir, name);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(usb, name));
          copied.push(name);
        }
      }
      results.usb = { dir: usb, files: copied };
      logger.info('backup_usb_copied', { dir: usb, files: copied });
    } catch (err) {
      logger.warn('backup_usb_failed', { dir: usb, message: err.message });
    }
  }

  pruneOldBackups(backupDir, 'pos-');
  pruneOldBackups(backupDir, 'sales-');
  if (usb) {
    pruneOldBackups(usb, 'pos-');
    pruneOldBackups(usb, 'sales-');
  }

  logger.info('backup_created', { date: dateStr, local: results.local, usb: results.usb?.dir ?? null });
  return results;
}

export { dayStamp };