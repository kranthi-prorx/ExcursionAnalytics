-- ============================================================
--  Migration 00001 — Initial Schema
--  Excursion Hit Analytics
--  Auto-runs when the Docker container first starts.
-- ============================================================

-- Extensions
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Role for PostgREST anonymous access ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon;

-- ─── Users ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(200) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'user'
                             CHECK (role IN ('admin', 'manager', 'user')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── Records ─────────────────────────────────────────────────
-- Each row = one excursion monitoring session for one person.
CREATE TABLE IF NOT EXISTS records (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(120) NOT NULL,
  lot_number     VARCHAR(80)  NOT NULL,
  job_function   VARCHAR(120) NOT NULL,
  personnel_type VARCHAR(60)  NOT NULL DEFAULT 'Filling',

  -- Dominant ISO class (ISO 5 if any location on this record is ISO 5)
  iso_class      VARCHAR(20)  NOT NULL DEFAULT 'ISO 7'
                              CHECK (iso_class IN ('ISO 5', 'ISO 7')),

  -- Record-level aggregate thresholds (derived from hit_details)
  alert_level    SMALLINT     NOT NULL DEFAULT 0,
  action_level   SMALLINT     NOT NULL DEFAULT 4,

  -- The actual date the excursion event occurred (NOT the entry date)
  hit_date       DATE         NOT NULL DEFAULT CURRENT_DATE,

  timestamp      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),   -- entry timestamp
  created_by     UUID         REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_records_name       ON records(name);
CREATE INDEX IF NOT EXISTS idx_records_lot         ON records(lot_number);
CREATE INDEX IF NOT EXISTS idx_records_iso         ON records(iso_class);
CREATE INDEX IF NOT EXISTS idx_records_ptype       ON records(personnel_type);
CREATE INDEX IF NOT EXISTS idx_records_hit_date    ON records(hit_date DESC);
CREATE INDEX IF NOT EXISTS idx_records_timestamp   ON records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_records_created_by  ON records(created_by);

-- ─── Hit Details ─────────────────────────────────────────────
-- One row per body location per record.
-- iso_class, alert_level, action_level are locked at entry time for auditability.
CREATE TABLE IF NOT EXISTS hit_details (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id    UUID        NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  location     VARCHAR(60)  NOT NULL,
  iso_class    VARCHAR(20)  NOT NULL DEFAULT 'ISO 7'
                            CHECK (iso_class IN ('ISO 5', 'ISO 7')),
  hit_value    SMALLINT     NOT NULL DEFAULT 0 CHECK (hit_value >= 0),
  alert_level  SMALLINT     NOT NULL DEFAULT 0,
  action_level SMALLINT     NOT NULL DEFAULT 4
);

CREATE INDEX IF NOT EXISTS idx_hitdetails_record   ON hit_details(record_id);
CREATE INDEX IF NOT EXISTS idx_hitdetails_location ON hit_details(location);
CREATE INDEX IF NOT EXISTS idx_hitdetails_iso      ON hit_details(iso_class);
CREATE INDEX IF NOT EXISTS idx_hitdetails_hit      ON hit_details(hit_value);

-- Grant read access to anonymous PostgREST role
GRANT SELECT ON users, records, hit_details TO anon;
