// ─── Environmental Samples Route ─────────────────────────────────────────────
// POST   /api/env/samples            → create sample (validates type/fields, derives status)
// PUT    /api/env/samples/:id        → update sample
// DELETE /api/env/samples/:id        → soft delete (reason required)
// POST   /api/env/samples/:id/restore → admin only
//
// After every mutation, recalculates parent session completion_status.
// Backend ALWAYS derives status — frontend-submitted status is NEVER trusted.
// Missing measurements stored as NULL, never as 0.

'use strict';

const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { recordAuditEvent } = require('../lib/audit');
const {
  evaluateViableCfuStatus,
  evaluateSurfaceCfuStatus,
  evaluateParticleStatus,
  worstStatus,
} = require('../lib/thresholds');
const { refreshCompletionStatus } = require('./env-sessions');

const VALID_TYPES   = ['VIABLE_AIR', 'NONVIABLE_AIR', 'SURFACE'];
const VALID_ISO     = ['ISO 5', 'ISO 7', 'ISO 8'];

// ─── Helper: validate sample type vs. provided fields ───────────────────────
function validateSampleTypeFields(sample_type, body) {
  const errors = [];

  if (sample_type === 'VIABLE_AIR') {
    if (body.surface_cfu !== undefined && body.surface_cfu !== null) {
      errors.push('surface_cfu is not applicable for VIABLE_AIR samples');
    }
    if (body.particle_count_0_5 !== undefined && body.particle_count_0_5 !== null) {
      errors.push('particle_count_0_5 is not applicable for VIABLE_AIR samples');
    }
    if (body.particle_count_5_0 !== undefined && body.particle_count_5_0 !== null) {
      errors.push('particle_count_5_0 is not applicable for VIABLE_AIR samples');
    }
  }

  if (sample_type === 'NONVIABLE_AIR') {
    if (body.viable_cfu !== undefined && body.viable_cfu !== null) {
      errors.push('viable_cfu is not applicable for NONVIABLE_AIR samples');
    }
    if (body.surface_cfu !== undefined && body.surface_cfu !== null) {
      errors.push('surface_cfu is not applicable for NONVIABLE_AIR samples');
    }
  }

  if (sample_type === 'SURFACE') {
    if (body.viable_cfu !== undefined && body.viable_cfu !== null) {
      errors.push('viable_cfu is not applicable for SURFACE samples');
    }
    if (body.particle_count_0_5 !== undefined && body.particle_count_0_5 !== null) {
      errors.push('particle_count_0_5 is not applicable for SURFACE samples');
    }
    if (body.particle_count_5_0 !== undefined && body.particle_count_5_0 !== null) {
      errors.push('particle_count_5_0 is not applicable for SURFACE samples');
    }
  }

  return errors;
}

// ─── Helper: derive all status fields server-side ───────────────────────────
function deriveStatus(sample_type, iso_class, viable_cfu, surface_cfu, particle_count_0_5, particle_count_5_0) {
  let status_viable = null;
  let status_0_5    = null;
  let status_5_0    = null;
  let status        = null;

  if (sample_type === 'VIABLE_AIR') {
    status_viable = evaluateViableCfuStatus(viable_cfu, iso_class);
    status = status_viable;
  } else if (sample_type === 'SURFACE') {
    // Use viable_cfu field name but surface threshold
    const cfu = surface_cfu !== undefined && surface_cfu !== null ? surface_cfu : viable_cfu;
    const surfaceStatus = evaluateSurfaceCfuStatus(cfu, iso_class);
    status = surfaceStatus;
  } else if (sample_type === 'NONVIABLE_AIR') {
    status_0_5 = evaluateParticleStatus(particle_count_0_5, iso_class, '0_5');
    status_5_0 = evaluateParticleStatus(particle_count_5_0, iso_class, '5_0');
    status = worstStatus([status_0_5, status_5_0]);
  }

  return { status_viable, status_0_5, status_5_0, status };
}

// ─── Helper: validate location profile compatibility ─────────────────────────
async function validateLocationProfile(client, locationProfileId, sample_type, iso_class, monitoringContext) {
  if (!locationProfileId) return null; // freeform entry allowed

  const lpResult = await client.query(
    'SELECT * FROM env_location_profiles WHERE id = $1',
    [locationProfileId]
  );
  if (!lpResult.rows.length) return 'Location profile not found';
  const lp = lpResult.rows[0];

  if (!lp.active) return 'Location profile is inactive and cannot accept new samples';

  if (lp.iso_class !== iso_class) {
    return `ISO class mismatch: profile is ${lp.iso_class}, sample is ${iso_class}`;
  }
  if (!lp.allowed_sample_types.includes(sample_type)) {
    return `Sample type "${sample_type}" is not allowed for this location profile (allowed: ${lp.allowed_sample_types.join(', ')})`;
  }
  if (monitoringContext && !lp.allowed_contexts.includes(monitoringContext)) {
    return `Monitoring context "${monitoringContext}" is not allowed for this location profile (allowed: ${lp.allowed_contexts.join(', ')})`;
  }

  return null; // OK
}

