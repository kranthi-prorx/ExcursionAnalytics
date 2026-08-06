const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { normalizeKey, cleanDisplayValue } = require('../lib/normalize');
const { recordAuditEvent } = require('../lib/audit');

pool.query('CREATE TABLE IF NOT EXISTS processed_batches (id SERIAL PRIMARY KEY, lot_number TEXT NOT NULL, lot_number_key TEXT NOT NULL, batch_date DATE NOT NULL, room_area TEXT, notes TEXT, created_by UUID REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())')
  .then(() => pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_processed_batch_lot_date'
      ) THEN
        ALTER TABLE processed_batches ADD CONSTRAINT uq_processed_batch_lot_date UNIQUE (lot_number_key, batch_date);
      END IF;
    END $$;
  `))
  .catch(console.error);

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT pb.*, u.name AS created_by_name FROM processed_batches pb LEFT JOIN users u ON u.id = pb.created_by WHERE pb.deleted_at IS NULL ORDER BY pb.batch_date DESC, pb.created_at DESC');
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

router.post('/', authMiddleware, async (req, res) => {
  const { lot_number, batch_date, room_area, notes } = req.body;
  if (!lot_number || !batch_date) return res.status(400).json({ message: 'lot_number and batch_date are required' });
  const lotKey = normalizeKey(lot_number);
  const cleanLot = cleanDisplayValue(lot_number);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'INSERT INTO processed_batches (lot_number,lot_number_key,batch_date,room_area,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (lot_number_key,batch_date) DO NOTHING RETURNING *',
      [cleanLot, lotKey, batch_date, room_area || null, notes || null, req.user.id]
    );
    if (result.rows.length === 0) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'A batch with this lot number and date already exists.' }); }
    const record = result.rows[0];
    await recordAuditEvent({ client, actionType: 'CREATE', entityType: 'processed_batch', entityId: record.id, actor: req.user, afterValues: record, batchNumber: cleanLot, dateOfBatch: batch_date });
    await client.query('COMMIT'); res.status(201).json(record);
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
    const before = await client.query('SELECT * FROM processed_batches WHERE id=$1 AND deleted_at IS NULL', [req.params.id]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Batch not found or already deleted.' }); }
    const bv = before.rows[0];
    await recordAuditEvent({ client, actionType: 'DELETE', entityType: 'processed_batch', entityId: req.params.id, actor: req.user, beforeValues: bv, afterValues: { deleted_at: new Date().toISOString(), deleted_by: req.user.id, deletion_reason: reason }, reason, batchNumber: bv.lot_number, dateOfBatch: bv.batch_date });
    await client.query('UPDATE processed_batches SET deleted_at=NOW(), deleted_by=$1, deletion_reason=$2 WHERE id=$3', [req.user.id, reason, req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, recordId: req.params.id, deletedAt: new Date().toISOString(), message: 'Batch deleted' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

module.exports = router;
