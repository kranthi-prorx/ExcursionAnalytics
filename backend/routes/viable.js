const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { normalizeKey, cleanDisplayValue } = require('../lib/normalize');
const { recordAuditEvent } = require('../lib/audit');

// Monitoring context values
const VALID_CONTEXTS = ['BATCH', 'ROUTINE_MONTHLY', 'OTHER'];
const VALID_SAMPLE_TYPES = ['VIABLE_AIR', 'NONVIABLE_AIR'];
const VALID_ISO = ['ISO 5', 'ISO 7', 'ISO 8'];

// Ensure viable_data table exists (legacy safety net)
pool.query('CREATE TABLE IF NOT EXISTS viable_data (id SERIAL PRIMARY KEY, lot_number TEXT, lot_number_key TEXT, sample_date DATE NOT NULL, iso_class TEXT NOT NULL DEFAULT $ISO 7$, room_number TEXT, iso5_cfu SMALLINT, iso7_cfu SMALLINT, iso8_cfu SMALLINT, particle_05um NUMERIC(12,2), particle_50um NUMERIC(12,2), deviation_number TEXT, notes TEXT, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'.replace(/\$ISO 7\$/g, "'ISO 7'")).catch(console.error);

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        vd.*,
        u.name AS created_by_name,
        lp.display_lot AS lot_display,
        elp.display_name AS location_profile_name
      FROM viable_data vd
      LEFT JOIN users u ON u.id = vd.created_by
      LEFT JOIN lot_profiles lp ON lp.id = vd.lot_id
      LEFT JOIN env_location_profiles elp ON elp.id = vd.location_profile_id
      WHERE vd.deleted_at IS NULL
      ORDER BY vd.sample_date DESC, vd.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/by-lot', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(lot_number_key, LOWER(TRIM(lot_number))) AS lot_key,
        MIN(lot_number) AS lot_number,
        SUM(iso5_cfu)::int AS iso5_total,
        SUM(iso7_cfu)::int AS iso7_total,
        SUM(iso8_cfu)::int AS iso8_total,
        ROUND(AVG(particle_05um),2) AS avg_05um,
        ROUND(AVG(particle_50um),2) AS avg_50um,
        COUNT(*)::int AS sample_count
      FROM viable_data
      WHERE deleted_at IS NULL AND lot_number IS NOT NULL
      GROUP BY COALESCE(lot_number_key, LOWER(TRIM(lot_number)))
      ORDER BY MIN(sample_date) DESC
    `);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', authMiddleware, async (req, res) => {
  const {
    // Context
    monitoring_context,
    lot_number, lot_id,
    sample_date,
    iso_class,
    room_number,
    sample_location,
    location_profile_id,
    sample_type,
    // Measurements — all nullable
    iso5_cfu, iso7_cfu, iso8_cfu,
    particle_05um, particle_50um,
    // Meta
    deviation_number, notes,
  } = req.body;

  if (!sample_date) return res.status(400).json({ message: 'sample_date is required' });

  const ctx = monitoring_context || 'BATCH';
  if (!VALID_CONTEXTS.includes(ctx)) {
    return res.status(400).json({ message: `monitoring_context must be one of: ${VALID_CONTEXTS.join(', ')}` });
  }
  if (ctx === 'BATCH' && !lot_number && !lot_id) {
    return res.status(400).json({ message: 'lot_number or lot_id is required for Batch monitoring' });
  }

  const sType = sample_type || 'VIABLE_AIR';
  if (!VALID_SAMPLE_TYPES.includes(sType)) {
    return res.status(400).json({ message: `sample_type must be one of: ${VALID_SAMPLE_TYPES.join(', ')}` });
  }

  // Normalize lot
  const cleanLot = lot_number ? cleanDisplayValue(lot_number) : null;
  const lotKey   = lot_number ? normalizeKey(lot_number) : null;

  // Store NULL for not-collected measurements (never default to 0)
  const parseMeasurement = (v) => (v === null || v === undefined || v === '') ? null : Number(v);
  const iso5 = parseMeasurement(iso5_cfu);
  const iso7 = parseMeasurement(iso7_cfu);
  const iso8 = parseMeasurement(iso8_cfu);
  const p05  = parseMeasurement(particle_05um);
  const p50  = parseMeasurement(particle_50um);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert lot_profile if lot_number provided but no lot_id
    let resolvedLotId = lot_id || null;
    if (cleanLot && !resolvedLotId) {
      const existing = await client.query('SELECT id FROM lot_profiles WHERE lot_key = $1', [lotKey]);
      if (existing.rows.length > 0) {
        resolvedLotId = existing.rows[0].id;
      } else {
        const newLot = await client.query(
          'INSERT INTO lot_profiles (display_lot, lot_key) VALUES ($1, $2) RETURNING id',
          [cleanLot, lotKey]
        );
        resolvedLotId = newLot.rows[0].id;
      }
    }

    const result = await client.query(`
      INSERT INTO viable_data (
        monitoring_context, lot_number, lot_number_key, lot_id,
        sample_date, iso_class, room_number, sample_location, location_profile_id,
        sample_type, iso5_cfu, iso7_cfu, iso8_cfu,
        particle_05um, particle_50um, deviation_number, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      ctx, cleanLot, lotKey, resolvedLotId,
      sample_date, iso_class || 'ISO 7', room_number || null, sample_location || null, location_profile_id || null,
      sType, iso5, iso7, iso8,
      p05, p50, deviation_number || null, notes || null, req.user.id,
    ]);

    const record = result.rows[0];
    await recordAuditEvent({
      client, actionType: 'CREATE', entityType: 'viable_record', entityId: record.id,
      actor: req.user, afterValues: record,
      batchNumber: cleanLot, dateOfBatch: sample_date,
    });
    await client.query('COMMIT');
    res.status(201).json(record);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally { client.release(); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const {
    monitoring_context, lot_number, lot_id,
    sample_date, iso_class, room_number, sample_location, location_profile_id,
    sample_type, iso5_cfu, iso7_cfu, iso8_cfu,
    particle_05um, particle_50um, deviation_number, notes,
  } = req.body;

  const cleanLot = lot_number ? cleanDisplayValue(lot_number) : null;
  const lotKey   = lot_number ? normalizeKey(lot_number) : null;

  const parseMeasurement = (v) => (v === null || v === undefined || v === '') ? null : Number(v);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM viable_data WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!before.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Not found' }); }

    // Resolve lot_id if lot_number provided
    let resolvedLotId = lot_id || null;
    if (cleanLot && !resolvedLotId) {
      const existing = await client.query('SELECT id FROM lot_profiles WHERE lot_key = $1', [lotKey]);
      if (existing.rows.length > 0) resolvedLotId = existing.rows[0].id;
    }

    const result = await client.query(`
      UPDATE viable_data SET
        monitoring_context=$1, lot_number=$2, lot_number_key=$3, lot_id=$4,
        sample_date=$5, iso_class=$6, room_number=$7, sample_location=$8, location_profile_id=$9,
        sample_type=$10, iso5_cfu=$11, iso7_cfu=$12, iso8_cfu=$13,
        particle_05um=$14, particle_50um=$15, deviation_number=$16, notes=$17
      WHERE id=$18 RETURNING *
    `, [
      monitoring_context || before.rows[0].monitoring_context || 'BATCH',
      cleanLot, lotKey, resolvedLotId,
      sample_date, iso_class || 'ISO 7',
      room_number || null, sample_location || null, location_profile_id || null,
      sample_type || before.rows[0].sample_type || 'VIABLE_AIR',
      parseMeasurement(iso5_cfu), parseMeasurement(iso7_cfu), parseMeasurement(iso8_cfu),
      parseMeasurement(particle_05um), parseMeasurement(particle_50um),
      deviation_number || null, notes || null, req.params.id,
    ]);

    const afterValues = result.rows[0];
    const changedFields = Object.keys(afterValues).filter(k => JSON.stringify(before.rows[0][k]) !== JSON.stringify(afterValues[k]));
    await recordAuditEvent({
      client, actionType: 'UPDATE', entityType: 'viable_record', entityId: req.params.id,
      actor: req.user, beforeValues: before.rows[0], afterValues, changedFields,
      batchNumber: cleanLot, dateOfBatch: sample_date,
    });
    await client.query('COMMIT');
    res.json(afterValues);
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

router.delete('/:id', authMiddleware, requireRole('admin', 'manager', 'user'), async (req, res) => {
  const reason = ((req.body && req.body.reason) || '').trim();
  if (!reason || reason.length < 3) return res.status(400).json({ message: 'A deletion reason of at least 3 characters is required.' });
  if (reason.length > 500) return res.status(400).json({ message: 'Deletion reason must not exceed 500 characters.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM viable_data WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Record not found or already deleted.' }); }
    const bv = before.rows[0];
    await recordAuditEvent({ client, actionType: 'DELETE', entityType: 'viable_record', entityId: req.params.id, actor: req.user, beforeValues: bv, afterValues: { deleted_at: new Date().toISOString(), deleted_by: req.user.id, deletion_reason: reason }, reason, batchNumber: bv.lot_number, dateOfBatch: bv.sample_date });
    await client.query('UPDATE viable_data SET deleted_at=NOW(), deleted_by=$1, deletion_reason=$2 WHERE id=$3', [req.user.id, reason, req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, recordId: req.params.id, deletedAt: new Date().toISOString(), message: 'Viable record deleted' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

router.post('/:id/restore', authMiddleware, requireRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM viable_data WHERE id=$1 AND deleted_at IS NOT NULL', [req.params.id]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Deleted record not found.' }); }
    await client.query('UPDATE viable_data SET deleted_at=NULL, deleted_by=NULL, deletion_reason=NULL WHERE id=$1', [req.params.id]);
    const after = await client.query('SELECT * FROM viable_data WHERE id=$1', [req.params.id]);
    await recordAuditEvent({ client, actionType: 'RESTORE', entityType: 'viable_record', entityId: req.params.id, actor: req.user, beforeValues: before.rows[0], afterValues: after.rows[0], batchNumber: after.rows[0].lot_number, dateOfBatch: after.rows[0].sample_date });
    await client.query('COMMIT');
    res.json({ success: true, recordId: req.params.id, message: 'Viable record restored' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

module.exports = router;
