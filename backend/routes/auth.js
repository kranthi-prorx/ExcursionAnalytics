const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { signToken, authMiddleware } = require('../middleware/auth');

const ALLOWED_DOMAIN = 'prorxpharma.com';

function isAllowedEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const parts = email.toLowerCase().trim().split('@');
  return parts.length === 2 && parts[1] === ALLOWED_DOMAIN;
}

// POST /api/auth/check-email
// Checks whether an email exists in the users table.
// Used for real-time "account found / not found" feedback on login & forgot-password.
router.post('/check-email', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!isAllowedEmail(email)) {
    return res.status(403).json({ exists: false, message: `Only corporate emails (@${ALLOWED_DOMAIN}) are allowed.` });
  }
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    console.error('check-email error:', err);
    res.status(500).json({ exists: false, message: 'Server error.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

  // ── Corporate domain gate ────────────────────────────────────────────────
  if (!isAllowedEmail(email)) {
    return res.status(403).json({ message: `Only corporate emails (@${ALLOWED_DOMAIN}) are allowed.` });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password, role = 'user' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password required' });
  if (!['admin','manager','user'].includes(role)) return res.status(400).json({ message: 'Invalid role' });

  // ── Corporate domain gate ────────────────────────────────────────────────
  if (!isAllowedEmail(email)) {
    return res.status(403).json({ message: `Only corporate emails (@${ALLOWED_DOMAIN}) are allowed.` });
  }

  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (exists.rows.length) return res.status(409).json({ message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email.toLowerCase(), hash, role]
    );
    const user = result.rows[0];
    const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
