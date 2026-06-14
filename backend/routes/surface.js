const router = require('express').Router();
const pool   = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Ensure table exists (idempotent)
pool.query(`
  CREATE TABLE IF NOT EXISTS surface_sampling (
    id               SERIAL PRIMARY KEY,
    sample_location  TEXT NOT NULL,
    lot_number       TEXT NOT NULL,
    sample_date      DATE NOT NULL,
    iso_class        TEXT NOT NULL DEFAULT 'ISO 7',
    cfu_found        SMALLINT NOT NULL DEFAULT 0,
    organism_id      TEXT,
    deviation_number TEXT,
    notes            TEXT,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(console.error);

// GET /api/surface
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM surface_sampling ORDER BY sample_date DESC, created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/surface
router.post('/', authMiddleware, async (req, res) => {
  const {
    sample_location, lot_number, sample_date, iso_class,
    cfu_found, organism_id, deviation_number, notes,
  } = req.body;

  if (!sample_location || !lot_number || !sample_date) {
    return res.status(400).json({
      message: 'sample_location, lot_number and sample_date are required',
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO surface_sampling
         (sample_location, lot_number, sample_date, iso_class, cfu_found,
          organism_id, deviation_number, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        sample_location, lot_number, sample_date,
        iso_class || 'ISO 7', parseInt(cfu_found) || 0,
        organism_id || null, deviation_number || null,
        notes || null, req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/surface/:id
router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const {
    sample_location, lot_number, sample_date, iso_class,
    cfu_found, organism_id, deviation_number, notes,
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE surface_sampling SET
         sample_location=$1, lot_number=$2, sample_date=$3,
         iso_class=$4, cfu_found=$5, organism_id=$6,
         deviation_number=$7, notes=$8
       WHERE id=$9 RETURNING *`,
      [
        sample_location, lot_number, sample_date,
        iso_class || 'ISO 7', parseInt(cfu_found) || 0,
        organism_id || null, deviation_number || null,
        notes || null, id,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/surface/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM surface_sampling WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
