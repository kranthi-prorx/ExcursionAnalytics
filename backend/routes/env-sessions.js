// ─── Environmental Monitoring Sessions Route ──────────────────────────────────
// GET    /api/env/sessions            → paginated, filtered list
// POST   /api/env/sessions            → create session
// GET    /api/env/sessions/:id        → session detail with samples
// PUT    /api/env/sessions/:id        → update session
// DELETE /api/env/sessions/:id        → soft delete (reason required)
// POST   /api/env/sessions/:id/restore → admin only

'use strict';

const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { normalizeKey, cleanDisplayValue } = require('../lib/normalize');
const { recordAuditEvent } = require('../lib/audit');
const { calculateCompletionStatus } = require('../lib/completion');

const VALID_CONTEXTS = ['BATCH', 'ROUTINE_MONTHLY', 'ROUTINE_WEEKLY', 'OTHER'];

// ─── Helper: get session samples (non-deleted) ───────────────────────────────
async function getSessionSamples(client, sessionId) {
  const result = await client.query(
    `SELECT es.*, elp.location_code, elp.display_name AS location_display_name,
            elp.iso_class AS profile_iso_class, elp.allowed_sample_types,
            elp.allowed_contexts AS profile_contexts
     FROM env_samples es
     LEFT JOIN env_location_profiles elp ON elp.id = es.location_profile_id
     WHERE es.session_id = $1 AND es.deleted_at IS NULL
     ORDER BY es.iso_class, es.sample_type, es.created_at`,
    [sessionId]
  );
  return result.rows;
}

// ─── Helper: get linked location profiles for a session ──────────────────────
async function getSessionLocationProfiles(client, sessionId) {
  const result = await client.query(
    `SELECT DISTINCT elp.*
     FROM env_samples es
     JOIN env_location_profiles elp ON elp.id = es.location_profile_id
     WHERE es.session_id = $1 AND es.deleted_at IS NULL`,
    [sessionId]
  );
  return result.rows;
}

// ─── Helper: recalculate and persist completion status ────────────────────────
async function refreshCompletionStatus(client, sessionId) {
  const sessionResult = await client.query(
    'SELECT * FROM env_monitoring_sessions WHERE id = $1',
    [sessionId]
  );
  if (!sessionResult.rows.length) return;

  const session  = sessionResult.rows[0];
  const samples  = await getSessionSamples(client, sessionId);
  const profiles = await getSessionLocationProfiles(client, sessionId);

  const { completion_status, missing_requirements } = calculateCompletionStatus(session, samples, profiles);

  await client.query(
    `UPDATE env_monitoring_sessions
     SET completion_status=$1, missing_requirements=$2, updated_at=NOW()
     WHERE id=$3`,
    [completion_status, missing_requirements, sessionId]
  );
}

