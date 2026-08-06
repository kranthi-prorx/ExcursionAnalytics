/**
 * Centralized audit service.
 * All mutation routes call recordAuditEvent() to write immutable entries.
 * Actor identity is taken from req.user (JWT-verified), never from the client.
 */

/**
 * @param {object} opts
 * @param {import('pg').PoolClient} opts.client
 * @param {'CREATE'|'UPDATE'|'DELETE'|'RESTORE'} opts.actionType
 * @param {string} opts.entityType
 * @param {string} opts.entityId
 * @param {{id:string,name:string,email:string,role:string}} opts.actor
 * @param {object|null} opts.beforeValues
 * @param {object|null} opts.afterValues
 * @param {string[]|null} opts.changedFields
 * @param {string|null} opts.reason
 * @param {string|null} opts.personnelName
 * @param {string|null} opts.batchNumber
 * @param {string|null} opts.dateOfBatch
 */
async function recordAuditEvent({
  client,
  actionType,
  entityType,
  entityId,
  actor,
  beforeValues  = null,
  afterValues   = null,
  changedFields = null,
  reason        = null,
  personnelName = null,
  batchNumber   = null,
  dateOfBatch   = null,
}) {
  const sanitize = (obj) => {
    if (!obj) return null;
    // eslint-disable-next-line no-unused-vars
    const { password_hash, password, token, secret, ...safe } = obj;
    return safe;
  };

  const sql = 'INSERT INTO audit_logs ' +
    '(action_type, entity_type, entity_id, ' +
    'actor_user_id, actor_name, actor_email, actor_role, ' +
    'occurred_at, ' +
    'deletion_reason, before_values, after_values, changed_fields, ' +
    'personnel_name, batch_number, date_of_batch) ' +
    'VALUES ' +
    '($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13, $14)';

  await client.query(sql, [
    actionType,
    entityType,
    String(entityId),
    (actor && actor.id)    || null,
    (actor && actor.name)  || 'Unknown',
    (actor && actor.email) || 'unknown',
    (actor && actor.role)  || 'user',
    reason || null,
    beforeValues  ? JSON.stringify(sanitize(beforeValues))  : null,
    afterValues   ? JSON.stringify(sanitize(afterValues))   : null,
    changedFields || null,
    personnelName || null,
    batchNumber   || null,
    dateOfBatch   || null,
  ]);
}

module.exports = { recordAuditEvent };
