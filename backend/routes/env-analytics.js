// ─── Environmental Analytics Route (v2) ──────────────────────────────────────
// Reads from canonical tables: viable_data + surface_sampling
// These are written by the existing Viable & Non-Viable and Surface Sampling forms.
// The old env_monitoring_sessions / env_samples tables are intentionally BYPASSED
// because the upgraded forms write directly to viable_data and surface_sampling.
//
// GET /api/env/analytics/kpi
// GET /api/env/analytics/viable-air-trend
// GET /api/env/analytics/nonviable-air-trend
// GET /api/env/analytics/surface-trend
// GET /api/env/analytics/location-trend
// GET /api/env/analytics/sessions
// GET /api/env/analytics/lots
// GET /api/env/analytics/export/csv
// GET /api/env/analytics/thresholds

'use strict';

const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware } = require('../middleware/auth');
const {
  ENV_MONITORING_THRESHOLDS,
  evaluateViableCfuStatus,
  evaluateSurfaceCfuStatus,
  evaluateParticleStatus,
  worstStatus,
} = require('../lib/thresholds');

// ─── Status derivation helpers ────────────────────────────────────────────────
// Applied in the SQL layer via CASE expressions derived from threshold constants.
// This keeps status consistent whether reading from the DB or computing fresh.

function viableStatusSQL(cfuExpr, isoExpr) {
  // Returns a CASE expression string for viable CFU status
  // Must be called with string literals or be used cautiously.
  // We inline the threshold values because they come from the backend constant.
  return `
    CASE
      WHEN ${cfuExpr} IS NULL THEN NULL
      WHEN ${isoExpr} = 'ISO 5' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 5'].action} THEN 'ACTION'
      WHEN ${isoExpr} = 'ISO 7' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 7'].action} THEN 'ACTION'
      WHEN ${isoExpr} = 'ISO 7' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 7'].alert}  THEN 'ALERT'
      WHEN ${isoExpr} = 'ISO 8' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 8'].action} THEN 'ACTION'
      WHEN ${isoExpr} = 'ISO 8' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 8'].alert}  THEN 'ALERT'
      ELSE 'NORMAL'
    END
  `;
}

function surfaceStatusSQL(cfuExpr, isoExpr) {
  return `
    CASE
      WHEN ${cfuExpr} IS NULL THEN NULL
      WHEN ${isoExpr} = 'ISO 5' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.surface['ISO 5'].action} THEN 'ACTION'
      WHEN ${isoExpr} = 'ISO 7' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.surface['ISO 7'].action} THEN 'ACTION'
      WHEN ${isoExpr} = 'ISO 7' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.surface['ISO 7'].alert}  THEN 'ALERT'
      WHEN ${isoExpr} = 'ISO 8' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.surface['ISO 8'].action} THEN 'ACTION'
      WHEN ${isoExpr} = 'ISO 8' AND ${cfuExpr} >= ${ENV_MONITORING_THRESHOLDS.surface['ISO 8'].alert}  THEN 'ALERT'
      ELSE 'NORMAL'
    END
  `;
}

// ─── Filter builder for viable_data ──────────────────────────────────────────
function buildViableFilters(query, tableAlias = 'vd', idx = 1) {
  const conditions = [`${tableAlias}.deleted_at IS NULL`];
  const params = [];

  if (query.date_from)         { conditions.push(`${tableAlias}.sample_date >= $${idx++}`); params.push(query.date_from); }
  if (query.date_to)           { conditions.push(`${tableAlias}.sample_date <= $${idx++}`); params.push(query.date_to); }
  if (query.context)           { conditions.push(`${tableAlias}.monitoring_context = $${idx++}`); params.push(query.context); }
  if (query.iso_class)         { conditions.push(`${tableAlias}.iso_class = $${idx++}`); params.push(query.iso_class); }
  if (query.sample_type)       { conditions.push(`${tableAlias}.sample_type = $${idx++}`); params.push(query.sample_type); }
  if (query.room_or_area)      { conditions.push(`COALESCE(${tableAlias}.room_number, ${tableAlias}.sample_location) ILIKE $${idx++}`); params.push(`%${query.room_or_area}%`); }
  if (query.batch_id)          { conditions.push(`${tableAlias}.lot_id = $${idx++}`); params.push(query.batch_id); }
  if (query.lot_number)        { conditions.push(`${tableAlias}.lot_number ILIKE $${idx++}`); params.push(`%${query.lot_number}%`); }
  if (query.created_by)        { conditions.push(`${tableAlias}.created_by = $${idx++}`); params.push(query.created_by); }
  if (query.location_profile_id) { conditions.push(`${tableAlias}.location_profile_id = $${idx++}`); params.push(query.location_profile_id); }

  return { conditions, params, nextIdx: idx };
}

// ─── Filter builder for surface_sampling ─────────────────────────────────────
function buildSurfaceFilters(query, tableAlias = 'ss', idx = 1) {
  const conditions = [`${tableAlias}.deleted_at IS NULL`];
  const params = [];

  if (query.date_from)         { conditions.push(`${tableAlias}.sample_date >= $${idx++}`); params.push(query.date_from); }
  if (query.date_to)           { conditions.push(`${tableAlias}.sample_date <= $${idx++}`); params.push(query.date_to); }
  if (query.context)           { conditions.push(`${tableAlias}.monitoring_context = $${idx++}`); params.push(query.context); }
  if (query.iso_class)         { conditions.push(`${tableAlias}.iso_class = $${idx++}`); params.push(query.iso_class); }
  if (query.room_or_area)      { conditions.push(`COALESCE(${tableAlias}.room_area, ${tableAlias}.sample_location) ILIKE $${idx++}`); params.push(`%${query.room_or_area}%`); }
  if (query.batch_id)          { conditions.push(`${tableAlias}.lot_id = $${idx++}`); params.push(query.batch_id); }
  if (query.lot_number)        { conditions.push(`${tableAlias}.lot_number ILIKE $${idx++}`); params.push(`%${query.lot_number}%`); }
  if (query.created_by)        { conditions.push(`${tableAlias}.created_by = $${idx++}`); params.push(query.created_by); }
  if (query.location_profile_id) { conditions.push(`${tableAlias}.location_profile_id = $${idx++}`); params.push(query.location_profile_id); }

  return { conditions, params, nextIdx: idx };
}

