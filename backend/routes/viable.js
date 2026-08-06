const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { normalizeKey, cleanDisplayValue } = require('../lib/normalize');
const { recordAuditEvent } = require('../lib/audit');

function enforceCfu(iso_class, iso5_cfu, iso7_cfu, iso8_cfu) {
  const v5 = parseInt(iso5_cfu) || 0, v7 = parseInt(iso7_cfu) || 0, v8 = parseInt(iso8_cfu) || 0;
  if (iso_class === 'ISO 5') return { iso5_cfu: v5, iso7_cfu: 0, iso8_cfu: 0 };
  if (iso_class === 'ISO 7') return { iso5_cfu: 0, iso7_cfu: v7, iso8_cfu: 0 };
  if (iso_class === 'ISO 8') return { iso5_cfu: 0, iso7_cfu: 0, iso8_cfu: v8 };
  return { iso5_cfu: v5, iso7_cfu: v7, iso8_cfu: v8 };
}

pool.query('CREATE TABLE IF NOT EXISTS viable_data (id SERIAL PRIMARY KEY, lot_number TEXT NOT NULL, lot_number_key TEXT, sample_date DATE NOT NULL, iso_class TEXT NOT NULL DEFAULT $ISO 7$, room_number TEXT, iso5_cfu SMALLINT NOT NULL DEFAULT 0, iso7_cfu SMALLINT NOT NULL DEFAULT 0, iso8_cfu SMALLINT NOT NULL DEFAULT 0, particle_05um NUMERIC(12,2) NOT NULL DEFAULT 0, particle_50um NUMERIC(12,2) NOT NULL DEFAULT 0, deviation_number TEXT, notes TEXT, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())'.replace(/\$ISO 7\$/g, "'ISO 7'")).catch(console.error);

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT vd.*, u.name as created_by_name FROM viable_data vd LEFT JOIN users u ON u.id = vd.created_by WHERE vd.deleted_at IS NULL ORDER BY vd.sample_date DESC, vd.created_at DESC');
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.get('/by-lot', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT COALESCE(lot_number_key, LOWER(TRIM(lot_number))) AS lot_key, MIN(lot_number) AS lot_number, SUM(iso5_cfu)::int AS iso5_total, SUM(iso7_cfu)::int AS iso7_total, SUM(iso8_cfu)::int AS iso8_total, ROUND(AVG(particle_05um),2) AS avg_05um, ROUND(AVG(particle_50um),2) AS avg_50um, COUNT(*)::int AS sample_count FROM viable_data WHERE deleted_at IS NULL GROUP BY COALESCE(lot_number_key, LOWER(TRIM(lot_number))) ORDER BY MIN(sample_date) DESC');
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', authMiddleware, async (req, res) => {
  const { lot_number, sample_date, iso_class, room_number, iso5_cfu, iso7_cfu, iso8_cfu, particle_05um, particle_50um, deviation_number, notes } = req.body;
  if (!lot_number || !sample_date) return res.status(400).json({ message: 'lot_number and sample_date are required' });
  const cfus = enforceCfu(iso_class, iso5_cfu, iso7_cfu, iso8_cfu);
  const lotKey = normalizeKey(lot_number);
  const cleanLot = cleanDisplayValue(lot_number);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO viable_data (lot_number,lot_number_key,sample_date,iso_class,room_number,iso5_cfu,iso7_cfu,iso8_cfu,particle_05um,particle_50um,deviation_number,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
      [cleanLot, lotKey, sample_date, iso_class || 'ISO 7', room_number || null, cfus.iso5_cfu, cfus.iso7_cfu, cfus.iso8_cfu, parseFloat(particle_05um) || 0, parseFloat(particle_50um) || 0, deviation_number || null, notes || null, req.user.id]
    );
    const record = result.rows[0];
    await recordAuditEvent({ client, actionType: 'CREATE', entityType: 'viable_record', entityId: record.id, actor: req.user, afterValues: record, batchNumber: cleanLot, dateOfBatch: sample_date });
    await client.query('COMMIT');
    res.status(201).json(record);
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const { lot_number, sample_date, iso_class, room_number, iso5_cfu, iso7_cfu, iso8_cfu, particle_05um, particle_50um, deviation_number, notes } = req.body;
  const cfus = enforceCfu(iso_class, iso5_cfu, iso7_cfu, iso8_cfu);
  const lotKey = normalizeKey(lot_number); const cleanLot = cleanDisplayValue(lot_number);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM viable_data WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!before.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Not found' }); }
    const result = await client.query(
      'UPDATE viable_data SET lot_number=$1,lot_number_key=$2,sample_date=$3,iso_class=$4,room_number=$5,iso5_cfu=$6,iso7_cfu=$7,iso8_cfu=$8,particle_05um=$9,particle_50um=$10,deviation_number=$11,notes=$12 WHERE id=$13 RETURNING *',
      [cleanLot, lotKey, sample_date, iso_class || 'ISO 7', room_number || null, cfus.iso5_cfu, cfus.iso7_cfu, cfus.iso8_cfu, parseFloat(particle_05um) || 0, parseFloat(particle_50um) || 0, deviation_number || null, notes || null, req.params.id]
    );
    const afterValues = result.rows[0];
    const changedFields = Object.keys(afterValues).filter(k => JSON.stringify(before.rows[0][k]) !== JSON.stringify(afterValues[k]));
    await recordAuditEvent({ client, actionType: 'UPDATE', entityType: 'viable_record', entityId: req.params.id, actor: req.user, beforeValues: before.rows[0], afterValues, changedFields, batchNumber: cleanLot, dateOfBatch: sample_date });
    await client.query('COMMIT'); res.json(afterValues);
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
