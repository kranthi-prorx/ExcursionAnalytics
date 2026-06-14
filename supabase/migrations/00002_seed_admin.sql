-- ============================================================
--  Migration 00002 — Seed Admin User
--  Default login:  admin@eha.local / Admin1234!
--  Password hash generated with bcrypt (10 rounds).
--  Change this password immediately after first login!
-- ============================================================

INSERT INTO users (name, email, password_hash, role)
VALUES (
  'Admin',
  'admin@eha.local',
  -- bcrypt hash of "Admin1234!"
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'admin'
)
ON CONFLICT (email) DO NOTHING;