// ─── POST / — create sample ──────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const {
    session_id, location_profile_id, sample_location_text,
    sample_type, iso_class,
    viable_cfu, surface_cfu, particle_count_0_5, particle_count_5_0,
    organism_id, deviation_number, notes,
  } = req.body;

  // ── Required fields ──
  if (!session_id)   return res.status(400).json({ message: 'session_id is required' });
  if (!sample_type)  return res.status(400).json({ message: 'sample_type is required' });
  if (!iso_class)    return res.status(400).json({ message: 'iso_class is required' });

  if (!VALID_TYPES.includes(sample_type)) {
    return res.status(400).json({ message: `sample_type must be one of: ${VALID_TYPES.join(', ')}` });
  }
  if (!VALID_ISO.includes(iso_class)) {
    return res.status(400).json({ message: `iso_class must be one of: ${VALID_ISO.join(', ')}` });
  }

  // ── Type-field compatibility check ──
  const fieldErrors = validateSampleTypeFields(sample_type, req.body);
  if (fieldErrors.length) return res.status(400).json({ message: fieldErrors.join('; ') });

  // ── Coerce values (null for missing, never default to 0) ──
  const vcfu = viable_cfu !== undefined && viable_cfu !== null && viable_cfu !== '' ? parseInt(viable_cfu) : null;
  const scfu = surface_cfu !== undefined && surface_cfu !== null && surface_cfu !== '' ? parseInt(surface_cfu) : null;
  const p05  = particle_count_0_5 !== undefined && particle_count_0_5 !== null && particle_count_0_5 !== '' ? parseFloat(particle_count_0_5) : null;
  const p50  = particle_count_5_0 !== undefined && particle_count_5_0 !== null && particle_count_5_0 !== '' ? parseFloat(particle_count_5_0) : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify session exists and is not deleted
    const sessionResult = await client.query(
      'SELECT * FROM env_monitoring_sessions WHERE id=$1 AND deleted_at IS NULL',
      [session_id]
    );
    if (!sessionResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Monitoring session not found' });
    }
    const session = sessionResult.rows[0];

    // Validate location profile compatibility
    const lpError = await validateLocationProfile(
      client, location_profile_id, sample_type, iso_class, session.monitoring_context
    );
    if (lpError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: lpError });
    }

    // Validate SURFACE sample: ISO 8 not allowed with BATCH context for AIR (SURFACE is always allowed)
    // (No ISO restriction for surface — ISO 5, 7, 8 all valid for surface)

    // Derive status server-side
    const { status_viable, status_0_5, status_5_0, status } = deriveStatus(
      sample_type, iso_class, vcfu, scfu, p05, p50
    );

    const result = await client.query(
      `INSERT INTO env_samples
         (session_id, location_profile_id, sample_location_text,
          sample_type, iso_class,
          viable_cfu, surface_cfu, particle_count_0_5, particle_count_5_0,
          status_viable, status_0_5, status_5_0, status,
          organism_id, deviation_number, notes,
          created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
       RETURNING *`,
      [
        session_id,
        location_profile_id || null,
        sample_location_text || null,
        sample_type, iso_class,
        vcfu, scfu, p05, p50,
        status_viable, status_0_5, status_5_0, status,
        organism_id || null, deviation_number || null, notes || null,
        req.user.id,
      ]
    );
    const sample = result.rows[0];

    await recordAuditEvent({
      client, actionType: 'CREATE',
      entityType: 'env_sample', entityId: sample.id,
      actor: req.user, afterValues: sample,
      dateOfBatch: session.monitoring_date,
    });

    // Recalculate parent session completion status
    await refreshCompletionStatus(client, session_id);

    await client.query('COMMIT');
    res.status(201).json(sample);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-samples] POST error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── PUT /:id — update sample ────────────────────────────────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  const {
    location_profile_id, sample_location_text,
    sample_type, iso_class,
    viable_cfu, surface_cfu, particle_count_0_5, particle_count_5_0,
    organism_id, deviation_number, notes,
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      'SELECT * FROM env_samples WHERE id=$1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Sample not found' });
    }
    const prev = before.rows[0];

    const newType    = sample_type || prev.sample_type;
    const newIso     = iso_class   || prev.iso_class;

    if (!VALID_TYPES.includes(newType)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid sample_type' });
    }
    if (!VALID_ISO.includes(newIso)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid iso_class' });
    }

    const fieldErrors = validateSampleTypeFields(newType, req.body);
    if (fieldErrors.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: fieldErrors.join('; ') });
    }

    // Coerce — if field is explicitly provided as null/empty, set to null; else keep previous
    const vcfu = viable_cfu !== undefined       ? (viable_cfu !== null && viable_cfu !== '' ? parseInt(viable_cfu) : null) : prev.viable_cfu;
    const scfu = surface_cfu !== undefined      ? (surface_cfu !== null && surface_cfu !== '' ? parseInt(surface_cfu) : null) : prev.surface_cfu;
    const p05  = particle_count_0_5 !== undefined ? (particle_count_0_5 !== null && particle_count_0_5 !== '' ? parseFloat(particle_count_0_5) : null) : prev.particle_count_0_5;
    const p50  = particle_count_5_0 !== undefined ? (particle_count_5_0 !== null && particle_count_5_0 !== '' ? parseFloat(particle_count_5_0) : null) : prev.particle_count_5_0;

    // Validate location profile if changing it
    const newLpId = location_profile_id !== undefined ? location_profile_id : prev.location_profile_id;
    const session = await client.query(
      'SELECT * FROM env_monitoring_sessions WHERE id=$1', [prev.session_id]
    );
    const lpError = await validateLocationProfile(
      client, newLpId, newType, newIso,
      session.rows[0] ? session.rows[0].monitoring_context : null
    );
    if (lpError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: lpError });
    }

    const { status_viable, status_0_5, status_5_0, status } = deriveStatus(newType, newIso, vcfu, scfu, p05, p50);

    const result = await client.query(
      `UPDATE env_samples SET
         location_profile_id=$1, sample_location_text=$2,
         sample_type=$3, iso_class=$4,
         viable_cfu=$5, surface_cfu=$6, particle_count_0_5=$7, particle_count_5_0=$8,
         status_viable=$9, status_0_5=$10, status_5_0=$11, status=$12,
         organism_id=$13, deviation_number=$14, notes=$15,
         updated_by=$16, updated_at=NOW()
       WHERE id=$17 AND deleted_at IS NULL RETURNING *`,
      [
        newLpId || null,
        sample_location_text !== undefined ? (sample_location_text || null) : prev.sample_location_text,
        newType, newIso, vcfu, scfu, p05, p50,
        status_viable, status_0_5, status_5_0, status,
        organism_id !== undefined ? (organism_id || null) : prev.organism_id,
        deviation_number !== undefined ? (deviation_number || null) : prev.deviation_number,
        notes !== undefined ? (notes || null) : prev.notes,
        req.user.id, req.params.id,
      ]
    );
    const afterValues = result.rows[0];
    const changedFields = Object.keys(afterValues).filter(
      k => JSON.stringify(prev[k]) !== JSON.stringify(afterValues[k])
    );

    await recordAuditEvent({
      client, actionType: 'UPDATE',
      entityType: 'env_sample', entityId: req.params.id,
      actor: req.user, beforeValues: prev, afterValues, changedFields,
    });

    await refreshCompletionStatus(client, prev.session_id);
    await client.query('COMMIT');
    res.json(afterValues);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-samples] PUT error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// ─── DELETE /:id — soft delete ────────────────────────────────────────────────
