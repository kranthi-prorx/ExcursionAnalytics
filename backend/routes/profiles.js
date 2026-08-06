const router = require('express').Router();
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { normalizeKey, cleanDisplayValue } = require('../lib/normalize');

// ─── Ensure profile tables exist (called inline in every handler) ─────────────
// Running this per-request is safe because CREATE TABLE IF NOT EXISTS is a no-op
// when the table already exists. This guarantees the tables exist regardless of
// whether the startup migration has run yet.
async function ensureProfileTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personnel_profiles (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      display_name    TEXT NOT NULL,
      name_key        TEXT NOT NULL UNIQUE,
      personnel_type  TEXT NOT NULL DEFAULT 'Filling',
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lot_profiles (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      display_lot     TEXT NOT NULL,
      lot_key         TEXT NOT NULL UNIQUE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Add FK columns to records if missing
  await pool.query(`
    ALTER TABLE records ADD COLUMN IF NOT EXISTS personnel_id UUID;
    ALTER TABLE records ADD COLUMN IF NOT EXISTS lot_id UUID;
  `).catch(() => {}); // ignore if records table doesn't exist yet
}

// ─── Personnel Profiles ──────────────────────────────────────────────────────

// GET /api/profiles/personnel — searchable list
router.get('/personnel', authMiddleware, async (req, res) => {
  try {
    await ensureProfileTables();
    const { q } = req.query;
    let sql = `
      SELECT id, display_name, name_key, personnel_type, is_active, created_at, updated_at
      FROM personnel_profiles
    `;
    const params = [];
    if (q) {
      sql += ` WHERE display_name ILIKE $1 OR name_key ILIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY display_name ASC LIMIT 100`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[profiles] GET /personnel error:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/profiles/personnel — create (with duplicate check)
router.post('/personnel', authMiddleware, async (req, res) => {
  try {
    await ensureProfileTables();

    const { name, personnel_type } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const nameKey     = normalizeKey(name);
    const displayName = cleanDisplayValue(name);
    const pType       = personnel_type || 'Filling';

    // Use upsert so we never get a unique-key error — if an equivalent
    // normalized profile already exists, return 409 with the existing record
    // so the frontend can auto-select it.
    const existing = await pool.query(
      'SELECT * FROM personnel_profiles WHERE name_key = $1',
      [nameKey]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: `Personnel profile already exists: "${existing.rows[0].display_name}"`,
        existing: existing.rows[0],
      });
    }

    const result = await pool.query(
      `INSERT INTO personnel_profiles (display_name, name_key, personnel_type)
       VALUES ($1, $2, $3) RETURNING *`,
      [displayName, nameKey, pType]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[profiles] POST /personnel error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to create personnel profile' });
  }
});

// ─── Lot Profiles ────────────────────────────────────────────────────────────

// GET /api/profiles/lots — searchable list
router.get('/lots', authMiddleware, async (req, res) => {
  try {
    await ensureProfileTables();
    const { q } = req.query;
    let sql = `
      SELECT id, display_lot, lot_key, created_at, updated_at
      FROM lot_profiles
    `;
    const params = [];
    if (q) {
      sql += ` WHERE display_lot ILIKE $1 OR lot_key ILIKE $1`;
      params.push(`%${q}%`);
    }
    sql += ` ORDER BY display_lot ASC LIMIT 100`;
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[profiles] GET /lots error:', err.message);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

// POST /api/profiles/lots — create (with duplicate check)
router.post('/lots', authMiddleware, async (req, res) => {
  try {
    await ensureProfileTables();

    const { lot_number } = req.body;
    if (!lot_number) return res.status(400).json({ message: 'Lot number is required' });

    const lotKey     = normalizeKey(lot_number);
    const displayLot = cleanDisplayValue(lot_number);

    const existing = await pool.query(
      'SELECT * FROM lot_profiles WHERE lot_key = $1',
      [lotKey]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        message: `Lot profile already exists: "${existing.rows[0].display_lot}"`,
        existing: existing.rows[0],
      });
    }

    const result = await pool.query(
      `INSERT INTO lot_profiles (display_lot, lot_key)
       VALUES ($1, $2) RETURNING *`,
      [displayLot, lotKey]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[profiles] POST /lots error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to create lot profile' });
  }
});

module.exports = router;
