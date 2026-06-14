const router = require('express').Router();
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// Build WHERE clause from query params
function buildFilters(query) {
  const conditions = [];
  const params = [];
  let idx = 1;

  // Date range filters against hit_date (the date the excursion happened)
  if (query.date_from) {
    conditions.push(`r.hit_date >= $${idx++}`);
    params.push(query.date_from);
  }
  if (query.date_to) {
    conditions.push(`r.hit_date <= $${idx++}`);
    params.push(query.date_to);
  }
  if (query.person) {
    conditions.push(`r.name ILIKE $${idx++}`);
    params.push(`%${query.person}%`);
  }
  if (query.lot_number) {
    conditions.push(`r.lot_number ILIKE $${idx++}`);
    params.push(`%${query.lot_number}%`);
  }
  if (query.iso_class) {
    conditions.push(`r.iso_class = $${idx++}`);
    params.push(query.iso_class);
  }
  if (query.personnel_type) {
    conditions.push(`r.personnel_type = $${idx++}`);
    params.push(query.personnel_type);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

// Format a record row: convert PostgreSQL DATE → 'YYYY-MM-DD' plain string
function formatRow(row) {
  return {
    ...row,
    hit_date: row.hit_date
      ? (row.hit_date instanceof Date
          ? row.hit_date.toISOString().slice(0, 10)
          : String(row.hit_date).slice(0, 10))
      : null,
  };
}
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);

    const countRes = await pool.query(`SELECT COUNT(*) FROM records r ${where}`, params);
    const total = parseInt(countRes.rows[0].count);

    let sql = `
      SELECT
        r.*,
        u.name AS user_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', hd.id,
              'location', hd.location,
              'iso_class', hd.iso_class,
              'hit_value', hd.hit_value,
              'alert_level', hd.alert_level,
              'action_level', hd.action_level
            ) ORDER BY hd.location
          ) FILTER (WHERE hd.id IS NOT NULL),
          '[]'
        ) AS hit_details,
        COALESCE(SUM(hd.hit_value), 0)::int AS total_hits
      FROM records r
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN hit_details hd ON hd.record_id = r.id
      ${where}
      GROUP BY r.id, u.name
      ORDER BY r.hit_date DESC, r.timestamp DESC
    `;

    const result = await pool.query(sql, params);
    res.json({ records: result.rows.map(formatRow), total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/records/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.name AS user_name,
        COALESCE(
          json_agg(json_build_object(
            'id', hd.id, 'location', hd.location,
            'iso_class', hd.iso_class,
            'hit_value', hd.hit_value,
            'alert_level', hd.alert_level,
            'action_level', hd.action_level
          ) ORDER BY hd.location) FILTER (WHERE hd.id IS NOT NULL), '[]'
        ) AS hit_details,
        COALESCE(SUM(hd.hit_value), 0)::int AS total_hits
      FROM records r
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN hit_details hd ON hd.record_id = r.id
      WHERE r.id = $1
      GROUP BY r.id, u.name
    `, [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Record not found' });
    res.json(formatRow(result.rows[0]));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/records
router.post('/', authMiddleware, async (req, res) => {
  const { name, lot_number, job_function, personnel_type, iso_class, alert_level, action_level, hit_date, hit_details } = req.body;
  if (!name || !lot_number || !job_function) {
    return res.status(400).json({ message: 'Name, lot_number, and job_function are required' });
  }
  if (!hit_date) {
    return res.status(400).json({ message: 'hit_date is required' });
  }

  // ── Business rule: same person cannot work different ISO classes on same batch ──
  // ISO class is determined by personnel_type, so we enforce consistent personnel_type
  // per (name, lot_number) pair.
  const existing = await pool.query(
    `SELECT personnel_type FROM records WHERE name = $1 AND lot_number = $2 LIMIT 1`,
    [name, lot_number]
  );
  if (existing.rows.length > 0 && existing.rows[0].personnel_type !== personnel_type) {
    return res.status(409).json({
      message: `${name} is already recorded as "${existing.rows[0].personnel_type}" for lot ${lot_number}. ` +
               `A person cannot work in a different role (and therefore different ISO class) on the same batch.`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Derive the record-level iso_class: ISO 5 if any location is ISO 5
    const dominantIso = (hit_details || []).some(hd => hd.iso_class === 'ISO 5') ? 'ISO 5' : 'ISO 7';
    // Use the minimum alert_level and maximum action_level across all locations
    // for the record-level aggregate (or fall back to 0/4 defaults)
    const recAlertLevel = hit_details?.length
      ? Math.min(...hit_details.map(hd => parseInt(hd.alert_level) || 0))
      : parseInt(alert_level) || 0;
    const recActionLevel = hit_details?.length
      ? Math.max(...hit_details.map(hd => parseInt(hd.action_level) || 4))
      : parseInt(action_level) || 4;

    const recResult = await client.query(
      `INSERT INTO records (name, lot_number, job_function, personnel_type, iso_class, alert_level, action_level, hit_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, lot_number, job_function, personnel_type || 'Filling', dominantIso,
       recAlertLevel, recActionLevel, hit_date, req.user.id]
    );
    const record = recResult.rows[0];

    if (hit_details?.length) {
      for (const hd of hit_details) {
        await client.query(
          `INSERT INTO hit_details (record_id, location, iso_class, hit_value, alert_level, action_level)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [record.id, hd.location, hd.iso_class || 'ISO 7',
           parseInt(hd.hit_value) || 0, parseInt(hd.alert_level) || 0, parseInt(hd.action_level) || 4]
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ ...record, hit_details: hit_details || [] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// PUT /api/records/:id
router.put('/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { name, lot_number, job_function, personnel_type, iso_class, alert_level, action_level } = req.body;
  try {
    const result = await pool.query(
      `UPDATE records SET name=$1, lot_number=$2, job_function=$3, personnel_type=$4,
       iso_class=$5, alert_level=$6, action_level=$7 WHERE id=$8 RETURNING *`,
      [name, lot_number, job_function, personnel_type, iso_class, alert_level, action_level, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Record not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/records/:id
router.delete('/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM records WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
