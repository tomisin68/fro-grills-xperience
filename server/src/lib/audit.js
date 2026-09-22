import { db, now } from '../db/index.js';

/**
 * Appends an entry to the permanent activity log. `actor` is an Express
 * request (uses req.user and req.ip) or null for system actions.
 */
export function audit(actor, action, entity, entityId, details) {
  const user = actor?.user ?? null;
  db.run(
    `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details, ip, created_at)
     VALUES (:userId, :userName, :action, :entity, :entityId, :details, :ip, :createdAt)`,
    {
      userId: user?.id ?? null,
      userName: user?.name ?? 'System',
      action,
      entity: entity ?? null,
      entityId: entityId == null ? null : String(entityId),
      details: details ? JSON.stringify(details) : null,
      ip: actor?.ip ?? null,
      createdAt: now(),
    },
  );
}