router.delete('/:id', authMiddleware, requireRole('admin', 'manager', 'user'), async (req, res) => {
  const reason = ((req.body && req.body.reason) || '').trim();
  if (!reason || reason.length < 3) return res.status(400).json({ message: 'A deletion reason of at least 3 characters is required' });
  if (reason.length > 500) return res.status(400).json({ message: 'Deletion reason must not exceed 500 characters' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(
      'SELECT * FROM env_samples WHERE id=$1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Sample not found or already deleted' });
    }
    const bv = before.rows[0];

    await recordAuditEvent({
      client, actionType: 'DELETE',
      entityType: 'env_sample', entityId: req.params.id,
      actor: req.user, beforeValues: bv,
      afterValues: { deleted_at: new Date().toISOString(), deleted_by: req.user.id, deletion_reason: reason },
      reason,
    });
    await client.query(
      'UPDATE env_samples SET deleted_at=NOW(), deleted_by=$1, deletion_reason=$2 WHERE id=$3',
      [req.user.id, reason, req.params.id]
    );

    await refreshCompletionStatus(client, bv.session_id);
    await client.query('COMMIT');
    res.json({ success: true, sampleId: req.params.id, deletedAt: new Date().toISOString() });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-samples] DELETE error:', err.message);
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
      'SELECT * FROM env_samples WHERE id=$1 AND deleted_at IS NOT NULL',
      [req.params.id]
    );
    if (!before.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Deleted sample not found' });
    }
    await client.query(
      'UPDATE env_samples SET deleted_at=NULL, deleted_by=NULL, deletion_reason=NULL, updated_at=NOW() WHERE id=$1',
      [req.params.id]
    );
    const after = await client.query('SELECT * FROM env_samples WHERE id=$1', [req.params.id]);
    await recordAuditEvent({
      client, actionType: 'RESTORE',
      entityType: 'env_sample', entityId: req.params.id,
      actor: req.user, beforeValues: before.rows[0], afterValues: after.rows[0],
    });
    await refreshCompletionStatus(client, before.rows[0].session_id);
    await client.query('COMMIT');
    res.json({ success: true, sample: after.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[env-samples] RESTORE error:', err.message);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
