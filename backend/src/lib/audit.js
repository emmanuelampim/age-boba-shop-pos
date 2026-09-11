import { getDb } from '../db/connection.js';

export function audit({ user, action, entityType, entityId, details }) {
  getDb()
    .prepare(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      user?.id ?? null,
      action,
      entityType ?? null,
      entityId != null ? String(entityId) : null,
      details ? JSON.stringify(details) : null,
    );
}

export function auditInTxn(tx, { user, action, entityType, entityId, details }) {
  tx.prepare(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    user?.id ?? null,
    action,
    entityType ?? null,
    entityId != null ? String(entityId) : null,
    details ? JSON.stringify(details) : null,
  );
}