import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

let here;
if (typeof __filename === 'string' && typeof __dirname === 'string') {
  here = __dirname;
} else {
  here = path.dirname(fileURLToPath(import.meta.url));
}
const backendRoot = path.resolve(here, '..');
const defaultDbPath = path.join(backendRoot, 'data', 'pos.db');
const defaultUploadsDir = path.join(backendRoot, 'data', 'uploads');
const defaultBackupDir = path.join(backendRoot, 'data', 'backups');

export const config = {
  port: Number(env('APP_PORT', '4000')),
  dbPath: env('DB_PATH', defaultDbPath),
  uploadsDir: env('UPLOADS_DIR', defaultUploadsDir),
  backupDir: env('BACKUPS_DIR', defaultBackupDir),
  usbBackupDir: env('USB_BACKUP_DIR', ''),
  migrationsDir: env('MIGRATIONS_DIR', path.join(backendRoot, 'db', 'migrations')),
  frontendDist: env(
    'FRONTEND_DIST',
    path.join(backendRoot, '..', 'frontend', 'dist'),
  ),
  jwtSecret: env('JWT_SECRET', 'dev-secret-change-me'),
  jwtTtl: Number(env('JWT_TTL', '86400')),
  trustProxy: env('TRUST_PROXY', 'false') === 'true',
  cookieSecure: env('COOKIE_SECURE', 'false') === 'true',
  logLevel: env('LOG_LEVEL', 'info'),
  isProduction: env('NODE_ENV', 'development') === 'production',
  testing: env('NODE_ENV', 'development') === 'test',
};

if (config.jwtSecret === 'dev-secret-change-me' && config.isProduction) {
  throw new Error('JWT_SECRET must be set in production');
}