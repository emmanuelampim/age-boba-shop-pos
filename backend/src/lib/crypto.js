import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };
const TOKEN_ALG = 'HS256';
const B64 = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const B64D = (s) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length, SCRYPT_OPTS);
  return crypto.timingSafeEqual(expected, actual);
}

export function signToken(payload, secret, ttlSeconds) {
  const header = { alg: TOKEN_ALG, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const enc = B64(Buffer.from(JSON.stringify(header))) + '.' + B64(Buffer.from(JSON.stringify(body)));
  const sig = crypto.createHmac('sha256', secret).update(enc).digest();
  return `${enc}.${B64(sig)}`;
}

export function verifyToken(token, secret) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const enc = `${parts[0]}.${parts[1]}`;
  try {
    const expected = crypto.createHmac('sha256', secret).update(enc).digest();
    const given = B64D(parts[2]);
    if (!crypto.timingSafeEqual(expected, given)) return null;
    const body = JSON.parse(B64D(parts[1]).toString('utf8'));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}