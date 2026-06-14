const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/users — Admin only
router.get('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/users/:id — Admin only
router.put('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, email, role } = req.body;
  if (role && !['admin','manager','user'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  try {
    const result = await pool.query(
      `UPDATE users SET
        name  = COALESCE($1, name),
        email = COALESCE($2, email),
        role  = COALESCE($3, role)
       WHERE id = $4
       RETURNING id, name, email, role, created_at`,
      [name || null, email ? email.toLowerCase() : null, role || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/users/:id — Admin only
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ message: "You cannot delete your own account" });
  }
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/users/:id/reset-password — Admin only
router.post('/:id/reset-password', authMiddleware, requireRole('admin'), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
      [hash, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
