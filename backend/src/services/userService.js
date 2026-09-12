import { getDb, transaction, formatRow, formatRows } from '../db/connection.js';
import { AppError } from '../lib/http.js';
import { hashPassword } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';

export const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY_MANAGER'];

function sanitize(row) {
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return safe;
}

export function listUsers() {
  return formatRows(getDb().prepare('SELECT * FROM users ORDER BY role, name').all()).map(sanitize);
}

export function findUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.trim().toLowerCase());
}

export function createUser({ name, email, password, role, user }) {
  return transaction(() => {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
    if (existing) throw new AppError(409, 'EMAIL_IN_USE', 'A user with that email already exists.');
    if (typeof password !== 'string' || password.length < 8) {
      throw new AppError(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters.');
    }
    const res = db
      .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(name.trim(), email.trim(), hashPassword(password), role);
    audit({ user, action: 'USER_CREATED', entityType: 'user', entityId: res.lastInsertRowid, details: { name: name.trim(), role } });
    return sanitize(db.prepare('SELECT * FROM users WHERE id = ?').get(res.lastInsertRowid));
  });
}

export function updateUser({ userId, patch, user }) {
  return transaction(() => {
    const db = getDb();
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
    const wantsInactive = patch.status === 'INACTIVE';
    const targetIsActiveOwner = target.role === 'OWNER' && target.status === 'ACTIVE';
    if (wantsInactive && targetIsActiveOwner) {
      // Prevent the last active OWNER from being deactivated (would lock everyone out).
      const owners = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'OWNER' AND status = 'ACTIVE'").get();
      if (owners.c <= 1) {
        throw new AppError(409, 'LAST_OWNER', 'Cannot deactivate the only active owner.');
      }
    }
    if (userId === user.id && patch.role && patch.role !== user.role) {
      // Prevent the last OWNER from demoting themselves.
      const owners = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'OWNER' AND status = 'ACTIVE'").get();
      if (owners.c <= 1) {
        throw new AppError(409, 'LAST_OWNER', 'Cannot change role of the only active owner.');
      }
    }
    const name = patch.name !== undefined ? patch.name.trim() : target.name;
    const email = patch.email !== undefined ? patch.email.trim().toLowerCase() : target.email;
    const role = patch.role !== undefined ? patch.role : target.role;
    const status = patch.status !== undefined ? patch.status : target.status;

    if (patch.email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'email must be a valid email address.');
      }
      const inUse = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?').get(email, userId);
      if (inUse) throw new AppError(409, 'EMAIL_IN_USE', 'A user with that email already exists.');
    }

    db.prepare('UPDATE users SET name = ?, email = ?, role = ?, status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, email, role, status, userId);
    if (patch.password) {
      if (String(patch.password).length < 8) throw new AppError(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters.');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(patch.password), userId);
    }
    audit({ user, action: 'USER_UPDATED', entityType: 'user', entityId: userId, details: { fields: Object.keys(patch) } });
    return sanitize(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  });
}