// ─── Session grouping key helpers ─────────────────────────────────────────────
// A "session" is a distinct monitoring event derived from grouping fields.
//
// viable_data HAS lot_number_key (from M-13 migration)
// surface_sampling does NOT have lot_number_key — use LOWER(TRIM(COALESCE(lot_number,'')))

const VIABLE_SESSION_KEY = `
  vd.monitoring_context
  || '|' || vd.sample_date::text
  || '|' || COALESCE(vd.lot_number_key, LOWER(TRIM(COALESCE(vd.lot_number, ''))))
  || '|' || COALESCE(vd.room_number, '')
`;

const SURFACE_SESSION_KEY = `
  ss.monitoring_context
  || '|' || ss.sample_date::text
  || '|' || LOWER(TRIM(COALESCE(ss.lot_number, '')))
  || '|' || COALESCE(ss.room_area, ss.sample_location, '')
`;

// For the KPI query we need un-aliased versions (no table prefix, used in subqueries)
const VIABLE_SESSION_KEY_RAW = `
  monitoring_context
  || '|' || sample_date::text
  || '|' || COALESCE(lot_number_key, LOWER(TRIM(COALESCE(lot_number, ''))))
  || '|' || COALESCE(room_number, '')
`;

const SURFACE_SESSION_KEY_RAW = `
  monitoring_context
  || '|' || sample_date::text
  || '|' || LOWER(TRIM(COALESCE(lot_number, '')))
  || '|' || COALESCE(room_area, sample_location, '')
`;

