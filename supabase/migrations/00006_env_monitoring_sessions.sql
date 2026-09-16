-- ============================================================
--  Migration 00006 — Environmental Monitoring Sessions
--  Excursion Hit Analytics
--  Idempotent: safe to re-run.
-- ============================================================
--
-- Introduces:
--   env_location_profiles   — reusable, admin-created sample location profiles
--   env_monitoring_sessions — one session per monitoring activity
--   env_samples             — individual measurements within a session
--
-- Existing tables (viable_data, surface_sampling) are preserved unchanged.
-- Nullable FK columns are added to link historical rows when safely possible.
-- ============================================================

-- ─── 1. Environmental Location Profiles ─────────────────────────────────────
-- Created manually by admin/quality users. Never auto-seeded.
CREATE TABLE IF NOT EXISTS env_location_profiles (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_code       TEXT        NOT NULL,
  location_code_key   TEXT        NOT NULL,          -- normalized: NFC → trim → collapse → lower
  display_name        TEXT        NOT NULL,
  room_or_area        TEXT        NOT NULL,
  iso_class           TEXT        NOT NULL CHECK (iso_class IN ('ISO 5','ISO 7','ISO 8')),
  allowed_sample_types TEXT[]     NOT NULL DEFAULT '{VIABLE_AIR,NONVIABLE_AIR}',
  allowed_contexts    TEXT[]      NOT NULL DEFAULT '{BATCH,ROUTINE_MONTHLY,OTHER}',
  frequency           TEXT,                          -- descriptive only (Monthly, Weekly, Batch, etc.)
  active              BOOLEAN     NOT NULL DEFAULT true,
  notes               TEXT,
  created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique normalized location code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_env_location_code_key'
  ) THEN
    ALTER TABLE env_location_profiles
      ADD CONSTRAINT uq_env_location_code_key UNIQUE (location_code_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_elp_code_key    ON env_location_profiles(location_code_key);
CREATE INDEX IF NOT EXISTS idx_elp_iso_class   ON env_location_profiles(iso_class);
CREATE INDEX IF NOT EXISTS idx_elp_room        ON env_location_profiles(room_or_area);
CREATE INDEX IF NOT EXISTS idx_elp_active      ON env_location_profiles(active);

-- ─── 2. Environmental Monitoring Sessions ───────────────────────────────────
-- One session represents one monitoring activity for a specific date and area.
-- Session identity enforced by unique constraints below.
CREATE TABLE IF NOT EXISTS env_monitoring_sessions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoring_date     DATE        NOT NULL,
  monitoring_context  TEXT        NOT NULL CHECK (monitoring_context IN ('BATCH','ROUTINE_MONTHLY','ROUTINE_WEEKLY','OTHER')),
  room_or_area        TEXT,                           -- required for ROUTINE_MONTHLY / ROUTINE_WEEKLY
  batch_id            UUID        REFERENCES lot_profiles(id) ON DELETE RESTRICT,  -- nullable; only for BATCH + OTHER+batch
  custom_reason       TEXT,                           -- required when monitoring_context = 'OTHER'
  completion_status   TEXT        NOT NULL DEFAULT 'INCOMPLETE' CHECK (completion_status IN ('COMPLETE','INCOMPLETE')),
  missing_requirements TEXT[],                        -- list of missing measurement descriptions
  notes               TEXT,
  created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  deleted_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  deletion_reason     TEXT
);

