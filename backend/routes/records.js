const router = require('express').Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { normalizeKey, cleanDisplayValue } = require('../lib/normalize');
const { recordAuditEvent } = require('../lib/audit');

function buildFilters(query) {
  const conditions = ['r.deleted_at IS NULL'];
  const params = [];
  let idx = 1;
  if (query.date_from) { conditions.push('r.date_of_batch >= $' + idx++); params.push(query.date_from); }
  if (query.date_to)   { conditions.push('r.date_of_batch <= $' + idx++); params.push(query.date_to); }
  if (query.person)    { conditions.push('r.name ILIKE $' + idx++); params.push('%' + query.person + '%'); }
  if (query.lot_number){ conditions.push('r.lot_number ILIKE $' + idx++); params.push('%' + query.lot_number + '%'); }
  if (query.personnel_type) { conditions.push('r.personnel_type = $' + idx++); params.push(query.personnel_type); }
  let isoFilter = '';
  if (query.iso_class) {
    conditions.push('EXISTS(SELECT 1 FROM hit_details hd_iso WHERE hd_iso.record_id = r.id AND hd_iso.iso_class = $' + idx + ')');
    isoFilter = ' AND hd.iso_class = $' + idx;
    params.push(query.iso_class);
    idx++;
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  return { where, isoFilter, params };
}

function formatRow(row) {
  const rawDate = row.date_of_batch || row.hit_date;
  const formattedDate = rawDate
    ? (rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate).slice(0, 10))
    : null;
  return { ...row, date_of_batch: formattedDate, hit_date: undefined };
}

// GET /api/records
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { where, isoFilter, params } = buildFilters(req.query);
    const countRes = await pool.query('SELECT COUNT(*) FROM records r ' + where, params);
    const total = parseInt(countRes.rows[0].count);
    const sql = `
      SELECT r.*, u.name AS user_name,
        COALESCE(json_agg(json_build_object(
          'id', hd.id,'location', hd.location,'iso_class', hd.iso_class,
          'hit_value', hd.hit_value,'alert_level', hd.alert_level,'action_level', hd.action_level
        ) ORDER BY hd.location) FILTER (WHERE hd.id IS NOT NULL),'[]') AS hit_details,
        COALESCE(SUM(hd.hit_value),0)::int AS total_hits
      FROM records r
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
      ${where}
      GROUP BY r.id, u.name
      ORDER BY r.date_of_batch DESC, r.timestamp DESC
    `;
    const result = await pool.query(sql, params);
    res.json({ records: result.rows.map(formatRow), total });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
});

// GET /api/records/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.name AS user_name,
        COALESCE(json_agg(json_build_object(
          'id', hd.id,'location', hd.location,'iso_class', hd.iso_class,
          'hit_value', hd.hit_value,'alert_level', hd.alert_level,'action_level', hd.action_level
        ) ORDER BY hd.location) FILTER (WHERE hd.id IS NOT NULL),'[]') AS hit_details,
        COALESCE(SUM(hd.hit_value),0)::int AS total_hits
      FROM records r
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN hit_details hd ON hd.record_id = r.id
      WHERE r.id = $1 AND r.deleted_at IS NULL
      GROUP BY r.id, u.name
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Record not found' });
    res.json(formatRow(result.rows[0]));
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});

