const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { recordAuditEvent } = require('../lib/audit');

pool.query('CREATE TABLE IF NOT EXISTS surface_sampling (id SERIAL PRIMARY KEY, sample_location TEXT NOT NULL, lot_number TEXT NOT NULL, sample_date DATE NOT NULL, iso_class TEXT NOT NULL DEFAULT $ISO 7$, cfu_found SMALLINT NOT NULL DEFAULT 0, organism_id TEXT, deviation_number TEXT, notes TEXT, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'.replace(/\$ISO 7\$/g, "'ISO 7'")).catch(console.error);

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT ss.*, u.name AS created_by_name FROM surface_sampling ss LEFT JOIN users u ON u.id = ss.created_by WHERE ss.deleted_at IS NULL ORDER BY ss.sample_date DESC, ss.created_at DESC');
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', authMiddleware, async (req, res) => {
  const { sample_location, lot_number, sample_date, iso_class, cfu_found, organism_id, deviation_number, notes } = req.body;
  if (!sample_location || !lot_number || !sample_date) return res.status(400).json({ message: 'sample_location, lot_number and sample_date are required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO surface_sampling (sample_location,lot_number,sample_date,iso_class,cfu_found,organism_id,deviation_number,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [sample_location, lot_number, sample_date, iso_class || 'ISO 7', parseInt(cfu_found) || 0, organism_id || null, deviation_number || null, notes || null, req.user.id]
    );
    const record = result.rows[0];
    await recordAuditEvent({ client, actionType: 'CREATE', entityType: 'surface_record', entityId: record.id, actor: req.user, afterValues: record, batchNumber: lot_number, dateOfBatch: sample_date });
    await client.query('COMMIT'); res.status(201).json(record);
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { sample_location, lot_number, sample_date, iso_class, cfu_found, organism_id, deviation_number, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM surface_sampling WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!before.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Not found' }); }
    const result = await client.query(
      'UPDATE surface_sampling SET sample_location=$1,lot_number=$2,sample_date=$3,iso_class=$4,cfu_found=$5,organism_id=$6,deviation_number=$7,notes=$8 WHERE id=$9 RETURNING *',
      [sample_location, lot_number, sample_date, iso_class || 'ISO 7', parseInt(cfu_found) || 0, organism_id || null, deviation_number || null, notes || null, req.params.id]
    );
    const afterValues = result.rows[0];
    const changedFields = Object.keys(afterValues).filter(k => JSON.stringify(before.rows[0][k]) !== JSON.stringify(afterValues[k]));
    await recordAuditEvent({ client, actionType: 'UPDATE', entityType: 'surface_record', entityId: req.params.id, actor: req.user, beforeValues: before.rows[0], afterValues, changedFields, batchNumber: lot_number, dateOfBatch: sample_date });
    await client.query('COMMIT'); res.json(afterValues);
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

router.delete('/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
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
