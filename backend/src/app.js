import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { getDb } from './db/connection.js';
import { sendError } from './lib/http.js';
import { runMigrations } from './db/migrate.js';
import { createLimiter } from './lib/rateLimit.js';
import * as authRoutes from './routes/auth.js';
import * as productRoutes from './routes/products.js';
import * as toppingRoutes from './routes/toppings.js';
import * as orderRoutes from './routes/orders.js';
import * as inventoryRoutes from './routes/inventory.js';
import * as dashboardRoutes from './routes/dashboard.js';
import * as settingsRoutes from './routes/settings.js';
import { logger } from './lib/logger.js';

function cookieParser(req, _res, next) {
  const header = req.headers.cookie;
  req.cookies = {};
  if (header) {
    for (const part of header.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      req.cookies[key] = decodeURIComponent(value);
    }
  }
  next();
}

export async function createApp({ runMigrationsOnStart = true } = {}) {
  if (runMigrationsOnStart) await runMigrations(getDb());

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser);

  // Helpers for health checks / public routes
  const healthHandler = (_req, res) => {
    try {
      getDb().prepare('SELECT 1 AS ok').get();
      return res.json({ success: true, data: { status: 'ok', db: 'ok', time: new Date().toISOString() } });
    } catch {
      return res.status(503).json({ success: false, error: { code: 'DB_UNREACHABLE', message: 'Database unavailable.' } });
    }
  };
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  const loginLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: config.testing ? 1000 : 10,
  });
  app.use('/api/auth/login', loginLimiter);

  const orderLimiter = createLimiter({
    windowMs: 15 * 60 * 1000,
    limit: config.testing ? 100000 : 600,
  });
  app.use('/api/orders', orderLimiter);

  app.use('/api/auth', authRoutes.createRouter());
  app.use('/api/products', productRoutes.createRouter());
  app.use('/api/toppings', toppingRoutes.createRouter());
  app.use('/api/orders', orderRoutes.createRouter());
  app.use('/api/inventory', inventoryRoutes.createRouter());
  app.use('/api/dashboard', dashboardRoutes.createRouter());
  app.use('/api', settingsRoutes.createRouter());

  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
  });

  // Uploaded business assets (e.g. receipt logo)
  app.use('/uploads', express.static(config.uploadsDir));

  // Serve the built frontend (single process for POS deployments)
  const indexHtml = path.join(config.frontendDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    logger.info('frontend_served', { dist: config.frontendDist });
    app.use(express.static(config.frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.includes('.') && req.path !== '/') return next();
      res.sendFile(indexHtml);
    });
  } else {
    logger.warn('frontend_not_found', { dist: config.frontendDist, hint: 'build the frontend with `npm run build` in frontend/' });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (res.headersSent) return;
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return sendError(res, Object.assign(new Error('Invalid JSON body.'), { status: 400, code: 'INVALID_JSON' }));
    }
    logger.error('request_error', { path: req.originalUrl, method: req.method, message: err.message });
    return sendError(res, err);
  });

  return app;
}