// POST /api/records
router.post('/', authMiddleware, async (req, res) => {
  const date_of_batch = req.body.date_of_batch || req.body.hit_date;
  const { name, lot_number, job_function = '', personnel_type, iso_class, alert_level, action_level, hit_details } = req.body;
  if (!name || !lot_number) return res.status(400).json({ message: 'Name and lot_number are required' });
  if (!date_of_batch) return res.status(400).json({ message: 'Date of Batch is required' });
  const nameKey = normalizeKey(name);
  const lotKey  = normalizeKey(lot_number);
  const cleanName = cleanDisplayValue(name);
  const cleanLot  = cleanDisplayValue(lot_number);
  const existing = await pool.query(
    'SELECT personnel_type FROM records WHERE COALESCE(name_key, LOWER(TRIM(name))) = $1 AND COALESCE(lot_number_key, LOWER(TRIM(lot_number))) = $2 AND deleted_at IS NULL LIMIT 1',
    [nameKey, lotKey]
  );
  if (existing.rows.length > 0 && existing.rows[0].personnel_type !== personnel_type) {
    return res.status(409).json({ message: cleanName + ' is already recorded as "' + existing.rows[0].personnel_type + '" for lot ' + cleanLot + '.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const activeHits = (hit_details || []).filter(hd => parseInt(hd.hit_value) > 0);
    const dominantIso = activeHits.length > 0 ? (activeHits.some(hd => hd.iso_class === 'ISO 5') ? 'ISO 5' : 'ISO 7') : ((hit_details || []).some(hd => hd.iso_class === 'ISO 5') ? 'ISO 5' : 'ISO 7');
    const recAlertLevel  = (hit_details && hit_details.length) ? Math.min(...hit_details.map(hd => parseInt(hd.alert_level) || 0)) : (parseInt(alert_level) || 0);
    const recActionLevel = (hit_details && hit_details.length) ? Math.max(...hit_details.map(hd => parseInt(hd.action_level) || 4)) : (parseInt(action_level) || 4);
    let dateColumnName = 'date_of_batch';
    try {
      const colCheck = await client.query('SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name IN ($2, $3) LIMIT 1', ['records', 'date_of_batch', 'hit_date']);
      if (colCheck.rows.length > 0) dateColumnName = colCheck.rows[0].column_name;
    } catch (_) {}
    const recResult = await client.query(
      'INSERT INTO records (name,lot_number,job_function,personnel_type,iso_class,alert_level,action_level,' + dateColumnName + ',created_by,name_key,lot_number_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [cleanName, cleanLot, job_function, personnel_type || 'Filling', dominantIso, recAlertLevel, recActionLevel, date_of_batch, req.user.id, nameKey, lotKey]
    );
    const record = recResult.rows[0];
    if (hit_details && hit_details.length) {
      for (const hd of hit_details) {
        await client.query('INSERT INTO hit_details (record_id,location,iso_class,hit_value,alert_level,action_level) VALUES ($1,$2,$3,$4,$5,$6)',
          [record.id, hd.location, hd.iso_class || 'ISO 7', parseInt(hd.hit_value) || 0, parseInt(hd.alert_level) || 0, parseInt(hd.action_level) || 4]);
      }
    }
    try { await client.query('INSERT INTO processed_batches (lot_number,lot_number_key,batch_date,created_by) VALUES ($1,$2,$3,$4) ON CONFLICT (lot_number_key,batch_date) DO NOTHING', [cleanLot, lotKey, date_of_batch, req.user.id]); } catch (_) {}
    try {
      const ppRes = await client.query('INSERT INTO personnel_profiles (display_name,name_key,personnel_type) VALUES ($1,$2,$3) ON CONFLICT (name_key) DO UPDATE SET updated_at=NOW() RETURNING id', [cleanName, nameKey, personnel_type || 'Filling']);
      const lpRes = await client.query('INSERT INTO lot_profiles (display_lot,lot_key) VALUES ($1,$2) ON CONFLICT (lot_key) DO UPDATE SET updated_at=NOW() RETURNING id', [cleanLot, lotKey]);
      await client.query('UPDATE records SET personnel_id=$1, lot_id=$2 WHERE id=$3', [ppRes.rows[0].id, lpRes.rows[0].id, record.id]);
    } catch (_) {}
    await recordAuditEvent({ client, actionType: 'CREATE', entityType: 'pm_record', entityId: record.id, actor: req.user, afterValues: record, personnelName: cleanName, batchNumber: cleanLot, dateOfBatch: date_of_batch });
    await client.query('COMMIT');
    res.status(201).json({ ...record, hit_details: hit_details || [] });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

// PUT /api/records/:id
router.put('/:id', authMiddleware, requireRole('admin', 'manager', 'user'), async (req, res) => {
  const { name, lot_number, job_function, personnel_type, iso_class, alert_level, action_level } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nameKey = normalizeKey(name); const lotKey = normalizeKey(lot_number);
    const cleanName = cleanDisplayValue(name); const cleanLot = cleanDisplayValue(lot_number);
    const before = await client.query('SELECT * FROM records WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Record not found' }); }
    const result = await client.query(
      'UPDATE records SET name=$1,lot_number=$2,job_function=$3,personnel_type=$4,iso_class=$5,alert_level=$6,action_level=$7,name_key=$8,lot_number_key=$9 WHERE id=$10 RETURNING *',
      [cleanName, cleanLot, job_function, personnel_type, iso_class, alert_level, action_level, nameKey, lotKey, req.params.id]
    );
    const afterValues = result.rows[0];
    const changedFields = Object.keys(afterValues).filter(k => JSON.stringify(before.rows[0][k]) !== JSON.stringify(afterValues[k]));
    await recordAuditEvent({ client, actionType: 'UPDATE', entityType: 'pm_record', entityId: req.params.id, actor: req.user, beforeValues: before.rows[0], afterValues, changedFields, personnelName: cleanName, batchNumber: cleanLot, dateOfBatch: afterValues.date_of_batch });
    await client.query('COMMIT');
    res.json(afterValues);
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

// DELETE /api/records/:id — soft delete
router.delete('/:id', authMiddleware, requireRole('admin', 'manager', 'user'), async (req, res) => {
  const reason = ((req.body && req.body.reason) || '').trim();
  if (!reason || reason.length < 3) return res.status(400).json({ message: 'A deletion reason of at least 3 characters is required.' });
  if (reason.length > 500) return res.status(400).json({ message: 'Deletion reason must not exceed 500 characters.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(`
      SELECT r.*, COALESCE(json_agg(json_build_object('id',hd.id,'location',hd.location,'iso_class',hd.iso_class,'hit_value',hd.hit_value) ORDER BY hd.location) FILTER (WHERE hd.id IS NOT NULL),'[]') AS hit_details
      FROM records r LEFT JOIN hit_details hd ON hd.record_id = r.id WHERE r.id = $1 AND r.deleted_at IS NULL GROUP BY r.id
    `, [req.params.id]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Record not found or already deleted.' }); }
    const bv = before.rows[0];
    await recordAuditEvent({ client, actionType: 'DELETE', entityType: 'pm_record', entityId: req.params.id, actor: req.user, beforeValues: bv, afterValues: { deleted_at: new Date().toISOString(), deleted_by: req.user.id, deletion_reason: reason }, reason, personnelName: bv.name, batchNumber: bv.lot_number, dateOfBatch: bv.date_of_batch });
    await client.query('UPDATE records SET deleted_at=NOW(), deleted_by=$1, deletion_reason=$2 WHERE id=$3', [req.user.id, reason, req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, recordId: req.params.id, deletedAt: new Date().toISOString(), message: 'Record deleted successfully' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

// POST /api/records/:id/restore — admin only
router.post('/:id/restore', authMiddleware, requireRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM records WHERE id=$1 AND deleted_at IS NOT NULL', [req.params.id]);
    if (!before.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Deleted record not found.' }); }
    await client.query('UPDATE records SET deleted_at=NULL, deleted_by=NULL, deletion_reason=NULL WHERE id=$1', [req.params.id]);
    const after = await client.query('SELECT * FROM records WHERE id=$1', [req.params.id]);
    const av = after.rows[0];
    await recordAuditEvent({ client, actionType: 'RESTORE', entityType: 'pm_record', entityId: req.params.id, actor: req.user, beforeValues: before.rows[0], afterValues: av, personnelName: av.name, batchNumber: av.lot_number, dateOfBatch: av.date_of_batch });
    await client.query('COMMIT');
    res.json({ success: true, recordId: req.params.id, message: 'Record restored successfully' });
  } catch (err) { await client.query('ROLLBACK'); console.error(err); res.status(500).json({ message: 'Server error' }); }
  finally { client.release(); }
});

module.exports = router;