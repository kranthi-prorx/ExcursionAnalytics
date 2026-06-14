/**
 * routes/profile.js
 * Authenticated endpoints for any logged-in user to update their own profile.
 *
 * PUT /api/profile        — update name and/or password
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../db');
const { authMiddleware } = require('../middleware/auth');

// PUT /api/profile
router.put('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { name, currentPassword, newPassword } = req.body;

  // At least one field must be supplied
  if (!name && !newPassword) {
    return res.status(400).json({ message: 'Nothing to update.' });
  }

  // Validate name if provided
  if (name !== undefined && name.trim().length < 2) {
    return res.status(400).json({ message: 'Name must be at least 2 characters.' });
  }

  // Validate new password if provided
  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ message: 'Current password is required to set a new password.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ message: 'Password must contain letters and numbers.' });
    }
  }

  try {
    // Fetch current user row
    const { rows } = await pool.query(
      'SELECT id, name, email, role, password_hash FROM users WHERE id = $1',
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found.' });
    const user = rows[0];

    // Verify current password if changing password
    if (newPassword) {
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    // Build update query dynamically
    const updates = [];
    const params  = [];
    let idx = 1;

    if (name && name.trim() !== user.name) {
      updates.push(`name = $${idx++}`);
      params.push(name.trim());
    }
    if (newPassword) {
      const hash = await bcrypt.hash(newPassword, 12);
      updates.push(`password_hash = $${idx++}`);
      params.push(hash);
    }

    if (!updates.length) {
      return res.status(400).json({ message: 'No changes detected.' });
    }

    params.push(userId);
    const result = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, email, role, created_at`,
      params
    );

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