// ─── GET / — paginated, filtered ─────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const {
      date_from, date_to, context, room_or_area, batch_id,
      completion_status, created_by, lot_number,
    } = req.query;
    const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
    const offset = parseInt(req.query.offset || '0');

    const conditions = ['ems.deleted_at IS NULL'];
    const params = [];
    let idx = 1;

    if (date_from)         { conditions.push(`ems.monitoring_date >= $${idx++}`); params.push(date_from); }
    if (date_to)           { conditions.push(`ems.monitoring_date <= $${idx++}`); params.push(date_to); }
    if (context)           { conditions.push(`ems.monitoring_context = $${idx++}`); params.push(context); }
    if (room_or_area)      { conditions.push(`ems.room_or_area ILIKE $${idx++}`); params.push(`%${room_or_area}%`); }
    if (batch_id)          { conditions.push(`ems.batch_id = $${idx++}`); params.push(batch_id); }
    if (completion_status) { conditions.push(`ems.completion_status = $${idx++}`); params.push(completion_status); }
    if (created_by)        { conditions.push(`ems.created_by = $${idx++}`); params.push(created_by); }
    if (lot_number) {
      conditions.push(`lp.lot_key ILIKE $${idx++}`);
      params.push(`%${normalizeKey(lot_number)}%`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countSql = `
      SELECT COUNT(DISTINCT ems.id)::int AS total
      FROM env_monitoring_sessions ems
      LEFT JOIN lot_profiles lp ON lp.id = ems.batch_id
      ${where}
    `;
    const countRes = await pool.query(countSql, params);

    const dataSql = `
      SELECT
        ems.*,
        lp.display_lot AS lot_number,
        lp.lot_key,
        cu.name AS created_by_name,
        uu.name AS updated_by_name,
        (SELECT COUNT(*)::int FROM env_samples es
         WHERE es.session_id = ems.id AND es.deleted_at IS NULL) AS sample_count
      FROM env_monitoring_sessions ems
      LEFT JOIN lot_profiles lp ON lp.id = ems.batch_id
      LEFT JOIN users cu ON cu.id = ems.created_by
      LEFT JOIN users uu ON uu.id = ems.updated_by
      ${where}
      ORDER BY ems.monitoring_date DESC, ems.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(limit, offset);

    const dataRes = await pool.query(dataSql, params);
    res.json({
      sessions: dataRes.rows,
      total: countRes.rows[0].total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[env-sessions] GET error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /:id — session detail with samples ──────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const sessionResult = await pool.query(
      `SELECT ems.*, lp.display_lot AS lot_number, lp.lot_key,
              cu.name AS created_by_name, uu.name AS updated_by_name
       FROM env_monitoring_sessions ems
       LEFT JOIN lot_profiles lp ON lp.id = ems.batch_id
       LEFT JOIN users cu ON cu.id = ems.created_by
       LEFT JOIN users uu ON uu.id = ems.updated_by
       WHERE ems.id = $1`,
      [req.params.id]
    );
    if (!sessionResult.rows.length) return res.status(404).json({ message: 'Session not found' });
    const session = sessionResult.rows[0];

    const samplesResult = await pool.query(
      `SELECT es.*, elp.location_code, elp.display_name AS location_display_name,
              elp.iso_class AS profile_iso_class, elp.room_or_area AS profile_room_or_area,
              u.name AS created_by_name
       FROM env_samples es
       LEFT JOIN env_location_profiles elp ON elp.id = es.location_profile_id
       LEFT JOIN users u ON u.id = es.created_by
       WHERE es.session_id = $1 AND es.deleted_at IS NULL
       ORDER BY es.iso_class, es.sample_type, es.created_at`,
      [req.params.id]
    );

    res.json({ ...session, samples: samplesResult.rows });
  } catch (err) {
    console.error('[env-sessions] GET /:id error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST / — create session ─────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const {
    monitoring_date, monitoring_context, room_or_area,
    batch_id, custom_reason, notes,
  } = req.body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!monitoring_date)    return res.status(400).json({ message: 'monitoring_date is required' });
  if (!monitoring_context) return res.status(400).json({ message: 'monitoring_context is required' });
  if (!VALID_CONTEXTS.includes(monitoring_context)) {
    return res.status(400).json({ message: `monitoring_context must be one of: ${VALID_CONTEXTS.join(', ')}` });
  }

  // BATCH: lot/batch required
  if (monitoring_context === 'BATCH' && !batch_id) {
    return res.status(400).json({ message: 'batch_id (lot profile ID) is required for Batch Monitoring' });
  }

  // ROUTINE_MONTHLY / ROUTINE_WEEKLY: room_or_area required; lot NOT required
  if (['ROUTINE_MONTHLY', 'ROUTINE_WEEKLY'].includes(monitoring_context) && !room_or_area) {
    return res.status(400).json({ message: 'room_or_area is required for routine monitoring' });
  }

  // OTHER: custom_reason required, non-whitespace
  if (monitoring_context === 'OTHER') {
    const reason = (custom_reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'A non-blank custom_reason is required when monitoring_context is OTHER' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validate batch_id refers to a real lot_profile
    if (batch_id) {
      const lpCheck = await client.query('SELECT id FROM lot_profiles WHERE id = $1', [batch_id]);
      if (!lpCheck.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'batch_id does not reference a known lot profile' });
      }
    }

    const result = await client.query(
      `INSERT INTO env_monitoring_sessions
         (monitoring_date, monitoring_context, room_or_area, batch_id, custom_reason,
          completion_status, missing_requirements, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,'INCOMPLETE','{}',$6,$7,$7)
       RETURNING *`,
      [
        monitoring_date,
        monitoring_context,
        room_or_area || null,
        batch_id || null,
        (custom_reason || '').trim() || null,
        notes || null,
        req.user.id,
      ]
    );
    const session = result.rows[0];

    await recordAuditEvent({
      client, actionType: 'CREATE',
      entityType: 'env_monitoring_session', entityId: session.id,
      actor: req.user, afterValues: session,
      batchNumber: null, dateOfBatch: monitoring_date,
    });
    await client.query('COMMIT');
    res.status(201).json(session);
  } catch (err) {
    await client.query('ROLLBACK');
    // Unique constraint violation → duplicate routine session
    if (err.code === '23505') {
      return res.status(409).json({
        message: 'A monitoring session already exists for this context, date, and room/area. Use the existing session to add samples.',
      });
    }
    console.error('[env-sessions] POST error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── PUT /:id — update session ───────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  const { monitoring_date, monitoring_context, room_or_area, batch_id, custom_reason, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      'SELECT * FROM env_monitoring_sessions WHERE id=$1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Session not found' });
    }
    const prev = before.rows[0];
    const newContext = monitoring_context || prev.monitoring_context;
    if (!VALID_CONTEXTS.includes(newContext)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid monitoring_context' });
    }

    // Validate context-specific rules
    const newBatchId = batch_id !== undefined ? batch_id : prev.batch_id;
    const newRoom    = room_or_area !== undefined ? room_or_area : prev.room_or_area;
    const newReason  = custom_reason !== undefined ? custom_reason : prev.custom_reason;

    if (newContext === 'BATCH' && !newBatchId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'batch_id is required for Batch Monitoring' });
    }
    if (['ROUTINE_MONTHLY', 'ROUTINE_WEEKLY'].includes(newContext) && !newRoom) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'room_or_area is required for routine monitoring' });
    }
    if (newContext === 'OTHER' && !(newReason || '').trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'custom_reason is required for OTHER context' });
    }

    const result = await client.query(
      `UPDATE env_monitoring_sessions SET
         monitoring_date=$1, monitoring_context=$2, room_or_area=$3,
         batch_id=$4, custom_reason=$5, notes=$6,
         updated_by=$7, updated_at=NOW()
       WHERE id=$8 AND deleted_at IS NULL RETURNING *`,
      [
        monitoring_date || prev.monitoring_date,
        newContext,
        newRoom || null,
        newBatchId || null,
        (newReason || '').trim() || null,
        notes !== undefined ? (notes || null) : prev.notes,
        req.user.id,
        req.params.id,
      ]
    );
    const afterValues = result.rows[0];
    const changedFields = Object.keys(afterValues).filter(
      k => JSON.stringify(prev[k]) !== JSON.stringify(afterValues[k])
    );

    await recordAuditEvent({
      client, actionType: 'UPDATE',
      entityType: 'env_monitoring_session', entityId: req.params.id,
      actor: req.user, beforeValues: prev, afterValues, changedFields,
    });

    // Recalculate completion after update
    await refreshCompletionStatus(client, req.params.id);

    await client.query('COMMIT');
    // Return fresh state
    const fresh = await pool.query(
      `SELECT ems.*, lp.display_lot AS lot_number FROM env_monitoring_sessions ems
       LEFT JOIN lot_profiles lp ON lp.id = ems.batch_id
       WHERE ems.id=$1`, [req.params.id]
    );
    res.json(fresh.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A session already exists for this context, date, and room/area' });
    }
    console.error('[env-sessions] PUT error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── DELETE /:id — soft delete ────────────────────────────────────────────────
router.delete('/:id', authMiddleware, requireRole('admin', 'manager', 'user'), async (req, res) => {
  const reason = ((req.body && req.body.reason) || '').trim();
  if (!reason || reason.length < 3)  return res.status(400).json({ message: 'A deletion reason of at least 3 characters is required' });
  if (reason.length > 500) return res.status(400).json({ message: 'Deletion reason must not exceed 500 characters' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      'SELECT * FROM env_monitoring_sessions WHERE id=$1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Session not found or already deleted' });
    }
    const bv = before.rows[0];

    await recordAuditEvent({
      client, actionType: 'DELETE',
      entityType: 'env_monitoring_session', entityId: req.params.id,
      actor: req.user, beforeValues: bv,
      afterValues: { deleted_at: new Date().toISOString(), deleted_by: req.user.id, deletion_reason: reason },
      reason,
    });
    await client.query(
      'UPDATE env_monitoring_sessions SET deleted_at=NOW(), deleted_by=$1, deletion_reason=$2 WHERE id=$3',
      [req.user.id, reason, req.params.id]
    );
    await client.query('COMMIT');
    res.json({ success: true, sessionId: req.params.id, deletedAt: new Date().toISOString() });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-sessions] DELETE error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── POST /:id/restore — admin only ─────────────────────────────────────────
router.post('/:id/restore', authMiddleware, requireRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      'SELECT * FROM env_monitoring_sessions WHERE id=$1 AND deleted_at IS NOT NULL',
      [req.params.id]
    );
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Deleted session not found' });
    }
    await client.query(
      'UPDATE env_monitoring_sessions SET deleted_at=NULL, deleted_by=NULL, deletion_reason=NULL, updated_at=NOW() WHERE id=$1',
      [req.params.id]
    );
    const after = await client.query('SELECT * FROM env_monitoring_sessions WHERE id=$1', [req.params.id]);
    await recordAuditEvent({
      client, actionType: 'RESTORE',
      entityType: 'env_monitoring_session', entityId: req.params.id,
      actor: req.user, beforeValues: before.rows[0], afterValues: after.rows[0],
    });
    await client.query('COMMIT');
    res.json({ success: true, session: after.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-sessions] RESTORE error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
module.exports.refreshCompletionStatus = refreshCompletionStatus;
