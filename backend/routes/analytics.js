const router = require('express').Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

function buildFilters(query) {
  const conditions = [];
  const params = [];
  let idx = 1;
  // Date range filters use hit_date — the actual date of the excursion event
  if (query.date_from)     { conditions.push(`r.hit_date >= $${idx++}`);          params.push(query.date_from); }
  if (query.date_to)       { conditions.push(`r.hit_date <= $${idx++}`);          params.push(query.date_to); }
  if (query.person)        { conditions.push(`r.name ILIKE $${idx++}`);           params.push(`%${query.person}%`); }
  if (query.lot_number)    { conditions.push(`r.lot_number ILIKE $${idx++}`);    params.push(`%${query.lot_number}%`); }
  if (query.iso_class)     { conditions.push(`r.iso_class = $${idx++}`);          params.push(query.iso_class); }
  if (query.personnel_type){ conditions.push(`r.personnel_type = $${idx++}`);    params.push(query.personnel_type); }
  if (query.location)      { conditions.push(`EXISTS(SELECT 1 FROM hit_details hd WHERE hd.record_id=r.id AND hd.location=$${idx++} AND hd.hit_value>0)`); params.push(query.location); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

// GET /api/analytics/kpi
router.get('/kpi', authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const sql = `
      SELECT
        COALESCE(SUM(hd.hit_value),0)::int                                          AS total_hits,
        COALESCE(SUM(CASE WHEN hd.iso_class='ISO 5' THEN hd.hit_value ELSE 0 END),0)::int AS iso5_hits,
        COALESCE(SUM(CASE WHEN hd.iso_class='ISO 7' THEN hd.hit_value ELSE 0 END),0)::int AS iso7_hits,
        COUNT(DISTINCT r.id)::int                                                   AS total_records,
        COUNT(DISTINCT r.name)::int                                                 AS unique_persons,
        COUNT(DISTINCT r.lot_number)::int                                           AS unique_lots,
        COUNT(DISTINCT CASE
          WHEN EXISTS(
            SELECT 1 FROM hit_details hd2
            WHERE hd2.record_id = r.id
              AND hd2.hit_value > 0
              AND hd2.hit_value >= hd2.alert_level
              AND hd2.hit_value < hd2.action_level
          ) THEN r.id END)::int                                                     AS alert_count,
        COUNT(DISTINCT CASE
          WHEN EXISTS(
            SELECT 1 FROM hit_details hd2
            WHERE hd2.record_id = r.id
              AND hd2.hit_value >= hd2.action_level
          ) THEN r.id END)::int                                                     AS action_count
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id
      ${where}
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});


// GET /api/analytics/trends
router.get('/trends', authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const sql = `
      SELECT
        r.hit_date AS date,
        COALESCE(SUM(hd.hit_value),0)::int AS hits,
        COALESCE(SUM(CASE WHEN hd.iso_class='ISO 5' THEN hd.hit_value ELSE 0 END),0)::int AS iso5,
        COALESCE(SUM(CASE WHEN hd.iso_class='ISO 7' THEN hd.hit_value ELSE 0 END),0)::int AS iso7,
        COUNT(DISTINCT r.id)::int AS records
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id
      ${where}
      GROUP BY r.hit_date
      ORDER BY r.hit_date ASC
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows.map(r => ({ ...r, date: r.date?.toISOString?.()?.slice(0,10) ?? r.date })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/trends-by-lot
// Returns rows of { date, lot_number, hits } — one row per (date, lot) combination.
// The frontend pivots this into a per-lot line series for the chart.
router.get('/trends-by-lot', authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const sql = `
      SELECT
        r.hit_date AS date,
        r.lot_number,
        COALESCE(SUM(hd.hit_value),0)::int AS hits
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id
      ${where}
      GROUP BY r.hit_date, r.lot_number
      ORDER BY r.hit_date ASC, r.lot_number
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows.map(r => ({ ...r, date: r.date?.toISOString?.()?.slice(0,10) ?? r.date })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// GET /api/analytics/by-person
router.get('/by-person', authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const sql = `
      SELECT
        r.name,
        COALESCE(SUM(hd.hit_value),0)::int AS hits,
        COUNT(DISTINCT r.id)::int AS records,
        COALESCE(SUM(CASE WHEN r.iso_class='ISO 5' THEN hd.hit_value ELSE 0 END),0)::int AS iso5,
        COALESCE(SUM(CASE WHEN r.iso_class='ISO 7' THEN hd.hit_value ELSE 0 END),0)::int AS iso7
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id
      ${where}
      GROUP BY r.name
      ORDER BY hits DESC
      LIMIT 20
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/by-location
router.get('/by-location', authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const sql = `
      SELECT
        hd.location,
        SUM(hd.hit_value)::int AS hits
      FROM records r
      JOIN hit_details hd ON hd.record_id = r.id
      ${where}
      GROUP BY hd.location
      ORDER BY hits DESC
    `;
    const result = await pool.query(sql, params);
    const total = result.rows.reduce((s, r) => s + r.hits, 0) || 1;
    res.json(result.rows.map(r => ({ ...r, percentage: (r.hits / total * 100) })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/by-lot
router.get('/by-lot', authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const sql = `
      SELECT
        r.lot_number,
        COALESCE(SUM(hd.hit_value),0)::int AS hits,
        COUNT(DISTINCT r.id)::int AS records
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id
      ${where}
      GROUP BY r.lot_number
      ORDER BY hits DESC
      LIMIT 20
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/by-iso
router.get('/by-iso', authMiddleware, async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);
    const sql = `
      SELECT
        r.iso_class,
        COALESCE(SUM(hd.hit_value),0)::int AS hits
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id
      ${where}
      GROUP BY r.iso_class
      ORDER BY r.iso_class
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/persons
router.get('/persons', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT name FROM records ORDER BY name');
    res.json(result.rows.map(r => r.name));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/lots
router.get('/lots', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT lot_number FROM records ORDER BY lot_number');
    res.json(result.rows.map(r => r.lot_number));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
