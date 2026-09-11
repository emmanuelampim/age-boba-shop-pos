import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { verifyPassword } from '../lib/crypto.js';
import { findUserByEmail } from '../services/userService.js';
import { authenticate, setSessionCookie, clearSessionCookie } from '../middleware/auth.js';
import { sendError, ok, unauthorized, badRequest } from '../lib/http.js';
import { logger } from '../lib/logger.js';

export function createRouter() {
  const router = Router();

  router.post('/login', (req, res, next) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        return sendError(res, badRequest('VALIDATION_ERROR', 'Email and password are required.'));
      }
      const user = findUserByEmail(email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        logger.warn('login_failed', { email });
        return sendError(res, unauthorized('INVALID_CREDENTIALS', 'Invalid email or password.'));
      }
      if (user.status !== 'ACTIVE') {
        return sendError(
          res,
          Object.assign(new Error('Account disabled.'), { status: 403, code: 'ACCOUNT_DISABLED' }),
        );
      }
      setSessionCookie(res, user);
      return ok(res, publicUser(user));
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    clearSessionCookie(res);
    return ok(res, { message: 'Logged out.' });
  });

  router.get('/me', authenticate, (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    return ok(res, publicUser(user));
  });

  return router;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}