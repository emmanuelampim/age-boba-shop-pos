import fs from 'node:fs';
import path from 'node:path';
import { getDb, transaction, formatRows } from '../db/connection.js';
import { AppError } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { config } from '../config.js';

const SETTING_SCHEMA = {
  shop_name: 'string',
  shop_address: 'string',
  shop_phone: 'string',
  shop_email: 'string',
  receipt_logo_url: 'string',
  receipt_footer: 'string',
  receipt_show_logo: 'boolean',
  receipt_show_address: 'boolean',
  receipt_show_phone: 'boolean',
  currency_code: 'string',
  currency_symbol: 'string',
  timezone: 'string',
  hours: 'string',
};

const DAYS_OF_WEEK = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const DEFAULT_HOURS = DAYS_OF_WEEK.reduce(
  (acc, day) => ({ ...acc, [day]: { open: '15:00', close: '21:00', closed: false } }),
  {},
);

export function parseHours(value) {
  if (typeof value !== 'string' || value.trim() === '') return { ...DEFAULT_HOURS };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_HOURS };
    const out = { ...DEFAULT_HOURS };
    for (const day of DAYS_OF_WEEK) {
      const entry = parsed[day];
      if (entry && typeof entry === 'object') {
        out[day] = {
          open: typeof entry.open === 'string' ? entry.open : '15:00',
          close: typeof entry.close === 'string' ? entry.close : '21:00',
          closed: Boolean(entry.closed),
        };
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_HOURS };
  }
}

export function serializeHours(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return JSON.stringify(DEFAULT_HOURS);
  return JSON.stringify(parseHours(JSON.stringify(value)));
}

function normalizeSetting(key, value) {
  if (key === 'hours') return serializeHours(value);
  if (SETTING_SCHEMA[key] === 'boolean') return value ? '1' : '0';
  return String(value).trim();
}

export function getSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) {
    const type = SETTING_SCHEMA[r.key];
    if (r.key === 'hours') out[r.key] = parseHours(r.value);
    else if (type === 'boolean') out[r.key] = r.value === '1';
    else out[r.key] = r.value;
  }
  return out;
}

export function updateSettings(patch, user) {
  return transaction(() => {
    const db = getDb();
    const errors = [];
    const patches = [];
    for (const [key, value] of Object.entries(patch || {})) {
      if (!(key in SETTING_SCHEMA)) {
        errors.push(`Unknown setting: ${key}`);
        continue;
      }
      const type = SETTING_SCHEMA[key];
      if (key === 'hours') {
        const serialized = serializeHours(value);
        db.prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
        ).run(key, serialized);
        patches.push(key);
        continue;
      }
      if (type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`${key} must be a boolean.`);
        continue;
      }
      if (type === 'string' && typeof value !== 'string') {
        errors.push(`${key} must be a string.`);
        continue;
      }
      if (key === 'shop_email' && typeof value === 'string' && value.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
        errors.push('shop_email must be a valid email or empty.');
        continue;
      }
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      ).run(key, normalizeSetting(key, value));
      patches.push(key);
    }
    if (errors.length) throw new AppError(400, 'VALIDATION_ERROR', errors.join(' '));
    audit({ user, action: 'SETTINGS_UPDATED', entityType: 'settings', details: { keys: patches } });
    return getSettings();
  });
}

export function uploadLogo({ dataUri, user }) {
  const match = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,(.+)$/i.exec(dataUri || '');
  if (!match) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Logo must be a base64 image data URI (PNG, JPEG, GIF, WebP or SVG).');
  }
  const ext = match[1].toLowerCase().replace('svg+xml', 'svg').replace('jpeg', 'jpg');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new AppError(400, 'VALIDATION_ERROR', 'Logo file is empty.');
  if (buffer.length > 1024 * 1024) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Logo must be 1 MB or smaller.');
  }

  const dir = config.uploadsDir;
  fs.mkdirSync(dir, { recursive: true });
  const filename = `logo.${ext}`;
  const filePath = path.join(dir, filename);
  // atomic-ish write: tmp then rename
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);

  const url = `/uploads/${filename}`;
  return transaction(() => {
    const db = getDb();
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run('receipt_logo_url', url);
    audit({ user, action: 'LOGO_UPLOADED', entityType: 'settings', details: { url } });
    const settings = getSettings();
    return { url, receipt_logo_url: settings.receipt_logo_url, show_logo: settings.receipt_show_logo };
  });
}

export function getPaymentMethods() {
  return formatRows(getDb().prepare('SELECT * FROM payment_methods ORDER BY id').all());
}

export function createPaymentMethod({ name, code, isActive, user }) {
  return transaction(() => {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM payment_methods WHERE code = ? COLLATE NOCASE').get(code.trim());
    if (existing) throw new AppError(409, 'PAYMENT_METHOD_EXISTS', 'Payment method code already exists.');
    const res = db
      .prepare('INSERT INTO payment_methods (name, code, is_active) VALUES (?, ?, ?)')
      .run(name.trim(), code.trim(), isActive ? 1 : 0);
    audit({ user, action: 'PAYMENT_METHOD_CREATED', entityType: 'payment_method', entityId: res.lastInsertRowid, details: { name: name.trim() } });
    return db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(res.lastInsertRowid);
  });
}

export function updatePaymentMethod({ id, patch, user }) {
  return transaction(() => {
    const db = getDb();
    const pm = db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id);
    if (!pm) throw new AppError(404, 'PAYMENT_METHOD_NOT_FOUND', 'Payment method not found.');
    const name = patch.name !== undefined ? patch.name.trim() : pm.name;
    const isActive = patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : pm.is_active;
    db.prepare('UPDATE payment_methods SET name = ?, is_active = ? WHERE id = ?').run(name, isActive, id);
    audit({ user, action: 'PAYMENT_METHOD_UPDATED', entityType: 'payment_method', entityId: id, details: { fields: Object.keys(patch) } });
    return db.prepare('SELECT * FROM payment_methods WHERE id = ?').get(id);
  });
}