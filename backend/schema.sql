-- ==========================================
--  Excursion Hit Analytics — Database Schema
-- ==========================================

-- Extensions
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(200) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin','manager','user')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── Records ─────────────────────────────────────────────────────────────────
-- NOTE: iso_class, alert_level, action_level on the record are aggregate /
--       representative values derived from the hit_details rows.
CREATE TABLE IF NOT EXISTS records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(120)  NOT NULL,
  lot_number     VARCHAR(80)   NOT NULL,
  job_function   VARCHAR(120)  NOT NULL,
  personnel_type VARCHAR(60)   NOT NULL DEFAULT 'Filling',
  -- Dominant ISO class for this record (ISO 5 if any location is ISO 5)
  iso_class      VARCHAR(20)   NOT NULL DEFAULT 'ISO 7' CHECK (iso_class IN ('ISO 5', 'ISO 7')),
  -- Record-level thresholds (kept for backward compatibility, derived from locations)
  alert_level    SMALLINT      NOT NULL DEFAULT 0,
  action_level   SMALLINT      NOT NULL DEFAULT 4,
  timestamp      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by     UUID          REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_records_name       ON records(name);
CREATE INDEX IF NOT EXISTS idx_records_lot         ON records(lot_number);
CREATE INDEX IF NOT EXISTS idx_records_iso         ON records(iso_class);
CREATE INDEX IF NOT EXISTS idx_records_ptype       ON records(personnel_type);
CREATE INDEX IF NOT EXISTS idx_records_timestamp   ON records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_records_created_by  ON records(created_by);

-- ─── Hit Details ──────────────────────────────────────────────────────────────
-- Each row stores the hit count at one body location for a given record.
-- iso_class, alert_level, and action_level are derived from the personnel_type
-- + location combination (see getLocationConfig in src/types/index.ts) and
-- stored here for auditability and fast querying.
CREATE TABLE IF NOT EXISTS hit_details (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id    UUID     NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  location     VARCHAR(60)  NOT NULL,
  -- ISO class for this specific location (may differ from the record-level class)
  iso_class    VARCHAR(20)  NOT NULL DEFAULT 'ISO 7' CHECK (iso_class IN ('ISO 5', 'ISO 7')),
  -- Any non-negative integer count of hits observed
  hit_value    SMALLINT     NOT NULL DEFAULT 0 CHECK (hit_value >= 0),
  -- Locked thresholds derived from iso_class / personnel_type
  alert_level  SMALLINT     NOT NULL DEFAULT 0,
  action_level SMALLINT     NOT NULL DEFAULT 4
);

CREATE INDEX IF NOT EXISTS idx_hitdetails_record   ON hit_details(record_id);
CREATE INDEX IF NOT EXISTS idx_hitdetails_location ON hit_details(location);
CREATE INDEX IF NOT EXISTS idx_hitdetails_iso      ON hit_details(iso_class);
CREATE INDEX IF NOT EXISTS idx_hitdetails_hit      ON hit_details(hit_value);

-- ─── Migration helper (run against existing DB) ───────────────────────────────
-- If upgrading from the previous schema, run these statements manually:
--
--   ALTER TABLE records
--     ALTER COLUMN alert_level  TYPE SMALLINT USING alert_level::SMALLINT,
--     ALTER COLUMN action_level TYPE SMALLINT USING action_level::SMALLINT,
--     DROP CONSTRAINT IF EXISTS records_alert_level_check,
--     DROP CONSTRAINT IF EXISTS records_action_level_check,
--     ADD COLUMN IF NOT EXISTS iso_class VARCHAR(20) NOT NULL DEFAULT 'ISO 7'
--       CHECK (iso_class IN ('ISO 5', 'ISO 7'));
--
--   ALTER TABLE hit_details
--     ADD COLUMN IF NOT EXISTS iso_class VARCHAR(20) NOT NULL DEFAULT 'ISO 7'
--       CHECK (iso_class IN ('ISO 5', 'ISO 7')),
--     ALTER COLUMN hit_value    TYPE SMALLINT USING hit_value::SMALLINT,
--     ALTER COLUMN alert_level  TYPE SMALLINT USING alert_level::SMALLINT,
--     ALTER COLUMN action_level TYPE SMALLINT USING action_level::SMALLINT,
--     DROP CONSTRAINT IF EXISTS hit_details_hit_value_check,
--     ADD CONSTRAINT hit_details_hit_value_nonneg CHECK (hit_value >= 0);
