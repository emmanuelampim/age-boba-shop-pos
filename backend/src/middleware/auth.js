import { getDb } from '../db/connection.js';
import { verifyToken, signToken } from '../lib/crypto.js';
import { config } from '../config.js';
import { sendError, unauthorized, forbidden } from '../lib/http.js';

const COOKIE = 'boba_session';

export { COOKIE };

export function issueToken(user) {
  return signToken({ sub: String(user.id), role: user.role }, config.jwtSecret, config.jwtTtl);
}

export function setSessionCookie(res, user) {
  const token = issueToken(user);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.jwtTtl * 1000,
    path: '/',
  });
  return token;
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', path: '/' });
}

export function authenticate(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return sendError(_res, unauthorized());
  const payload = verifyToken(token, config.jwtSecret);
  if (!payload) return sendError(_res, unauthorized());

  const user = getDb()
    .prepare('SELECT * FROM users WHERE id = ? AND status = ?')
    .get(payload.sub, 'ACTIVE');
  if (!user) return sendError(_res, unauthorized('INVALID_SESSION', 'Session is no longer valid.'));
  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return sendError(res, unauthorized());
    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        forbidden('FORBIDDEN', 'You do not have permission to perform this action.'),
      );
    }
    next();
  };
}