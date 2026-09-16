// ─── Environmental Location Profiles Route ────────────────────────────────────
// GET  /api/env/location-profiles           → searchable list (all roles)
// POST /api/env/location-profiles           → create (admin/manager only)
// PUT  /api/env/location-profiles/:id       → update (admin/manager only)
// PATCH /api/env/location-profiles/:id/deactivate → soft-deactivate (admin/manager only)
//
// Physical delete is NEVER allowed. Historical env_samples continue referencing
// inactive profiles. Only admin/manager may write; all authenticated users may read.

'use strict';

const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { normalizeKey, cleanDisplayValue } = require('../lib/normalize');
const { recordAuditEvent } = require('../lib/audit');

// ─── GET / — searchable list ─────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { q, iso_class, room_or_area, active, sample_type, context } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (q) {
      conditions.push(`(
        elp.location_code ILIKE $${idx} OR
        elp.location_code_key ILIKE $${idx} OR
        elp.display_name ILIKE $${idx} OR
        elp.room_or_area ILIKE $${idx}
      )`);
      params.push(`%${q}%`);
      idx++;
    }
    if (iso_class) {
      conditions.push(`elp.iso_class = $${idx++}`);
      params.push(iso_class);
    }
    if (room_or_area) {
      conditions.push(`elp.room_or_area ILIKE $${idx++}`);
      params.push(`%${room_or_area}%`);
    }
    if (active !== undefined) {
      conditions.push(`elp.active = $${idx++}`);
      params.push(active === 'true' || active === true);
    }
    if (sample_type) {
      conditions.push(`$${idx++} = ANY(elp.allowed_sample_types)`);
      params.push(sample_type);
    }
    if (context) {
      conditions.push(`$${idx++} = ANY(elp.allowed_contexts)`);
      params.push(context);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT
        elp.*,
        cu.name AS created_by_name,
        uu.name AS updated_by_name
      FROM env_location_profiles elp
      LEFT JOIN users cu ON cu.id = elp.created_by
      LEFT JOIN users uu ON uu.id = elp.updated_by
      ${where}
      ORDER BY elp.active DESC, elp.iso_class ASC, elp.location_code ASC
      LIMIT 200
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[env-location-profiles] GET error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /:id — single profile ───────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT elp.*, cu.name AS created_by_name, uu.name AS updated_by_name
       FROM env_location_profiles elp
       LEFT JOIN users cu ON cu.id = elp.created_by
       LEFT JOIN users uu ON uu.id = elp.updated_by
       WHERE elp.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Location profile not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[env-location-profiles] GET /:id error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST / — create (admin/manager only) ────────────────────────────────────
router.post('/', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const {
    location_code, display_name, room_or_area, iso_class,
    allowed_sample_types, allowed_contexts, frequency, notes,
  } = req.body;

  if (!location_code || !display_name || !room_or_area || !iso_class) {
    return res.status(400).json({ message: 'location_code, display_name, room_or_area, and iso_class are required' });
  }
  if (!['ISO 5', 'ISO 7', 'ISO 8'].includes(iso_class)) {
    return res.status(400).json({ message: 'iso_class must be ISO 5, ISO 7, or ISO 8' });
  }

  const locationCodeKey = normalizeKey(location_code);
  const cleanCode       = cleanDisplayValue(location_code);
  const cleanName       = cleanDisplayValue(display_name);
  const cleanRoom       = cleanDisplayValue(room_or_area);

  const sampleTypes = Array.isArray(allowed_sample_types) && allowed_sample_types.length > 0
    ? allowed_sample_types
    : ['VIABLE_AIR', 'NONVIABLE_AIR'];
  const contexts = Array.isArray(allowed_contexts) && allowed_contexts.length > 0
    ? allowed_contexts
    : ['BATCH', 'ROUTINE_MONTHLY', 'OTHER'];

  const validTypes    = ['VIABLE_AIR', 'NONVIABLE_AIR', 'SURFACE'];
  const validContexts = ['BATCH', 'ROUTINE_MONTHLY', 'ROUTINE_WEEKLY', 'OTHER'];
  if (sampleTypes.some(t => !validTypes.includes(t))) {
    return res.status(400).json({ message: 'Invalid sample type(s)' });
  }
  if (contexts.some(c => !validContexts.includes(c))) {
    return res.status(400).json({ message: 'Invalid monitoring context(s)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check for duplicate normalized code
    const existing = await client.query(
      'SELECT id, location_code FROM env_location_profiles WHERE location_code_key = $1',
      [locationCodeKey]
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Location profile already exists: "${existing.rows[0].location_code}"`,
        existing: existing.rows[0],
      });
    }

    const result = await client.query(
      `INSERT INTO env_location_profiles
         (location_code, location_code_key, display_name, room_or_area, iso_class,
          allowed_sample_types, allowed_contexts, frequency, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
       RETURNING *`,
      [cleanCode, locationCodeKey, cleanName, cleanRoom, iso_class,
       sampleTypes, contexts, frequency || null, notes || null, req.user.id]
    );
    const record = result.rows[0];

    await recordAuditEvent({
      client, actionType: 'CREATE',
      entityType: 'env_location_profile', entityId: record.id,
      actor: req.user, afterValues: record,
    });
    await client.query('COMMIT');
    res.status(201).json(record);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-location-profiles] POST error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── PUT /:id — update (admin/manager only) ──────────────────────────────────
router.put('/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const {
    location_code, display_name, room_or_area, iso_class,
    allowed_sample_types, allowed_contexts, frequency, notes,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      'SELECT * FROM env_location_profiles WHERE id = $1',
      [req.params.id]
    );
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Location profile not found' });
    }
    const prev = before.rows[0];

    const locationCodeKey = location_code ? normalizeKey(location_code) : prev.location_code_key;
    const cleanCode       = location_code ? cleanDisplayValue(location_code) : prev.location_code;
    const cleanName       = display_name  ? cleanDisplayValue(display_name)  : prev.display_name;
    const cleanRoom       = room_or_area  ? cleanDisplayValue(room_or_area)  : prev.room_or_area;
    const isoClass        = iso_class     || prev.iso_class;
    const sTypes          = Array.isArray(allowed_sample_types) ? allowed_sample_types : prev.allowed_sample_types;
    const ctxs            = Array.isArray(allowed_contexts)     ? allowed_contexts     : prev.allowed_contexts;

    // Validate if new code conflicts with another profile
    if (location_code && locationCodeKey !== prev.location_code_key) {
      const dup = await client.query(
        'SELECT id FROM env_location_profiles WHERE location_code_key = $1 AND id != $2',
        [locationCodeKey, req.params.id]
      );
      if (dup.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Another profile with the same normalized location code already exists' });
      }
    }

    const result = await client.query(
      `UPDATE env_location_profiles SET
         location_code=$1, location_code_key=$2, display_name=$3, room_or_area=$4,
         iso_class=$5, allowed_sample_types=$6, allowed_contexts=$7, frequency=$8, notes=$9,
         updated_by=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [cleanCode, locationCodeKey, cleanName, cleanRoom, isoClass, sTypes, ctxs,
       frequency !== undefined ? (frequency || null) : prev.frequency,
       notes !== undefined ? (notes || null) : prev.notes,
       req.user.id, req.params.id]
    );
    const afterValues = result.rows[0];
    const changedFields = Object.keys(afterValues).filter(
      k => JSON.stringify(prev[k]) !== JSON.stringify(afterValues[k])
    );

    await recordAuditEvent({
      client, actionType: 'UPDATE',
      entityType: 'env_location_profile', entityId: req.params.id,
      actor: req.user, beforeValues: prev, afterValues, changedFields,
    });
    await client.query('COMMIT');
    res.json(afterValues);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-location-profiles] PUT error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── PATCH /:id/deactivate — soft deactivate (admin/manager only) ─────────────
// Does NOT physically delete. Historical env_samples continue referencing inactive profiles.
router.patch('/:id/deactivate', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      'SELECT * FROM env_location_profiles WHERE id = $1',
      [req.params.id]
    );
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Location profile not found' });
    }
    const prev = before.rows[0];
    if (!prev.active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Location profile is already inactive' });
    }

    const result = await client.query(
      'UPDATE env_location_profiles SET active=false, updated_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [req.user.id, req.params.id]
    );
    const afterValues = result.rows[0];

    await recordAuditEvent({
      client, actionType: 'UPDATE',
      entityType: 'env_location_profile', entityId: req.params.id,
      actor: req.user, beforeValues: prev, afterValues,
      changedFields: ['active'],
    });
    await client.query('COMMIT');
    res.json({ success: true, profile: afterValues });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-location-profiles] PATCH deactivate error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── PATCH /:id/reactivate — re-activate (admin/manager only) ────────────────
router.patch('/:id/reactivate', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      'SELECT * FROM env_location_profiles WHERE id = $1',
      [req.params.id]
    );
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Location profile not found' });
    }
    const prev = before.rows[0];
    if (prev.active) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Location profile is already active' });
    }

    const result = await client.query(
      'UPDATE env_location_profiles SET active=true, updated_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [req.user.id, req.params.id]
    );
    const afterValues = result.rows[0];

    await recordAuditEvent({
      client, actionType: 'UPDATE',
      entityType: 'env_location_profile', entityId: req.params.id,
      actor: req.user, beforeValues: prev, afterValues,
      changedFields: ['active'],
    });
    await client.query('COMMIT');
    res.json({ success: true, profile: afterValues });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-location-profiles] PATCH reactivate error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
