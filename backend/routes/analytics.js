const router = require('express').Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { normalizeKey, cleanDisplayValue, getLogicalLocation, isFingertipLocation } = require('../lib/normalize');

// ─── Build filters with ISO-class-aware hit_details filtering ─────────────────
// When iso_class filter is active, it filters at the hit_details level (not record level).
// This ensures Filling + ISO 7 shows gown/sleeve measurements, not entire records.
function buildFilters(query) {
  // Always exclude soft-deleted records from all analytics queries
  const conditions = ['r.deleted_at IS NULL'];
  const params = [];
  let idx = 1;

  // Date range filters use date_of_batch — the actual date of the excursion event
  if (query.date_from)      { conditions.push(`r.date_of_batch >= $${idx++}`);       params.push(query.date_from); }
  if (query.date_to)        { conditions.push(`r.date_of_batch <= $${idx++}`);       params.push(query.date_to); }
  if (query.person)         { conditions.push(`r.name ILIKE $${idx++}`);        params.push(`%${query.person}%`); }
  if (query.lot_number)     { conditions.push(`r.lot_number ILIKE $${idx++}`);  params.push(`%${query.lot_number}%`); }
  if (query.personnel_type) { conditions.push(`r.personnel_type = $${idx++}`);  params.push(query.personnel_type); }
  if (query.location)       {
    conditions.push(`EXISTS(SELECT 1 FROM hit_details hd_loc WHERE hd_loc.record_id=r.id AND hd_loc.location=$${idx++} AND hd_loc.hit_value>0)`);
    params.push(query.location);
  }

  // ISO class filter: filter at hit_details level, NOT record level.
  // - EXISTS ensures records with at least one matching hit_detail are included.
  // - isoFilter is added to JOINs so aggregation (SUM/COUNT) only uses matching hit_details.
  let isoFilter = '';
  let isoParamIdx = null;
  if (query.iso_class) {
    isoParamIdx = idx;
    conditions.push(`EXISTS(SELECT 1 FROM hit_details hd_iso WHERE hd_iso.record_id = r.id AND hd_iso.iso_class = $${idx})`);
    isoFilter = ` AND hd.iso_class = $${idx}`;
    params.push(query.iso_class);
    idx++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  return { where, isoFilter, params, nextIdx: idx, isoClass: query.iso_class || null };
}

// GET /api/analytics/kpi
router.get('/kpi', authMiddleware, async (req, res) => {
  try {
    const { where, isoFilter, params } = buildFilters(req.query);
    const sql = `
      SELECT
        COALESCE(SUM(hd.hit_value),0)::int                                          AS total_hits,
        COALESCE(SUM(CASE WHEN hd.iso_class='ISO 5' THEN hd.hit_value ELSE 0 END),0)::int AS iso5_hits,
        COALESCE(SUM(CASE WHEN hd.iso_class='ISO 7' THEN hd.hit_value ELSE 0 END),0)::int AS iso7_hits,
        COUNT(DISTINCT r.id)::int                                                   AS total_records,
        COUNT(DISTINCT COALESCE(r.name_key, LOWER(TRIM(r.name))))::int              AS unique_persons,
        COUNT(DISTINCT COALESCE(r.lot_number_key, LOWER(TRIM(r.lot_number))) || '_' || r.date_of_batch)::int  AS batches_tracked,
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
      LEFT JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
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
// Returns per-date data including average hits per processed batch (Two-Stage Aggregation)
router.get('/trends', authMiddleware, async (req, res) => {
  try {
    const { where, isoFilter, params, isoClass } = buildFilters(req.query);
    const sql = `
      WITH normalized_records AS (
        SELECT
          COALESCE(r.lot_number_key, LOWER(TRIM(r.lot_number))) AS canonical_batch_identity,
          r.date_of_batch,
          r.personnel_id,
          hd.iso_class,
          SUM(hd.hit_value) AS total_hits
        FROM records r
        LEFT JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
        ${where}
        GROUP BY COALESCE(r.lot_number_key, LOWER(TRIM(r.lot_number))), r.date_of_batch, r.personnel_id, hd.iso_class
      ),
      batch_totals AS (
        SELECT
          canonical_batch_identity,
          date_of_batch,
          iso_class,
          SUM(total_hits) AS batch_hits,
          COUNT(*) AS personnel_record_count,
          COUNT(DISTINCT personnel_id) AS distinct_personnel_count
        FROM normalized_records
        GROUP BY canonical_batch_identity, date_of_batch, iso_class
      )
      SELECT
        date_of_batch AS date,
        COALESCE(SUM(batch_hits), 0)::int AS hits,
        COALESCE(SUM(CASE WHEN iso_class='ISO 5' THEN batch_hits ELSE 0 END), 0)::int AS iso5,
        COALESCE(SUM(CASE WHEN iso_class='ISO 7' THEN batch_hits ELSE 0 END), 0)::int AS iso7,
        COUNT(DISTINCT canonical_batch_identity)::int AS processed_batch_count,
        CASE
          WHEN COUNT(DISTINCT canonical_batch_identity) > 0 
          THEN ROUND((SUM(batch_hits)::numeric / COUNT(DISTINCT canonical_batch_identity)), 2)
          ELSE 0 
        END AS average_hits_per_batch
      FROM batch_totals
      GROUP BY date_of_batch
      ORDER BY date_of_batch ASC
    `;
    const result = await pool.query(sql, params);
    
    const mapped = result.rows.map(r => ({
      date: r.date?.toISOString?.()?.slice(0,10) ?? r.date,
      hits: r.hits,
      iso5: isoClass === 'ISO 7' ? 0 : r.iso5,
      iso7: isoClass === 'ISO 5' ? 0 : r.iso7,
      records: 0, // Not meaningful at this level, but kept for type compatibility
      processed_batch_count: r.processed_batch_count,
      average_hits_per_batch: parseFloat(r.average_hits_per_batch)
    }));

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/batch-distribution
// Returns scatter plot data: distinct batch points per date
router.get('/batch-distribution', authMiddleware, async (req, res) => {
  try {
    const { where, isoFilter, params, isoClass } = buildFilters(req.query);
    const sql = `
      WITH normalized_records AS (
        SELECT
          COALESCE(r.lot_number_key, LOWER(TRIM(r.lot_number))) AS canonical_batch_identity,
          MIN(r.lot_number) AS display_lot,
          r.date_of_batch,
          r.personnel_id,
          hd.iso_class,
          SUM(hd.hit_value) AS total_hits
        FROM records r
        LEFT JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
        ${where}
        GROUP BY COALESCE(r.lot_number_key, LOWER(TRIM(r.lot_number))), r.date_of_batch, r.personnel_id, hd.iso_class
      )
      SELECT
        canonical_batch_identity AS batch_id,
        MIN(display_lot) AS batch_number,
        date_of_batch,
        iso_class,
        SUM(total_hits)::int AS batch_hits,
        COUNT(*)::int AS personnel_record_count,
        COUNT(DISTINCT personnel_id)::int AS distinct_personnel_count
      FROM normalized_records
      GROUP BY canonical_batch_identity, date_of_batch, iso_class
      ORDER BY date_of_batch ASC, batch_hits DESC
    `;
    const result = await pool.query(sql, params);
    
    res.json(result.rows.map(r => ({
      ...r,
      date_of_batch: r.date_of_batch?.toISOString?.()?.slice(0,10) ?? r.date_of_batch
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/trends-by-lot
router.get('/trends-by-lot', authMiddleware, async (req, res) => {
  try {
    const { where, isoFilter, params } = buildFilters(req.query);
    const sql = `
      SELECT
        r.date_of_batch AS date,
        r.lot_number,
        COALESCE(SUM(hd.hit_value),0)::int AS hits
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
      ${where}
      GROUP BY r.date_of_batch, r.lot_number
      ORDER BY r.date_of_batch ASC, r.lot_number
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows.map(r => ({ ...r, date: r.date?.toISOString?.()?.slice(0,10) ?? r.date })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});


// GET /api/analytics/by-person — NO LIMIT, grouped by canonical name_key
// ISO filter applied at hit_details level so only matching measurements are counted
router.get('/by-person', authMiddleware, async (req, res) => {
  try {
    const { where, isoFilter, params } = buildFilters(req.query);
    const sql = `
      SELECT
        COALESCE(r.name_key, LOWER(TRIM(r.name))) AS name_key,
        MIN(r.name) AS name,
        MIN(r.personnel_type) AS personnel_type,
        COALESCE(SUM(hd.hit_value),0)::int AS hits,
        COUNT(DISTINCT r.id)::int AS records,
        COALESCE(SUM(CASE WHEN hd.iso_class='ISO 5' THEN hd.hit_value ELSE 0 END),0)::int AS iso5,
        COALESCE(SUM(CASE WHEN hd.iso_class='ISO 7' THEN hd.hit_value ELSE 0 END),0)::int AS iso7
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
      ${where}
      GROUP BY COALESCE(r.name_key, LOWER(TRIM(r.name)))
      ORDER BY hits DESC
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/by-location — with ISO class and logical location grouping
// ISO filter applied at hit_details level
router.get('/by-location', authMiddleware, async (req, res) => {
  try {
    const { where, isoFilter, params } = buildFilters(req.query);
    const sql = `
      SELECT
        hd.location,
        hd.iso_class,
        SUM(hd.hit_value)::int AS hits
      FROM records r
      JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
      ${where}
      GROUP BY hd.location, hd.iso_class
      ORDER BY hits DESC
    `;
    const result = await pool.query(sql, params);

    // Group by (logical_location, iso_class) on the server
    const groupMap = new Map();
    for (const row of result.rows) {
      const logical = getLogicalLocation(row.location);
      const key = `${logical}||${row.iso_class}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          logical_location: logical,
          iso_class: row.iso_class,
          display_label: `${logical} — ${row.iso_class}`,
          hits: 0,
          raw_locations: [],
        });
      }
      const entry = groupMap.get(key);
      entry.hits += row.hits;
      entry.raw_locations.push({ location: row.location, hits: row.hits });
    }

    const grouped = [...groupMap.values()];
    const total = grouped.reduce((s, r) => s + r.hits, 0) || 1;
    res.json(grouped.map(r => ({
      ...r,
      percentage: (r.hits / total * 100),
      // Keep backward-compatible `location` field
      location: r.display_label,
    })));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/by-lot — NO LIMIT, grouped by canonical lot_number_key
router.get('/by-lot', authMiddleware, async (req, res) => {
  try {
    const { where, isoFilter, params } = buildFilters(req.query);
    const sql = `
      SELECT
        COALESCE(r.lot_number_key, LOWER(TRIM(r.lot_number))) AS lot_number_key,
        MIN(r.lot_number) AS lot_number,
        COALESCE(SUM(hd.hit_value),0)::int AS hits,
        COUNT(DISTINCT r.id)::int AS records
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
      ${where}
      GROUP BY COALESCE(r.lot_number_key, LOWER(TRIM(r.lot_number)))
      ORDER BY hits DESC
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
    const { where, isoFilter, params } = buildFilters(req.query);
    const sql = `
      SELECT
        hd.iso_class,
        COALESCE(SUM(hd.hit_value),0)::int AS hits
      FROM records r
      LEFT JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
      ${where}
      GROUP BY hd.iso_class
      ORDER BY hd.iso_class
    `;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/persons — deduplicated by canonical key
router.get('/persons', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(name_key, LOWER(TRIM(name))) AS name_key,
        MIN(name) AS name
      FROM records
      WHERE deleted_at IS NULL
      GROUP BY COALESCE(name_key, LOWER(TRIM(name)))
      ORDER BY name
    `);
    res.json(result.rows.map(r => r.name));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/lots — deduplicated by canonical key
router.get('/lots', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(lot_number_key, LOWER(TRIM(lot_number))) AS lot_number_key,
        MIN(lot_number) AS lot_number
      FROM records
      WHERE deleted_at IS NULL
      GROUP BY COALESCE(lot_number_key, LOWER(TRIM(lot_number)))
      ORDER BY lot_number
    `);
    res.json(result.rows.map(r => r.lot_number));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/analytics/drill-down — paginated, filtered, lazy-loaded
// ISO class filter applied at hit_details level
router.get('/drill-down', authMiddleware, async (req, res) => {
  try {
    const { type, key, date_from, date_to, iso_class, personnel_type } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    // Always exclude soft-deleted records
    const conditions = ['r.deleted_at IS NULL'];
    const params = [];
    let idx = 1;

    if (date_from) { conditions.push(`r.date_of_batch >= $${idx++}`); params.push(date_from); }
    if (date_to)   { conditions.push(`r.date_of_batch <= $${idx++}`); params.push(date_to); }
    if (personnel_type) { conditions.push(`r.personnel_type = $${idx++}`); params.push(personnel_type); }

    // ISO class filter: records must have at least one matching hit_detail
    let isoFilter = '';
    if (iso_class) {
      conditions.push(`EXISTS(SELECT 1 FROM hit_details hd_iso WHERE hd_iso.record_id = r.id AND hd_iso.iso_class = $${idx})`);
      isoFilter = ` AND hd.iso_class = $${idx}`;
      params.push(iso_class);
      idx++;
    }

    if (type === 'person' && key) {
      conditions.push(`COALESCE(r.name_key, LOWER(TRIM(r.name))) = $${idx++}`);
      params.push(normalizeKey(key));
    } else if (type === 'lot' && key) {
      conditions.push(`COALESCE(r.lot_number_key, LOWER(TRIM(r.lot_number))) = $${idx++}`);
      params.push(normalizeKey(key));
    } else if (type === 'iso' && key) {
      if (!iso_class) {
        conditions.push(`EXISTS(SELECT 1 FROM hit_details hd_iso2 WHERE hd_iso2.record_id = r.id AND hd_iso2.iso_class = $${idx})`);
        isoFilter = ` AND hd.iso_class = $${idx}`;
        params.push(key);
        idx++;
      }
    } else if (type === 'date' && key) {
      conditions.push(`r.date_of_batch = $${idx++}`);
      params.push(key);
    } else if (type === 'location' && key) {
      conditions.push(`EXISTS(
        SELECT 1 FROM hit_details hd2
        WHERE hd2.record_id = r.id AND hd2.location = $${idx++} AND hd2.hit_value > 0
      )`);
      params.push(key);
    }
    // type === 'all' → no extra filter, returns all active records in date range

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Count total matching
    const countSql = `SELECT COUNT(DISTINCT r.id)::int AS total FROM records r ${where}`;
    const countRes = await pool.query(countSql, params);

    // Fetch page — hit_details filtered by ISO class if active
    const dataSql = `
      SELECT
        r.*,
        u.name AS user_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', hd.id, 'location', hd.location, 'iso_class', hd.iso_class,
              'hit_value', hd.hit_value, 'alert_level', hd.alert_level, 'action_level', hd.action_level
            ) ORDER BY hd.location
          ) FILTER (WHERE hd.id IS NOT NULL), '[]'
        ) AS hit_details,
        COALESCE(SUM(hd.hit_value), 0)::int AS total_hits
      FROM records r
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN hit_details hd ON hd.record_id = r.id${isoFilter}
      ${where}
      GROUP BY r.id, u.name
      ORDER BY r.date_of_batch DESC, r.timestamp DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(limit, offset);

    const result = await pool.query(dataSql, params);
    const records = result.rows.map(row => ({
      ...row,
      date_of_batch: row.date_of_batch
        ? (row.date_of_batch instanceof Date ? row.date_of_batch.toISOString().slice(0, 10) : String(row.date_of_batch).slice(0, 10))
        : null,
    }));

    res.json({
      records,
      total: countRes.rows[0].total,
      limit,
      offset,
      filters: {
        iso_class: iso_class || null,
        personnel_type: personnel_type || null,
        date_from: date_from || null,
        date_to: date_to || null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