// ─── GET /kpi ─────────────────────────────────────────────────────────────────
// Accepts tab_type=VIABLE_AIR|NONVIABLE_AIR|SURFACE to scope KPI to the active tab.
// Without tab_type: returns totals across all types (legacy compat).
router.get('/kpi', authMiddleware, async (req, res) => {
  try {
    const { tab_type } = req.query;

    // ── VIABLE_AIR tab ────────────────────────────────────────────────────────
    if (tab_type === 'VIABLE_AIR') {
      const filters = { ...req.query, sample_type: 'VIABLE_AIR' };
      const vf = buildViableFilters(filters, 'vd', 1);
      const cfuExpr = `CASE WHEN vd.iso_class='ISO 5' THEN vd.iso5_cfu WHEN vd.iso_class='ISO 7' THEN vd.iso7_cfu WHEN vd.iso_class='ISO 8' THEN vd.iso8_cfu ELSE NULL END`;
      const sql = `
        SELECT
          COUNT(DISTINCT ${VIABLE_SESSION_KEY})::int AS total_sessions,
          COUNT(*)::int AS total_samples,
          COUNT(CASE WHEN ${viableStatusSQL(cfuExpr, 'vd.iso_class')} = 'ALERT'  THEN 1 END)::int AS alert_count,
          COUNT(CASE WHEN ${viableStatusSQL(cfuExpr, 'vd.iso_class')} = 'ACTION' THEN 1 END)::int AS action_count
        FROM viable_data vd
        WHERE ${vf.conditions.join(' AND ')}
      `;
      const r = (await pool.query(sql, vf.params)).rows[0];
      return res.json({
        total_sessions:     r.total_sessions || 0,
        complete_sessions:  r.total_sessions || 0,
        incomplete_sessions: 0,
        total_samples:      r.total_samples  || 0,
        alert_count:        r.alert_count    || 0,
        action_count:       r.action_count   || 0,
        viable_air_count:   r.total_samples  || 0,
        nonviable_air_count: 0,
        surface_count:      0,
      });
    }

    // ── NONVIABLE_AIR tab ─────────────────────────────────────────────────────
    if (tab_type === 'NONVIABLE_AIR') {
      const filters = { ...req.query, sample_type: 'NONVIABLE_AIR' };
      const vf = buildViableFilters(filters, 'vd', 1);
      // Overall status = ACTION if any particle size hits action, ALERT if alert, else NORMAL
      const nvStatusExpr = `
        CASE
          WHEN vd.particle_05um IS NULL AND vd.particle_50um IS NULL THEN NULL
          WHEN (vd.iso_class='ISO 5' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 5'].action} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 5'].action})) OR
               (vd.iso_class='ISO 7' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 7'].action} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 7'].action})) OR
               (vd.iso_class='ISO 8' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 8'].action} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 8'].action}))
            THEN 'ACTION'
          WHEN (vd.iso_class='ISO 5' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 5'].alert} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 5'].alert})) OR
               (vd.iso_class='ISO 7' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 7'].alert} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 7'].alert})) OR
               (vd.iso_class='ISO 8' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 8'].alert} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 8'].alert}))
            THEN 'ALERT'
          ELSE 'NORMAL'
        END
      `;
      const sql = `
        SELECT
          COUNT(DISTINCT ${VIABLE_SESSION_KEY})::int AS total_sessions,
          COUNT(*)::int AS total_samples,
          COUNT(CASE WHEN (${nvStatusExpr}) = 'ALERT'  THEN 1 END)::int AS alert_count,
          COUNT(CASE WHEN (${nvStatusExpr}) = 'ACTION' THEN 1 END)::int AS action_count
        FROM viable_data vd
        WHERE ${vf.conditions.join(' AND ')}
      `;
      const r = (await pool.query(sql, vf.params)).rows[0];
      return res.json({
        total_sessions:     r.total_sessions || 0,
        complete_sessions:  r.total_sessions || 0,
        incomplete_sessions: 0,
        total_samples:      r.total_samples  || 0,
        alert_count:        r.alert_count    || 0,
        action_count:       r.action_count   || 0,
        viable_air_count:   0,
        nonviable_air_count: r.total_samples || 0,
        surface_count:      0,
      });
    }

    // ── SURFACE tab ───────────────────────────────────────────────────────────
    if (tab_type === 'SURFACE') {
      const sf = buildSurfaceFilters(req.query, 'ss', 1);
      const sql = `
        SELECT
          COUNT(DISTINCT ${SURFACE_SESSION_KEY})::int AS total_sessions,
          COUNT(*)::int AS total_samples,
          COUNT(CASE WHEN ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} = 'ALERT'  THEN 1 END)::int AS alert_count,
          COUNT(CASE WHEN ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} = 'ACTION' THEN 1 END)::int AS action_count
        FROM surface_sampling ss
        WHERE ${sf.conditions.join(' AND ')}
      `;
      const r = (await pool.query(sql, sf.params)).rows[0];
      return res.json({
        total_sessions:     r.total_sessions || 0,
        complete_sessions:  r.total_sessions || 0,
        incomplete_sessions: 0,
        total_samples:      r.total_samples  || 0,
        alert_count:        r.alert_count    || 0,
        action_count:       r.action_count   || 0,
        viable_air_count:   0,
        nonviable_air_count: 0,
        surface_count:      r.total_samples  || 0,
      });
    }

    // ── No tab_type: global totals (backward-compat) ──────────────────────────
    const vf = buildViableFilters(req.query, 'vd', 1);
    const sf = buildSurfaceFilters(req.query, 'ss', 1);
    const cfuExpr = `CASE WHEN vd.iso_class='ISO 5' THEN vd.iso5_cfu WHEN vd.iso_class='ISO 7' THEN vd.iso7_cfu WHEN vd.iso_class='ISO 8' THEN vd.iso8_cfu ELSE NULL END`;
    const viableKpiSql = `
      SELECT
        COUNT(DISTINCT ${VIABLE_SESSION_KEY})::int AS total_sessions,
        COUNT(*)::int AS total_samples,
        COUNT(CASE WHEN ${viableStatusSQL('CASE WHEN vd.sample_type=\'VIABLE_AIR\' THEN COALESCE(vd.iso5_cfu, vd.iso7_cfu, vd.iso8_cfu) ELSE NULL END', 'vd.iso_class')} = 'ALERT'  THEN 1 END)::int AS alert_count,
        COUNT(CASE WHEN ${viableStatusSQL('CASE WHEN vd.sample_type=\'VIABLE_AIR\' THEN COALESCE(vd.iso5_cfu, vd.iso7_cfu, vd.iso8_cfu) ELSE NULL END', 'vd.iso_class')} = 'ACTION' THEN 1 END)::int AS action_count
      FROM viable_data vd WHERE ${vf.conditions.join(' AND ')}
    `;
    const surfaceKpiSql = `
      SELECT
        COUNT(DISTINCT ${SURFACE_SESSION_KEY})::int AS total_sessions,
        COUNT(*)::int AS total_samples,
        COUNT(CASE WHEN ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} = 'ALERT'  THEN 1 END)::int AS alert_count,
        COUNT(CASE WHEN ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} = 'ACTION' THEN 1 END)::int AS action_count
      FROM surface_sampling ss WHERE ${sf.conditions.join(' AND ')}
    `;
    const [vRes, sRes] = await Promise.all([pool.query(viableKpiSql, vf.params), pool.query(surfaceKpiSql, sf.params)]);
    const v = vRes.rows[0]; const s = sRes.rows[0];
    res.json({
      total_sessions:     (v.total_sessions || 0) + (s.total_sessions || 0),
      complete_sessions:  (v.total_sessions || 0) + (s.total_sessions || 0),
      incomplete_sessions: 0,
      total_samples,
      alert_count,
      action_count,
      viable_air_count:    v.total_samples || 0,
      nonviable_air_count: 0,                // counted separately below if needed
      surface_count:       s.total_samples || 0,
    });
  } catch (err) {
    console.error('[env-analytics] kpi error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /viable-air-trend ────────────────────────────────────────────────────
// Reads from viable_data WHERE sample_type = 'VIABLE_AIR'
// Returns one row per sample with derived CFU, status, and display fields
router.get('/viable-air-trend', authMiddleware, async (req, res) => {
  try {
    const filters = { ...req.query, sample_type: 'VIABLE_AIR' };
    const vf = buildViableFilters(filters, 'vd', 1);

    // Determine the cfu for this row based on iso_class
    const cfuExpr = `
      CASE
        WHEN vd.iso_class = 'ISO 5' THEN vd.iso5_cfu
        WHEN vd.iso_class = 'ISO 7' THEN vd.iso7_cfu
        WHEN vd.iso_class = 'ISO 8' THEN vd.iso8_cfu
        ELSE NULL
      END
    `;

    // Handle result status filter — must be applied after derivation
    let statusFilter = '';
    let statusParams = [];
    if (req.query.status) {
      statusFilter = `AND ${viableStatusSQL(cfuExpr.trim(), 'vd.iso_class')} = $${vf.nextIdx}`;
      statusParams = [req.query.status];
    }

    const sql = `
      SELECT
        vd.id::text AS sample_id,
        (${VIABLE_SESSION_KEY}) AS session_group_key,
        vd.sample_date AS date,
        vd.monitoring_context AS context,
        vd.iso_class,
        vd.sample_type,
        vd.sample_location AS location_code,
        COALESCE(vd.sample_location, vd.room_number) AS location_display_name,
        vd.room_number AS room_or_area,
        vd.lot_number,
        vd.lot_id AS batch_id,
        (${cfuExpr}) AS viable_cfu,
        ${viableStatusSQL(cfuExpr.trim(), 'vd.iso_class')} AS status,
        COALESCE(elp.display_name, vd.sample_location) AS location_profile_name,
        u.name AS created_by_name
      FROM viable_data vd
      LEFT JOIN env_location_profiles elp ON elp.id = vd.location_profile_id
      LEFT JOIN users u ON u.id = vd.created_by
      WHERE ${vf.conditions.join(' AND ')} ${statusFilter}
      ORDER BY vd.sample_date ASC, vd.iso_class ASC, vd.sample_location ASC
    `;

    const result = await pool.query(sql, [...vf.params, ...statusParams]);
    res.json(result.rows.map(r => ({
      ...r,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
    })));
  } catch (err) {
    console.error('[env-analytics] viable-air-trend error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /nonviable-air-trend ─────────────────────────────────────────────────
// Reads from viable_data WHERE sample_type = 'NONVIABLE_AIR'
router.get('/nonviable-air-trend', authMiddleware, async (req, res) => {
  try {
    const filters = { ...req.query, sample_type: 'NONVIABLE_AIR' };
    const vf = buildViableFilters(filters, 'vd', 1);

    const sql = `
      SELECT
        vd.id::text AS sample_id,
        (${VIABLE_SESSION_KEY}) AS session_group_key,
        vd.sample_date AS date,
        vd.monitoring_context AS context,
        vd.iso_class,
        vd.sample_type,
        vd.sample_location AS location_code,
        COALESCE(vd.sample_location, vd.room_number) AS location_display_name,
        vd.room_number AS room_or_area,
        vd.lot_number,
        vd.lot_id AS batch_id,
        vd.particle_05um  AS particle_count_0_5,
        vd.particle_50um  AS particle_count_5_0,
        CASE
          WHEN vd.particle_05um IS NULL THEN NULL
          WHEN vd.iso_class = 'ISO 5' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 5'].action} THEN 'ACTION'
          WHEN vd.iso_class = 'ISO 5' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 5'].alert}  THEN 'ALERT'
          WHEN vd.iso_class = 'ISO 7' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 7'].action} THEN 'ACTION'
          WHEN vd.iso_class = 'ISO 7' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 7'].alert}  THEN 'ALERT'
          WHEN vd.iso_class = 'ISO 8' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 8'].action} THEN 'ACTION'
          WHEN vd.iso_class = 'ISO 8' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 8'].alert}  THEN 'ALERT'
          ELSE 'NORMAL'
        END AS status_0_5,
        CASE
          WHEN vd.particle_50um IS NULL THEN NULL
          WHEN vd.iso_class = 'ISO 5' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 5'].action} THEN 'ACTION'
          WHEN vd.iso_class = 'ISO 5' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 5'].alert}  THEN 'ALERT'
          WHEN vd.iso_class = 'ISO 7' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 7'].action} THEN 'ACTION'
          WHEN vd.iso_class = 'ISO 7' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 7'].alert}  THEN 'ALERT'
          WHEN vd.iso_class = 'ISO 8' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 8'].action} THEN 'ACTION'
          WHEN vd.iso_class = 'ISO 8' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 8'].alert}  THEN 'ALERT'
          ELSE 'NORMAL'
        END AS status_5_0,
        u.name AS created_by_name
      FROM viable_data vd
      LEFT JOIN env_location_profiles elp ON elp.id = vd.location_profile_id
      LEFT JOIN users u ON u.id = vd.created_by
      WHERE ${vf.conditions.join(' AND ')}
      ORDER BY vd.sample_date ASC, vd.iso_class ASC, vd.sample_location ASC
    `;

    const result = await pool.query(sql, vf.params);
    res.json(result.rows.map(r => ({
      ...r,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
      status: r.status_0_5 || r.status_5_0 || null,
    })));
  } catch (err) {
    console.error('[env-analytics] nonviable-air-trend error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /surface-trend ───────────────────────────────────────────────────────
// Reads from surface_sampling
router.get('/surface-trend', authMiddleware, async (req, res) => {
  try {
    const sf = buildSurfaceFilters(req.query, 'ss', 1);

    // Handle result status filter
    let statusFilter = '';
    let statusParams = [];
    if (req.query.status) {
      statusFilter = `AND ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} = $${sf.nextIdx}`;
      statusParams = [req.query.status];
    }

    const sql = `
      SELECT
        ss.id::text AS sample_id,
        (${SURFACE_SESSION_KEY}) AS session_group_key,
        ss.sample_date AS date,
        ss.monitoring_context AS context,
        ss.iso_class,
        'SURFACE' AS sample_type,
        ss.sample_location AS location_code,
        ss.sample_location AS location_display_name,
        COALESCE(ss.room_area, ss.sample_location) AS room_or_area,
        ss.lot_number,
        ss.lot_id AS batch_id,
        ss.cfu_found AS surface_cfu,
        ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} AS status,
        ss.organism_id,
        COALESCE(elp.display_name, ss.sample_location) AS location_profile_name,
        u.name AS created_by_name
      FROM surface_sampling ss
      LEFT JOIN env_location_profiles elp ON elp.id = ss.location_profile_id
      LEFT JOIN users u ON u.id = ss.created_by
      WHERE ${sf.conditions.join(' AND ')} ${statusFilter}
      ORDER BY ss.sample_date ASC, ss.iso_class ASC, ss.sample_location ASC
    `;

    const result = await pool.query(sql, [...sf.params, ...statusParams]);
    res.json(result.rows.map(r => ({
      ...r,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
    })));
  } catch (err) {
    console.error('[env-analytics] surface-trend error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /location-trend — all samples for a specific location ────────────────
router.get('/location-trend', authMiddleware, async (req, res) => {
  const { location_profile_id } = req.query;
  if (!location_profile_id) return res.status(400).json({ message: 'location_profile_id is required' });
  try {
    const vf = buildViableFilters({ ...req.query }, 'vd', 1);
    const sf = buildSurfaceFilters({ ...req.query }, 'ss', 1);

    const cfuExpr = `CASE WHEN vd.iso_class='ISO 5' THEN vd.iso5_cfu WHEN vd.iso_class='ISO 7' THEN vd.iso7_cfu WHEN vd.iso_class='ISO 8' THEN vd.iso8_cfu ELSE NULL END`;

    const viableSql = `
      SELECT vd.id::text AS sample_id, (${VIABLE_SESSION_KEY}) AS session_group_key,
        vd.sample_date AS date, vd.monitoring_context AS context,
        vd.iso_class, vd.sample_type, vd.sample_location AS location_code,
        vd.room_number AS room_or_area, vd.lot_number,
        (${cfuExpr}) AS viable_cfu, NULL::numeric AS surface_cfu,
        vd.particle_05um AS particle_count_0_5, vd.particle_50um AS particle_count_5_0,
        ${viableStatusSQL(cfuExpr, 'vd.iso_class')} AS status_viable,
        NULL AS status_0_5, NULL AS status_5_0,
        ${viableStatusSQL(cfuExpr, 'vd.iso_class')} AS status,
        NULL AS organism_id, u.name AS created_by_name, vd.created_at
      FROM viable_data vd
      LEFT JOIN users u ON u.id = vd.created_by
      WHERE ${vf.conditions.join(' AND ')}
    `;

    const surfaceSql = `
      SELECT ss.id::text AS sample_id, (${SURFACE_SESSION_KEY}) AS session_group_key,
        ss.sample_date AS date, ss.monitoring_context AS context,
        ss.iso_class, 'SURFACE' AS sample_type, ss.sample_location AS location_code,
        COALESCE(ss.room_area, ss.sample_location) AS room_or_area, ss.lot_number,
        NULL::numeric AS viable_cfu, ss.cfu_found AS surface_cfu,
        NULL::numeric AS particle_count_0_5, NULL::numeric AS particle_count_5_0,
        NULL AS status_viable, NULL AS status_0_5, NULL AS status_5_0,
        ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} AS status,
        ss.organism_id, u.name AS created_by_name, ss.created_at
      FROM surface_sampling ss
      LEFT JOIN users u ON u.id = ss.created_by
      WHERE ${sf.conditions.join(' AND ')}
    `;

    const [vRes, sRes] = await Promise.all([
      pool.query(viableSql, vf.params),
      pool.query(surfaceSql, sf.params),
    ]);

    const rows = [...vRes.rows, ...sRes.rows]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    res.json(rows.map(r => ({
      ...r,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
    })));
  } catch (err) {
    console.error('[env-analytics] location-trend error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /sessions — derived session list ─────────────────────────────────────
// Sessions are derived from the canonical tables rather than from env_monitoring_sessions
router.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const { limit: rawLimit = '50', offset: rawOffset = '0' } = req.query;
    const limit  = Math.min(parseInt(rawLimit),  200);
    const offset = parseInt(rawOffset);

    const vf = buildViableFilters(req.query, 'vd', 1);
    const sf = buildSurfaceFilters(req.query, 'ss', 1);

    const cfuExpr = `CASE WHEN vd.iso_class='ISO 5' THEN vd.iso5_cfu WHEN vd.iso_class='ISO 7' THEN vd.iso7_cfu WHEN vd.iso_class='ISO 8' THEN vd.iso8_cfu ELSE NULL END`;

    // Group viable records into sessions
    const viableSessionSql = `
      SELECT
        ${VIABLE_SESSION_KEY} AS session_key,
        vd.monitoring_context,
        vd.sample_date AS monitoring_date,
        COALESCE(vd.lot_number, '') AS lot_number,
        COALESCE(vd.room_number, '') AS room_or_area,
        'viable_data' AS source_table,
        COUNT(*)::int AS sample_count,
        COUNT(CASE WHEN ${viableStatusSQL(cfuExpr, 'vd.iso_class')} = 'ALERT'  THEN 1 END)::int AS alert_count,
        COUNT(CASE WHEN ${viableStatusSQL(cfuExpr, 'vd.iso_class')} = 'ACTION' THEN 1 END)::int AS action_count,
        MIN(vd.created_by::text)::uuid AS created_by,
        MIN(vd.created_at) AS created_at
      FROM viable_data vd
      WHERE ${vf.conditions.join(' AND ')}
      GROUP BY ${VIABLE_SESSION_KEY}, vd.monitoring_context, vd.sample_date, COALESCE(vd.lot_number,''), COALESCE(vd.room_number,'')
    `;

    const surfaceSessionSql = `
      SELECT
        ${SURFACE_SESSION_KEY} AS session_key,
        ss.monitoring_context,
        ss.sample_date AS monitoring_date,
        COALESCE(ss.lot_number, '') AS lot_number,
        COALESCE(ss.room_area, ss.sample_location, '') AS room_or_area,
        'surface_sampling' AS source_table,
        COUNT(*)::int AS sample_count,
        COUNT(CASE WHEN ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} = 'ALERT'  THEN 1 END)::int AS alert_count,
        COUNT(CASE WHEN ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} = 'ACTION' THEN 1 END)::int AS action_count,
        MIN(ss.created_by::text)::uuid AS created_by,
        MIN(ss.created_at) AS created_at
      FROM surface_sampling ss
      WHERE ${sf.conditions.join(' AND ')}
      GROUP BY ${SURFACE_SESSION_KEY}, ss.monitoring_context, ss.sample_date, COALESCE(ss.lot_number,''), COALESCE(ss.room_area, ss.sample_location,'')
    `;

    const [vRes, sRes] = await Promise.all([
      pool.query(viableSessionSql, vf.params),
      pool.query(surfaceSessionSql, sf.params),
    ]);

    // Merge and sort all derived sessions
    const allSessions = [...vRes.rows, ...sRes.rows]
      .sort((a, b) => String(b.monitoring_date).localeCompare(String(a.monitoring_date)));

    const total = allSessions.length;
    const sessions = allSessions.slice(offset, offset + limit).map(s => ({
      ...s,
      id: s.session_key,
      completion_status: 'COMPLETE',
      monitoring_date: s.monitoring_date instanceof Date
        ? s.monitoring_date.toISOString().slice(0, 10)
        : String(s.monitoring_date),
    }));

    res.json({ sessions, total, limit, offset });
  } catch (err) {
    console.error('[env-analytics] sessions error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /lots — unique lots in viable + surface data ────────────────────────
router.get('/lots', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT lp.id, lp.display_lot AS lot_number, lp.lot_key
      FROM lot_profiles lp
      WHERE lp.id IN (
        SELECT DISTINCT lot_id FROM viable_data     WHERE deleted_at IS NULL AND lot_id IS NOT NULL
        UNION
        SELECT DISTINCT lot_id FROM surface_sampling WHERE deleted_at IS NULL AND lot_id IS NOT NULL
      )
      ORDER BY lp.display_lot ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[env-analytics] lots error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /thresholds ──────────────────────────────────────────────────────────
router.get('/thresholds', authMiddleware, (req, res) => {
  res.json(ENV_MONITORING_THRESHOLDS);
});

// ─── GET /export/csv ──────────────────────────────────────────────────────────
router.get('/export/csv', authMiddleware, async (req, res) => {
  try {
    const vf = buildViableFilters(req.query, 'vd', 1);
    const sf = buildSurfaceFilters(req.query, 'ss', 1);
    const cfuExpr = `CASE WHEN vd.iso_class='ISO 5' THEN vd.iso5_cfu WHEN vd.iso_class='ISO 7' THEN vd.iso7_cfu WHEN vd.iso_class='ISO 8' THEN vd.iso8_cfu ELSE NULL END`;

    const viableSql = `
      SELECT
        vd.sample_date AS monitoring_date,
        vd.monitoring_context AS context,
        COALESCE(vd.room_number, '') AS room_or_area,
        'COMPLETE' AS completion_status,
        vd.lot_number,
        vd.sample_type,
        vd.iso_class,
        vd.sample_location AS location_name,
        (${cfuExpr}) AS viable_cfu,
        NULL::numeric AS surface_cfu,
        vd.particle_05um AS particle_count_0_5,
        vd.particle_50um AS particle_count_5_0,
        ${viableStatusSQL(cfuExpr, 'vd.iso_class')} AS status_viable,
        NULL AS status_0_5, NULL AS status_5_0,
        ${viableStatusSQL(cfuExpr, 'vd.iso_class')} AS status,
        NULL AS organism_id,
        vd.deviation_number,
        vd.notes AS sample_notes,
        u.name AS entered_by,
        vd.created_at AS session_created_at
      FROM viable_data vd
      LEFT JOIN users u ON u.id = vd.created_by
      WHERE ${vf.conditions.join(' AND ')}
    `;

    const surfaceSql = `
      SELECT
        ss.sample_date AS monitoring_date,
        ss.monitoring_context AS context,
        COALESCE(ss.room_area, ss.sample_location, '') AS room_or_area,
        'COMPLETE' AS completion_status,
        ss.lot_number,
        'SURFACE' AS sample_type,
        ss.iso_class,
        ss.sample_location AS location_name,
        NULL::numeric AS viable_cfu,
        ss.cfu_found AS surface_cfu,
        NULL::numeric AS particle_count_0_5,
        NULL::numeric AS particle_count_5_0,
        NULL AS status_viable, NULL AS status_0_5, NULL AS status_5_0,
        ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} AS status,
        ss.organism_id,
        ss.deviation_number,
        ss.notes AS sample_notes,
        u.name AS entered_by,
        ss.created_at AS session_created_at
      FROM surface_sampling ss
      LEFT JOIN users u ON u.id = ss.created_by
      WHERE ${sf.conditions.join(' AND ')}
    `;

    const [vRes, sRes] = await Promise.all([
      pool.query(viableSql, vf.params),
      pool.query(surfaceSql, sf.params),
    ]);

    const rows = [...vRes.rows, ...sRes.rows]
      .sort((a, b) => String(b.monitoring_date).localeCompare(String(a.monitoring_date)));

    const HEADERS = [
      'Monitoring Date', 'Context', 'Room/Area', 'Completion Status',
      'Lot Number', 'Sample Type', 'ISO Class', 'Location Name',
      'Viable CFU', 'Surface CFU',
      '0.5 µm Count', '5.0 µm Count',
      'Viable Status', '0.5 µm Status', '5.0 µm Status', 'Overall Status',
      'Organism ID', 'Deviation #', 'Notes', 'Entered By', 'Created At',
    ];

    const escCsv = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const csvRows = rows.map(r => [
      r.monitoring_date instanceof Date ? r.monitoring_date.toISOString().slice(0, 10) : r.monitoring_date,
      r.context, r.room_or_area, r.completion_status, r.lot_number,
      r.sample_type, r.iso_class, r.location_name,
      r.viable_cfu, r.surface_cfu, r.particle_count_0_5, r.particle_count_5_0,
      r.status_viable, r.status_0_5, r.status_5_0, r.status,
      r.organism_id, r.deviation_number, r.sample_notes, r.entered_by,
      r.session_created_at instanceof Date ? r.session_created_at.toISOString() : r.session_created_at,
    ].map(escCsv).join(','));

    const csv = [HEADERS.join(','), ...csvRows].join('\n');
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="env-monitoring-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[env-analytics] export/csv error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /sample/:sampleId — canonical sample detail for chart drill-down ─────
// Primary drill-down endpoint. Looks up a sample from viable_data OR
// surface_sampling by its real integer primary key.
// The sample_type query param (VIABLE_AIR | NONVIABLE_AIR | SURFACE) is used
// to pick the right table first; if omitted both are tried.
// Returns the sample with derived status, thresholds, and lot/location context.
router.get('/sample/:sampleId', authMiddleware, async (req, res) => {
  const { sampleId } = req.params;
  const { sample_type } = req.query;

  // sampleId must be an integer (viable_data.id / surface_sampling.id are integer PKs)
  const numId = parseInt(sampleId, 10);
  if (!Number.isFinite(numId) || numId <= 0) {
    return res.status(404).json({ message: 'Environmental sample was not found.' });
  }

  try {
    // ── 1. Try viable_data (covers VIABLE_AIR and NONVIABLE_AIR) ──────────────
    if (!sample_type || sample_type === 'VIABLE_AIR' || sample_type === 'NONVIABLE_AIR') {
      const cfuExpr = `CASE WHEN vd.iso_class='ISO 5' THEN vd.iso5_cfu WHEN vd.iso_class='ISO 7' THEN vd.iso7_cfu WHEN vd.iso_class='ISO 8' THEN vd.iso8_cfu ELSE NULL END`;
      const viableResult = await pool.query(`
        SELECT
          vd.id::text              AS id,
          vd.sample_date          AS monitoring_date,
          vd.monitoring_context,
          vd.iso_class,
          vd.sample_type,
          vd.sample_location      AS location_code,
          COALESCE(vd.sample_location, vd.room_number) AS location_name,
          vd.room_number          AS room_or_area,
          vd.lot_number,
          vd.lot_id               AS batch_id,
          vd.location_profile_id,
          -- Viable measurements
          CASE WHEN vd.sample_type='VIABLE_AIR' THEN (${cfuExpr}) ELSE NULL END AS viable_cfu,
          -- Non-viable measurements
          CASE WHEN vd.sample_type='NONVIABLE_AIR' THEN vd.particle_05um ELSE NULL END AS particle_count_0_5,
          CASE WHEN vd.sample_type='NONVIABLE_AIR' THEN vd.particle_50um ELSE NULL END AS particle_count_5_0,
          -- Derived status
          ${viableStatusSQL(cfuExpr, 'vd.iso_class')} AS status_viable,
          CASE
            WHEN vd.particle_05um IS NULL THEN NULL
            WHEN vd.iso_class='ISO 5' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 5'].action} THEN 'ACTION'
            WHEN vd.iso_class='ISO 5' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 5'].alert}  THEN 'ALERT'
            WHEN vd.iso_class='ISO 7' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 7'].action} THEN 'ACTION'
            WHEN vd.iso_class='ISO 7' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 7'].alert}  THEN 'ALERT'
            WHEN vd.iso_class='ISO 8' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 8'].action} THEN 'ACTION'
            WHEN vd.iso_class='ISO 8' AND vd.particle_05um >= ${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 8'].alert}  THEN 'ALERT'
            ELSE 'NORMAL'
          END AS status_0_5,
          CASE
            WHEN vd.particle_50um IS NULL THEN NULL
            WHEN vd.iso_class='ISO 5' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 5'].action} THEN 'ACTION'
            WHEN vd.iso_class='ISO 5' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 5'].alert}  THEN 'ALERT'
            WHEN vd.iso_class='ISO 7' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 7'].action} THEN 'ACTION'
            WHEN vd.iso_class='ISO 7' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 7'].alert}  THEN 'ALERT'
            WHEN vd.iso_class='ISO 8' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 8'].action} THEN 'ACTION'
            WHEN vd.iso_class='ISO 8' AND vd.particle_50um >= ${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 8'].alert}  THEN 'ALERT'
            ELSE 'NORMAL'
          END AS status_5_0,
          CASE
            WHEN vd.sample_type='VIABLE_AIR' THEN ${viableStatusSQL(cfuExpr, 'vd.iso_class')}
            WHEN vd.sample_type='NONVIABLE_AIR' THEN
              CASE
                WHEN vd.particle_05um IS NULL AND vd.particle_50um IS NULL THEN NULL
                WHEN
                  (vd.iso_class='ISO 5' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 5'].action} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 5'].action})) OR
                  (vd.iso_class='ISO 7' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 7'].action} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 7'].action})) OR
                  (vd.iso_class='ISO 8' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 8'].action} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 8'].action}))
                THEN 'ACTION'
                WHEN
                  (vd.iso_class='ISO 5' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 5'].alert} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 5'].alert})) OR
                  (vd.iso_class='ISO 7' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 7'].alert} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 7'].alert})) OR
                  (vd.iso_class='ISO 8' AND (COALESCE(vd.particle_05um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_0_5['ISO 8'].alert} OR COALESCE(vd.particle_50um,0)>=${ENV_MONITORING_THRESHOLDS.nonviable_5_0['ISO 8'].alert}))
                THEN 'ALERT'
                ELSE 'NORMAL'
              END
            ELSE NULL
          END AS status,
          -- Thresholds for the UI to display
          CASE
            WHEN vd.iso_class='ISO 5' THEN ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 5'].alert ?? 'NULL'}
            WHEN vd.iso_class='ISO 7' THEN ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 7'].alert}
            WHEN vd.iso_class='ISO 8' THEN ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 8'].alert}
            ELSE NULL
          END AS viable_alert_threshold,
          CASE
            WHEN vd.iso_class='ISO 5' THEN ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 5'].action}
            WHEN vd.iso_class='ISO 7' THEN ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 7'].action}
            WHEN vd.iso_class='ISO 8' THEN ${ENV_MONITORING_THRESHOLDS.viable_air['ISO 8'].action}
            ELSE NULL
          END AS viable_action_threshold,
          vd.deviation_number,
          vd.notes,
          u.name AS created_by_name,
          vd.created_at,
          -- Location profile display name
          COALESCE(elp.display_name, vd.sample_location) AS location_display_name,
          elp.room_or_area AS profile_room_or_area,
          -- Lot profile info
          lp.display_lot AS lot_display,
          lp.id AS lot_profile_id
        FROM viable_data vd
        LEFT JOIN env_location_profiles elp ON elp.id = vd.location_profile_id
        LEFT JOIN users u ON u.id = vd.created_by
        LEFT JOIN lot_profiles lp ON lp.id = vd.lot_id
        WHERE vd.id = $1 AND vd.deleted_at IS NULL
      `, [numId]);

      if (viableResult.rows.length) {
        const row = viableResult.rows[0];
        return res.json({
          source_table: 'viable_data',
          sample: {
            id:                   row.id,
            monitoring_date:      row.monitoring_date instanceof Date
                                    ? row.monitoring_date.toISOString().slice(0, 10)
                                    : String(row.monitoring_date),
            monitoring_context:   row.monitoring_context,
            iso_class:            row.iso_class,
            sample_type:          row.sample_type,
            location_code:        row.location_code,
            location_name:        row.location_display_name || row.location_name || row.location_code,
            room_or_area:         row.profile_room_or_area || row.room_or_area,
            lot_number:           row.lot_display || row.lot_number || null,
            batch_id:             row.batch_id,
            location_profile_id:  row.location_profile_id,
            // Measurements
            viable_cfu:           row.viable_cfu !== undefined ? row.viable_cfu : null,
            particle_count_0_5:   row.particle_count_0_5 !== undefined ? row.particle_count_0_5 : null,
            particle_count_5_0:   row.particle_count_5_0 !== undefined ? row.particle_count_5_0 : null,
            surface_cfu:          null,
            organism_id:          null,
            // Status
            status_viable:        row.status_viable,
            status_0_5:           row.status_0_5,
            status_5_0:           row.status_5_0,
            status:               row.status,
            // Thresholds
            viable_alert_threshold:  row.viable_alert_threshold,
            viable_action_threshold: row.viable_action_threshold,
            nonviable_0_5_thresholds: ENV_MONITORING_THRESHOLDS.nonviable_0_5[row.iso_class] || null,
            nonviable_5_0_thresholds: ENV_MONITORING_THRESHOLDS.nonviable_5_0[row.iso_class] || null,
            // Meta
            deviation_number:     row.deviation_number,
            notes:                row.notes,
            created_by_name:      row.created_by_name,
            created_at:           row.created_at,
          },
          // No session linkage — these records are written directly to viable_data
          session: null,
          session_note: 'Records in this table are not linked to a monitoring session.',
        });
      }
    }

    // ── 2. Try surface_sampling ───────────────────────────────────────────────
    if (!sample_type || sample_type === 'SURFACE') {
      const surfaceResult = await pool.query(`
        SELECT
          ss.id::text              AS id,
          ss.sample_date           AS monitoring_date,
          ss.monitoring_context,
          ss.iso_class,
          'SURFACE'                AS sample_type,
          ss.sample_location       AS location_code,
          COALESCE(elp.display_name, ss.sample_location) AS location_display_name,
          COALESCE(ss.room_area, ss.sample_location) AS room_or_area,
          ss.lot_number,
          ss.lot_id                AS batch_id,
          ss.location_profile_id,
          ss.cfu_found             AS surface_cfu,
          ${surfaceStatusSQL('ss.cfu_found', 'ss.iso_class')} AS status,
          CASE
            WHEN ss.iso_class='ISO 5' THEN ${ENV_MONITORING_THRESHOLDS.surface['ISO 5'].alert ?? 'NULL'}
            WHEN ss.iso_class='ISO 7' THEN ${ENV_MONITORING_THRESHOLDS.surface['ISO 7'].alert}
            WHEN ss.iso_class='ISO 8' THEN ${ENV_MONITORING_THRESHOLDS.surface['ISO 8'].alert}
            ELSE NULL
          END AS surface_alert_threshold,
          CASE
            WHEN ss.iso_class='ISO 5' THEN ${ENV_MONITORING_THRESHOLDS.surface['ISO 5'].action}
            WHEN ss.iso_class='ISO 7' THEN ${ENV_MONITORING_THRESHOLDS.surface['ISO 7'].action}
            WHEN ss.iso_class='ISO 8' THEN ${ENV_MONITORING_THRESHOLDS.surface['ISO 8'].action}
            ELSE NULL
          END AS surface_action_threshold,
          ss.organism_id,
          ss.deviation_number,
          ss.notes,
          u.name AS created_by_name,
          ss.created_at,
          lp.display_lot AS lot_display,
          lp.id AS lot_profile_id
        FROM surface_sampling ss
        LEFT JOIN env_location_profiles elp ON elp.id = ss.location_profile_id
        LEFT JOIN users u ON u.id = ss.created_by
        LEFT JOIN lot_profiles lp ON lp.id = ss.lot_id
        WHERE ss.id = $1 AND ss.deleted_at IS NULL
      `, [numId]);

      if (surfaceResult.rows.length) {
        const row = surfaceResult.rows[0];
        return res.json({
          source_table: 'surface_sampling',
          sample: {
            id:                    row.id,
            monitoring_date:       row.monitoring_date instanceof Date
                                     ? row.monitoring_date.toISOString().slice(0, 10)
                                     : String(row.monitoring_date),
            monitoring_context:    row.monitoring_context,
            iso_class:             row.iso_class,
            sample_type:           row.sample_type,
            location_code:         row.location_code,
            location_name:         row.location_display_name || row.location_code,
            room_or_area:          row.room_or_area,
            lot_number:            row.lot_display || row.lot_number || null,
            batch_id:              row.batch_id,
            location_profile_id:   row.location_profile_id,
            // Measurements
            viable_cfu:            null,
            particle_count_0_5:    null,
            particle_count_5_0:    null,
            surface_cfu:           row.surface_cfu,
            organism_id:           row.organism_id,
            // Status
            status_viable:         null,
            status_0_5:            null,
            status_5_0:            null,
            status:                row.status,
            // Thresholds
            surface_alert_threshold:  row.surface_alert_threshold,
            surface_action_threshold: row.surface_action_threshold,
            // Meta
            deviation_number:      row.deviation_number,
            notes:                 row.notes,
            created_by_name:       row.created_by_name,
            created_at:            row.created_at,
          },
          // No session linkage for surface_sampling records
          session: null,
          session_note: 'Records in this table are not linked to a monitoring session.',
        });
      }
    }

    // Not found in either table
    return res.status(404).json({ message: 'Environmental sample was not found.' });
  } catch (err) {
    console.error('[env-analytics] sample detail error:', err.message);
    res.status(500).json({ message: 'Unable to load Environmental Monitoring details.' });
  }
});

module.exports = router;