-- Session identity constraints:
-- Routine sessions are uniquely scoped to context + date + room_or_area.
-- Batch sessions are uniquely scoped to context + date + batch_id.
-- 'OTHER' sessions have no uniqueness constraint (each is distinct).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_env_session_routine'
  ) THEN
    -- Routine sessions: unique per (context, date, room)
    -- Only enforced when context IN ('ROUTINE_MONTHLY','ROUTINE_WEEKLY')
    -- Using partial index + application-level enforcement for OTHER
    NULL; -- Handled by partial unique index below
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_env_session_routine
  ON env_monitoring_sessions(monitoring_context, monitoring_date, room_or_area)
  WHERE monitoring_context IN ('ROUTINE_MONTHLY','ROUTINE_WEEKLY')
    AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_env_session_batch
  ON env_monitoring_sessions(monitoring_context, monitoring_date, batch_id)
  WHERE monitoring_context = 'BATCH'
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ems_monitoring_date    ON env_monitoring_sessions(monitoring_date DESC);
CREATE INDEX IF NOT EXISTS idx_ems_context            ON env_monitoring_sessions(monitoring_context);
CREATE INDEX IF NOT EXISTS idx_ems_batch_id           ON env_monitoring_sessions(batch_id);
CREATE INDEX IF NOT EXISTS idx_ems_room               ON env_monitoring_sessions(room_or_area);
CREATE INDEX IF NOT EXISTS idx_ems_completion         ON env_monitoring_sessions(completion_status);
CREATE INDEX IF NOT EXISTS idx_ems_deleted_at         ON env_monitoring_sessions(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ems_created_by         ON env_monitoring_sessions(created_by);

-- ─── 3. Environmental Samples ────────────────────────────────────────────────
-- Each row is one measurement within a monitoring session.
-- sample_type determines which measurement fields are applicable.
-- Missing measurements are stored as NULL — never as 0.
CREATE TABLE IF NOT EXISTS env_samples (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL REFERENCES env_monitoring_sessions(id) ON DELETE RESTRICT,
  location_profile_id   UUID        REFERENCES env_location_profiles(id) ON DELETE RESTRICT,
  -- Fallback text location for legacy/freeform entry when no profile exists
  sample_location_text  TEXT,
  sample_type           TEXT        NOT NULL CHECK (sample_type IN ('VIABLE_AIR','NONVIABLE_AIR','SURFACE')),
  iso_class             TEXT        NOT NULL CHECK (iso_class IN ('ISO 5','ISO 7','ISO 8')),
  -- Viable Air: viable_cfu only (particle counts not applicable)
  viable_cfu            INTEGER     CHECK (viable_cfu >= 0),
  -- Surface: surface_cfu only
  surface_cfu           INTEGER     CHECK (surface_cfu >= 0),
  -- Nonviable Air: two independent particle sizes
  particle_count_0_5    NUMERIC(14,2) CHECK (particle_count_0_5 >= 0),
  particle_count_5_0    NUMERIC(14,2) CHECK (particle_count_5_0 >= 0),
  -- Backend-derived result status (never trusted from frontend)
  status_viable         TEXT        CHECK (status_viable IN ('NORMAL','ALERT','ACTION')),
  status_0_5            TEXT        CHECK (status_0_5 IN ('NORMAL','ALERT','ACTION')),
  status_5_0            TEXT        CHECK (status_5_0 IN ('NORMAL','ALERT','ACTION')),
  -- Overall worst status for this sample (for quick filtering)
  status                TEXT        CHECK (status IN ('NORMAL','ALERT','ACTION')),
  -- Optional metadata
  organism_id           TEXT,
  deviation_number      TEXT,
  notes                 TEXT,
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  deleted_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  deletion_reason       TEXT
);

CREATE INDEX IF NOT EXISTS idx_es_session_id          ON env_samples(session_id);
CREATE INDEX IF NOT EXISTS idx_es_location_profile_id ON env_samples(location_profile_id);
CREATE INDEX IF NOT EXISTS idx_es_sample_type         ON env_samples(sample_type);
CREATE INDEX IF NOT EXISTS idx_es_iso_class           ON env_samples(iso_class);
CREATE INDEX IF NOT EXISTS idx_es_status              ON env_samples(status);
CREATE INDEX IF NOT EXISTS idx_es_deleted_at          ON env_samples(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_es_created_by          ON env_samples(created_by);

-- Composite index for analytics: session → iso_class → sample_type
CREATE INDEX IF NOT EXISTS idx_es_session_iso_type
  ON env_samples(session_id, iso_class, sample_type)
  WHERE deleted_at IS NULL;

-- ─── 4. Add nullable FK columns to existing tables for gradual association ───
-- These are nullable — existing rows without a session remain valid.
-- Historical records are NEVER deleted or re-seeded.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'viable_data') THEN
    ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES env_monitoring_sessions(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'surface_sampling') THEN
    ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES env_monitoring_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_viable_session_id  ON viable_data(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_surface_session_id ON surface_sampling(session_id) WHERE session_id IS NOT NULL;

-- ─── 5. Performance indexes for analytics queries ────────────────────────────
-- Joint index: date + context for session listing
CREATE INDEX IF NOT EXISTS idx_ems_date_context
  ON env_monitoring_sessions(monitoring_date DESC, monitoring_context)
  WHERE deleted_at IS NULL;

-- Joint index for sample analytics
CREATE INDEX IF NOT EXISTS idx_es_type_iso_class
  ON env_samples(sample_type, iso_class)
  WHERE deleted_at IS NULL;
