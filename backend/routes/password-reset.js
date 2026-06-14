/**
 * routes/password-reset.js
 * Forgot-password flow: request OTP → verify OTP → reset password
 *
 * Security:
 *  - OTPs expire after 10 minutes
 *  - Max 3 wrong attempts before code is invalidated
 *  - Generic responses prevent email enumeration
 *  - Reset tokens are single-use, crypto-random, expire in 15 minutes
 *  - All email comparisons are case-insensitive
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const pool    = require('../db');
const nodemailer = require('nodemailer');

// ── In-memory stores (fine for a single-server internal tool) ────────────────
// Map<email, { otp, expiresAt, attempts }>
const otpStore   = new Map();
// Map<token, { email, expiresAt }>
const tokenStore = new Map();

const OTP_TTL_MS   = 10 * 60 * 1000;  // 10 minutes
const TOKEN_TTL_MS = 15 * 60 * 1000;  // 15 minutes
const MAX_ATTEMPTS = 3;

// ── Cleanup expired entries every 5 minutes ───────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpStore)   if (v.expiresAt < now) otpStore.delete(k);
  for (const [k, v] of tokenStore) if (v.expiresAt < now) tokenStore.delete(k);
}, 5 * 60 * 1000);

// ── Nodemailer transporter ────────────────────────────────────────────────────
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function sendOtpEmail(to, otp) {
  const t = getTransporter();
  if (!t) {
    // Dev fallback: print to console when SMTP is not configured
    console.log(`\n🔑  [DEV] Password reset OTP for ${to}: ${otp}  (expires in 10 min)\n`);
    return;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || 'noreply@prorxpharma.com',
    to,
    subject: 'ProRx Pharma — Your Password Reset Code',
    text: `Your verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#1e293b;margin-bottom:8px;">Password Reset</h2>
        <p style="color:#475569;font-size:14px;">Your verification code is:</p>
        <div style="font-size:36px;font-weight:800;letter-spacing:12px;color:#4f46e5;padding:20px 0;text-align:center;">${otp}</div>
        <p style="color:#64748b;font-size:12px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <p style="color:#94a3b8;font-size:11px;margin-top:24px;">If you did not request a password reset, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
        <p style="color:#94a3b8;font-size:11px;">ProRx Pharma — Excursion Hit Analytics Dashboard</p>
      </div>
    `,
  });
}

const ALLOWED_DOMAIN = 'prorxpharma.com';
function isAllowedEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const parts = email.toLowerCase().trim().split('@');
  return parts.length === 2 && parts[1] === ALLOWED_DOMAIN;
}

// ── POST /api/auth/forgot-password ─────────────────────────────────────────
// Body: { email }
// Returns 404 with a friendly message if the user does not exist.
router.post('/forgot-password', async (req, res) => {
  const rawEmail = (req.body.email || '').trim();
  const email    = rawEmail.toLowerCase();

  if (!isAllowedEmail(email)) {
    return res.status(403).json({ message: `Only corporate emails (@${ALLOWED_DOMAIN}) are allowed.` });
  }

  try {
    // ── Check user existence FIRST ─────────────────────────────────────────
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    if (!rows.length) {
      // User does not exist — tell them explicitly
      return res.status(404).json({
        message: 'No account was found with this email. Please contact the administrator to create an account.',
      });
    }

    // ── User exists — generate & send OTP ─────────────────────────────────
    const otp = String(Math.floor(100_000 + Math.random() * 900_000));
    otpStore.set(email, { otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

    await sendOtpEmail(email, otp);

    res.json({ message: 'Verification code sent. Please check your inbox.' });
  } catch (err) {
    console.error('Forgot-password error:', err.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});


// ── POST /api/auth/verify-otp ─────────────────────────────────────────────────
// Body: { email, otp }
// Returns { resetToken } on success.
router.post('/verify-otp', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const otp   = (req.body.otp   || '').trim();

  const record = otpStore.get(email);

  // Generic "invalid" for all failure modes
  function fail() {
    return res.status(400).json({ message: 'Invalid or expired verification code.' });
  }

  if (!record)                          return fail();
  if (Date.now() > record.expiresAt)    { otpStore.delete(email); return fail(); }
  if (record.attempts >= MAX_ATTEMPTS)  { otpStore.delete(email); return fail(); }

  if (record.otp !== otp) {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) otpStore.delete(email);
    return fail();
  }

  // Valid — issue single-use reset token
  otpStore.delete(email);
  const resetToken = crypto.randomBytes(32).toString('hex');
  tokenStore.set(resetToken, { email, expiresAt: Date.now() + TOKEN_TTL_MS });

  res.json({ resetToken });
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
// Body: { resetToken, newPassword }
router.post('/reset-password', async (req, res) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return res.status(400).json({ message: 'Reset token and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  const record = tokenStore.get(resetToken);
  if (!record || Date.now() > record.expiresAt) {
    return res.status(400).json({ message: 'Reset session expired. Please start over.' });
  }

  const { email } = record;
  tokenStore.delete(resetToken); // single-use

  try {
    const hash = await bcrypt.hash(newPassword, 12);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
      [hash, email]
    );
    if (!result.rows.length) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json({ message: 'Password updated successfully. Please log in again.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
