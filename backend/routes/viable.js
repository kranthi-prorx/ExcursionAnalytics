const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Ensure table exists (idempotent)
pool.query(`
  CREATE TABLE IF NOT EXISTS viable_data (
    id               SERIAL PRIMARY KEY,
    lot_number       TEXT NOT NULL,
    sample_date      DATE NOT NULL,
    iso_class        TEXT NOT NULL DEFAULT 'ISO 7',
    room_number      TEXT,
    iso5_cfu         SMALLINT NOT NULL DEFAULT 0,
    iso7_cfu         SMALLINT NOT NULL DEFAULT 0,
    particle_05um    NUMERIC(12,2) NOT NULL DEFAULT 0,
    particle_50um    NUMERIC(12,2) NOT NULL DEFAULT 0,
    deviation_number TEXT,
    notes            TEXT,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).then(() =>
  pool.query(`ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS iso_class TEXT NOT NULL DEFAULT 'ISO 7'`)
).then(() =>
  pool.query(`ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS room_number TEXT`)
).catch(console.error);

// GET /api/viable
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT vd.*, u.name as created_by_name
       FROM viable_data vd
       LEFT JOIN users u ON u.id = vd.created_by
       ORDER BY vd.sample_date DESC, vd.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/viable/by-lot  — aggregated for charts
router.get('/by-lot', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        lot_number,
        SUM(iso5_cfu)::int       AS iso5_total,
        SUM(iso7_cfu)::int       AS iso7_total,
        ROUND(AVG(particle_05um)::numeric, 2) AS avg_05um,
        ROUND(AVG(particle_50um)::numeric, 2) AS avg_50um,
        COUNT(*)::int            AS sample_count
      FROM viable_data
      GROUP BY lot_number
      ORDER BY lot_number
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/viable
router.post('/', authMiddleware, async (req, res) => {
  const {
    lot_number, sample_date, iso_class, room_number, iso5_cfu, iso7_cfu,
    particle_05um, particle_50um, deviation_number, notes,
  } = req.body;

  if (!lot_number || !sample_date) {
    return res.status(400).json({ message: 'lot_number and sample_date are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO viable_data
         (lot_number, sample_date, iso_class, room_number, iso5_cfu, iso7_cfu,
          particle_05um, particle_50um, deviation_number, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        lot_number, sample_date, iso_class || 'ISO 7',
        room_number || null,
        parseInt(iso5_cfu) || 0, parseInt(iso7_cfu) || 0,
        parseFloat(particle_05um) || 0, parseFloat(particle_50um) || 0,
        deviation_number || null, notes || null,
        req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/viable/:id
router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const {
    lot_number, sample_date, iso_class, room_number, iso5_cfu, iso7_cfu,
    particle_05um, particle_50um, deviation_number, notes,
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE viable_data SET
         lot_number=$1, sample_date=$2, iso_class=$3, room_number=$4,
         iso5_cfu=$5, iso7_cfu=$6,
         particle_05um=$7, particle_50um=$8,
         deviation_number=$9, notes=$10
       WHERE id=$11 RETURNING *`,
      [
        lot_number, sample_date, iso_class || 'ISO 7',
        room_number || null,
        parseInt(iso5_cfu) || 0, parseInt(iso7_cfu) || 0,
        parseFloat(particle_05um) || 0, parseFloat(particle_50um) || 0,
        deviation_number || null, notes || null, id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/viable/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM viable_data WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
