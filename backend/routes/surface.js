const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { normalizeKey, cleanDisplayValue } = require('../lib/normalize');
const { recordAuditEvent } = require('../lib/audit');

const VALID_CONTEXTS = ['BATCH', 'ROUTINE_WEEKLY', 'OTHER'];

pool.query('CREATE TABLE IF NOT EXISTS surface_sampling (id SERIAL PRIMARY KEY, sample_location TEXT NOT NULL, lot_number TEXT, sample_date DATE NOT NULL, iso_class TEXT NOT NULL DEFAULT $ISO 7$, cfu_found SMALLINT, organism_id TEXT, deviation_number TEXT, notes TEXT, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'.replace(/\$ISO 7\$/g, "'ISO 7'")).catch(console.error);

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ss.*,
        u.name AS created_by_name,
        lp.display_lot AS lot_display,
        elp.display_name AS location_profile_name
      FROM surface_sampling ss
      LEFT JOIN users u ON u.id = ss.created_by
      LEFT JOIN lot_profiles lp ON lp.id = ss.lot_id
      LEFT JOIN env_location_profiles elp ON elp.id = ss.location_profile_id
      WHERE ss.deleted_at IS NULL
      ORDER BY ss.sample_date DESC, ss.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', authMiddleware, async (req, res) => {
  const {
    monitoring_context,
    sample_location, lot_number, lot_id,
    sample_date, iso_class,
    room_area, location_profile_id,
    cfu_found, organism_id, deviation_number, notes,
  } = req.body;

  if (!sample_location || !sample_date) {
    return res.status(400).json({ message: 'sample_location and sample_date are required' });
  }

  const ctx = monitoring_context || 'BATCH';
  if (!VALID_CONTEXTS.includes(ctx)) {
    return res.status(400).json({ message: `monitoring_context must be one of: ${VALID_CONTEXTS.join(', ')}` });
  }
  if (ctx === 'BATCH' && !lot_number && !lot_id) {
    return res.status(400).json({ message: 'lot_number or lot_id is required for Batch monitoring' });
  }

  const cleanLot = lot_number ? cleanDisplayValue(lot_number) : null;
  const lotKey   = lot_number ? normalizeKey(lot_number) : null;
  const cfuVal   = (cfu_found === null || cfu_found === undefined || cfu_found === '') ? null : parseInt(cfu_found);

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
      INSERT INTO surface_sampling (
        monitoring_context, sample_location, lot_number, lot_id,
        sample_date, iso_class, room_area, location_profile_id,
        cfu_found, organism_id, deviation_number, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      ctx, sample_location, cleanLot, resolvedLotId,
      sample_date, iso_class || 'ISO 7', room_area || null, location_profile_id || null,
      cfuVal, organism_id || null, deviation_number || null, notes || null, req.user.id,
    ]);

    const record = result.rows[0];
    await recordAuditEvent({
      client, actionType: 'CREATE', entityType: 'surface_record', entityId: record.id,
      actor: req.user, afterValues: record, batchNumber: cleanLot, dateOfBatch: sample_date,
    });
    await client.query('COMMIT');
    res.status(201).json(record);
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const {
    monitoring_context, sample_location, lot_number, lot_id,
    sample_date, iso_class, room_area, location_profile_id,
    cfu_found, organism_id, deviation_number, notes,
  } = req.body;

  const cleanLot = lot_number ? cleanDisplayValue(lot_number) : null;
  const lotKey   = lot_number ? normalizeKey(lot_number) : null;
  const cfuVal   = (cfu_found === null || cfu_found === undefined || cfu_found === '') ? null : parseInt(cfu_found);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM surface_sampling WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!before.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Not found' }); }

    let resolvedLotId = lot_id || null;
    if (cleanLot && !resolvedLotId) {
      const existing = await client.query('SELECT id FROM lot_profiles WHERE lot_key = $1', [lotKey]);
      if (existing.rows.length > 0) resolvedLotId = existing.rows[0].id;
    }

    const result = await client.query(`
      UPDATE surface_sampling SET
        monitoring_context=$1, sample_location=$2, lot_number=$3, lot_id=$4,
        sample_date=$5, iso_class=$6, room_area=$7, location_profile_id=$8,
        cfu_found=$9, organism_id=$10, deviation_number=$11, notes=$12
      WHERE id=$13 RETURNING *
    `, [
      monitoring_context || before.rows[0].monitoring_context || 'BATCH',
      sample_location, cleanLot, resolvedLotId,
      sample_date, iso_class || 'ISO 7', room_area || null, location_profile_id || null,
      cfuVal, organism_id || null, deviation_number || null, notes || null, req.params.id,
    ]);

    const afterValues = result.rows[0];
    const changedFields = Object.keys(afterValues).filter(k => JSON.stringify(before.rows[0][k]) !== JSON.stringify(afterValues[k]));
    await recordAuditEvent({
      client, actionType: 'UPDATE', entityType: 'surface_record', entityId: req.params.id,
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
    const before = await client.query('SELECT * FROM surface_sampling WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Record not found or already deleted.' }); }
    const bv = before.rows[0];
    await recordAuditEvent({ client, actionType: 'DELETE', entityType: 'surface_record', entityId: req.params.id, actor: req.user, beforeValues: bv, afterValues: { deleted_at: new Date().toISOString(), deleted_by: req.user.id, deletion_reason: reason }, reason, batchNumber: bv.lot_number, dateOfBatch: bv.sample_date });
    await client.query('UPDATE surface_sampling SET deleted_at=NOW(), deleted_by=$1, deletion_reason=$2 WHERE id=$3', [req.user.id, reason, req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, recordId: req.params.id, deletedAt: new Date().toISOString(), message: 'Surface record deleted' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

router.post('/:id/restore', authMiddleware, requireRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM surface_sampling WHERE id=$1 AND deleted_at IS NOT NULL', [req.params.id]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Deleted record not found.' }); }
    await client.query('UPDATE surface_sampling SET deleted_at=NULL, deleted_by=NULL, deletion_reason=NULL WHERE id=$1', [req.params.id]);
    const after = await client.query('SELECT * FROM surface_sampling WHERE id=$1', [req.params.id]);
    await recordAuditEvent({ client, actionType: 'RESTORE', entityType: 'surface_record', entityId: req.params.id, actor: req.user, beforeValues: before.rows[0], afterValues: after.rows[0], batchNumber: after.rows[0].lot_number, dateOfBatch: after.rows[0].sample_date });
    await client.query('COMMIT');
    res.json({ success: true, recordId: req.params.id, message: 'Surface record restored' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

module.exports = router;
