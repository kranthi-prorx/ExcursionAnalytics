const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'excursion_analytics',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  // SSL is required for AWS RDS; disabled for local Docker
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error:', err);
});

/**
 * Run all schema migrations idempotently.
 * Called at startup BEFORE the server begins listening.
 * Every ALTER is IF NOT EXISTS / conditional so re-running is safe.
 */
async function runMigrations() {
  const client = await pool.connect();
  try {
    // 1. Rename hit_date → date_of_batch (if not already done)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'records' AND column_name = 'hit_date'
        ) THEN
          ALTER TABLE records RENAME COLUMN hit_date TO date_of_batch;
        END IF;

        IF EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'idx_records_hit_date'
        ) THEN
          ALTER INDEX idx_records_hit_date RENAME TO idx_records_date_of_batch;
        END IF;
      END $$;
    `);
    console.log('[db] date_of_batch migration checked');

    // 2. Add name_key column if missing
    await client.query(`
      ALTER TABLE records ADD COLUMN IF NOT EXISTS name_key TEXT;
    `);

    // 3. Add lot_number_key column if missing
    await client.query(`
      ALTER TABLE records ADD COLUMN IF NOT EXISTS lot_number_key TEXT;
    `);

    // 4. Add personnel_id / lot_id FK columns if missing
    await client.query(`
      ALTER TABLE records ADD COLUMN IF NOT EXISTS personnel_id UUID;
      ALTER TABLE records ADD COLUMN IF NOT EXISTS lot_id UUID;
    `);

    // 5. Backfill name_key where NULL
    await client.query(`
      UPDATE records
      SET name_key = LOWER(TRIM(REGEXP_REPLACE(name, '\\s+', ' ', 'g')))
      WHERE name_key IS NULL AND name IS NOT NULL;
    `);

    // 6. Backfill lot_number_key where NULL
    await client.query(`
      UPDATE records
      SET lot_number_key = LOWER(TRIM(REGEXP_REPLACE(lot_number, '\\s+', ' ', 'g')))
      WHERE lot_number_key IS NULL AND lot_number IS NOT NULL;
    `);

    console.log('[db] Schema migrations complete');

    // ── M-7: Soft-delete columns on records ────────────────────────────────────
    await client.query(`
      ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
      ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE records ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_records_deleted_at
        ON records(deleted_at) WHERE deleted_at IS NULL;
    `);
    console.log('[db] M-7: records soft-delete columns OK');

    // ── M-8: Soft-delete columns on viable_data ─────────────────────────────────
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'viable_data') THEN
          ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
          ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL;
          ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
        END IF;
      END $$;
    `);
    console.log('[db] M-8: viable_data soft-delete columns OK');

    // ── M-9: Soft-delete columns on surface_sampling ────────────────────────────
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'surface_sampling') THEN
          ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
          ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL;
          ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
        END IF;
      END $$;
    `);
    console.log('[db] M-9: surface_sampling soft-delete columns OK');

    // ── M-10: Soft-delete columns on processed_batches ──────────────────────────
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'processed_batches') THEN
          ALTER TABLE processed_batches ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;
          ALTER TABLE processed_batches ADD COLUMN IF NOT EXISTS deleted_by      UUID REFERENCES users(id) ON DELETE SET NULL;
          ALTER TABLE processed_batches ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
        END IF;
      END $$;
    `);
    console.log('[db] M-10: processed_batches soft-delete columns OK');

    // ── M-11: audit_logs table (append-only) ────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action_type     VARCHAR(20) NOT NULL CHECK (action_type IN ('CREATE','UPDATE','DELETE','RESTORE')),
        entity_type     VARCHAR(40) NOT NULL,
        entity_id       TEXT        NOT NULL,
        actor_user_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
        actor_name      TEXT        NOT NULL,
        actor_email     TEXT        NOT NULL,
        actor_role      VARCHAR(20) NOT NULL,
        occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deletion_reason TEXT,
        before_values   JSONB,
        after_values    JSONB,
        changed_fields  TEXT[],
        personnel_name  TEXT,
        batch_number    TEXT,
        date_of_batch   DATE,
        request_id      TEXT
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_occurred_at  ON audit_logs(occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_actor        ON audit_logs(actor_user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action_type  ON audit_logs(action_type);
      CREATE INDEX IF NOT EXISTS idx_audit_entity_type  ON audit_logs(entity_type);
      CREATE INDEX IF NOT EXISTS idx_audit_entity_id    ON audit_logs(entity_id);
    `);
    console.log('[db] M-11: audit_logs table OK');

    // ── M-12: Environmental Monitoring Tables ──────────────────────────────────
    // env_location_profiles — admin-created, reusable sample location profiles
    await client.query(`
      CREATE TABLE IF NOT EXISTS env_location_profiles (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        location_code       TEXT        NOT NULL,
        location_code_key   TEXT        NOT NULL,
        display_name        TEXT        NOT NULL,
        room_or_area        TEXT        NOT NULL,
        iso_class           TEXT        NOT NULL CHECK (iso_class IN ('ISO 5','ISO 7','ISO 8')),
        allowed_sample_types TEXT[]     NOT NULL DEFAULT '{VIABLE_AIR,NONVIABLE_AIR}',
        allowed_contexts    TEXT[]      NOT NULL DEFAULT '{BATCH,ROUTINE_MONTHLY,OTHER}',
        frequency           TEXT,
        active              BOOLEAN     NOT NULL DEFAULT true,
        notes               TEXT,
        created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_env_location_code_key') THEN
          ALTER TABLE env_location_profiles ADD CONSTRAINT uq_env_location_code_key UNIQUE (location_code_key);
        END IF;
      END $$
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_elp_code_key  ON env_location_profiles(location_code_key);
      CREATE INDEX IF NOT EXISTS idx_elp_iso_class ON env_location_profiles(iso_class);
      CREATE INDEX IF NOT EXISTS idx_elp_room      ON env_location_profiles(room_or_area);
      CREATE INDEX IF NOT EXISTS idx_elp_active    ON env_location_profiles(active);
    `);
    console.log('[db] M-12a: env_location_profiles OK');

    // env_monitoring_sessions
    await client.query(`
      CREATE TABLE IF NOT EXISTS env_monitoring_sessions (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        monitoring_date     DATE        NOT NULL,
        monitoring_context  TEXT        NOT NULL CHECK (monitoring_context IN ('BATCH','ROUTINE_MONTHLY','ROUTINE_WEEKLY','OTHER')),
        room_or_area        TEXT,
        batch_id            UUID        REFERENCES lot_profiles(id) ON DELETE RESTRICT,
        custom_reason       TEXT,
        completion_status   TEXT        NOT NULL DEFAULT 'INCOMPLETE' CHECK (completion_status IN ('COMPLETE','INCOMPLETE')),
        missing_requirements TEXT[],
        notes               TEXT,
        created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at          TIMESTAMPTZ,
        deleted_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
        deletion_reason     TEXT
      )
    `);
    // Partial unique indexes for routine session identity
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_env_session_routine
        ON env_monitoring_sessions(monitoring_context, monitoring_date, room_or_area)
        WHERE monitoring_context IN ('ROUTINE_MONTHLY','ROUTINE_WEEKLY') AND deleted_at IS NULL
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_env_session_batch
        ON env_monitoring_sessions(monitoring_context, monitoring_date, batch_id)
        WHERE monitoring_context = 'BATCH' AND deleted_at IS NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ems_monitoring_date ON env_monitoring_sessions(monitoring_date DESC);
      CREATE INDEX IF NOT EXISTS idx_ems_context         ON env_monitoring_sessions(monitoring_context);
      CREATE INDEX IF NOT EXISTS idx_ems_batch_id        ON env_monitoring_sessions(batch_id);
      CREATE INDEX IF NOT EXISTS idx_ems_room            ON env_monitoring_sessions(room_or_area);
      CREATE INDEX IF NOT EXISTS idx_ems_completion      ON env_monitoring_sessions(completion_status);
      CREATE INDEX IF NOT EXISTS idx_ems_deleted_at      ON env_monitoring_sessions(deleted_at) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_ems_created_by      ON env_monitoring_sessions(created_by);
      CREATE INDEX IF NOT EXISTS idx_ems_date_context    ON env_monitoring_sessions(monitoring_date DESC, monitoring_context) WHERE deleted_at IS NULL;
    `);
    console.log('[db] M-12b: env_monitoring_sessions OK');

    // env_samples
    await client.query(`
      CREATE TABLE IF NOT EXISTS env_samples (
        id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id            UUID        NOT NULL REFERENCES env_monitoring_sessions(id) ON DELETE RESTRICT,
        location_profile_id   UUID        REFERENCES env_location_profiles(id) ON DELETE RESTRICT,
        sample_location_text  TEXT,
        sample_type           TEXT        NOT NULL CHECK (sample_type IN ('VIABLE_AIR','NONVIABLE_AIR','SURFACE')),
        iso_class             TEXT        NOT NULL CHECK (iso_class IN ('ISO 5','ISO 7','ISO 8')),
        viable_cfu            INTEGER     CHECK (viable_cfu >= 0),
        surface_cfu           INTEGER     CHECK (surface_cfu >= 0),
        particle_count_0_5    NUMERIC(14,2) CHECK (particle_count_0_5 >= 0),
        particle_count_5_0    NUMERIC(14,2) CHECK (particle_count_5_0 >= 0),
        status_viable         TEXT        CHECK (status_viable IN ('NORMAL','ALERT','ACTION')),
        status_0_5            TEXT        CHECK (status_0_5 IN ('NORMAL','ALERT','ACTION')),
        status_5_0            TEXT        CHECK (status_5_0 IN ('NORMAL','ALERT','ACTION')),
        status                TEXT        CHECK (status IN ('NORMAL','ALERT','ACTION')),
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
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_es_session_id          ON env_samples(session_id);
      CREATE INDEX IF NOT EXISTS idx_es_location_profile_id ON env_samples(location_profile_id);
      CREATE INDEX IF NOT EXISTS idx_es_sample_type         ON env_samples(sample_type);
      CREATE INDEX IF NOT EXISTS idx_es_iso_class           ON env_samples(iso_class);
      CREATE INDEX IF NOT EXISTS idx_es_status              ON env_samples(status);
      CREATE INDEX IF NOT EXISTS idx_es_deleted_at          ON env_samples(deleted_at) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_es_created_by          ON env_samples(created_by);
      CREATE INDEX IF NOT EXISTS idx_es_session_iso_type    ON env_samples(session_id, iso_class, sample_type) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_es_type_iso_class      ON env_samples(sample_type, iso_class) WHERE deleted_at IS NULL;
    `);
    console.log('[db] M-12c: env_samples OK');

    // Add nullable FK columns to existing tables (non-destructive, idempotent)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'viable_data') THEN
          ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES env_monitoring_sessions(id) ON DELETE SET NULL;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'surface_sampling') THEN
          ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES env_monitoring_sessions(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_viable_session_id  ON viable_data(session_id) WHERE session_id IS NOT NULL;
    `).catch(() => {}); // ignore if viable_data doesn't exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_surface_session_id ON surface_sampling(session_id) WHERE session_id IS NOT NULL;
    `).catch(() => {}); // ignore if surface_sampling doesn't exist
    console.log('[db] M-12d: FK columns on viable_data / surface_sampling OK');
    console.log('[db] M-12: All environmental monitoring tables OK');

    // ── M-13: Add monitoring context columns to viable_data & surface_sampling ──
    await client.query(`
      DO $$
      BEGIN
        -- viable_data: monitoring context + lot FK + location profile FK + sample location
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'viable_data') THEN
          ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS monitoring_context TEXT NOT NULL DEFAULT 'BATCH';
          ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES lot_profiles(id) ON DELETE SET NULL;
          ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS location_profile_id UUID REFERENCES env_location_profiles(id) ON DELETE SET NULL;
          ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS sample_location TEXT;
          ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS sample_type TEXT NOT NULL DEFAULT 'VIABLE_AIR';
          -- Allow lot_number to be NULL (routine monthly has no lot)
          ALTER TABLE viable_data ALTER COLUMN lot_number DROP NOT NULL;
          ALTER TABLE viable_data ALTER COLUMN lot_number SET DEFAULT NULL;
          -- Allow iso_class-specific CFU fields to be NULL (not-collected ≠ 0)
          ALTER TABLE viable_data ALTER COLUMN iso5_cfu DROP NOT NULL;
          ALTER TABLE viable_data ALTER COLUMN iso5_cfu DROP DEFAULT;
          ALTER TABLE viable_data ALTER COLUMN iso7_cfu DROP NOT NULL;
          ALTER TABLE viable_data ALTER COLUMN iso7_cfu DROP DEFAULT;
          ALTER TABLE viable_data ALTER COLUMN iso8_cfu DROP NOT NULL;
          ALTER TABLE viable_data ALTER COLUMN iso8_cfu DROP DEFAULT;
          ALTER TABLE viable_data ALTER COLUMN particle_05um DROP NOT NULL;
          ALTER TABLE viable_data ALTER COLUMN particle_05um DROP DEFAULT;
          ALTER TABLE viable_data ALTER COLUMN particle_50um DROP NOT NULL;
          ALTER TABLE viable_data ALTER COLUMN particle_50um DROP DEFAULT;
        END IF;

        -- surface_sampling: monitoring context + lot FK + location profile FK + room_area
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'surface_sampling') THEN
          ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS monitoring_context TEXT NOT NULL DEFAULT 'BATCH';
          ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES lot_profiles(id) ON DELETE SET NULL;
          ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS location_profile_id UUID REFERENCES env_location_profiles(id) ON DELETE SET NULL;
          ALTER TABLE surface_sampling ADD COLUMN IF NOT EXISTS room_area TEXT;
          -- Allow lot_number to be NULL (routine weekly has no lot)
          ALTER TABLE surface_sampling ALTER COLUMN lot_number DROP NOT NULL;
          ALTER TABLE surface_sampling ALTER COLUMN lot_number SET DEFAULT NULL;
          -- Allow cfu_found to be NULL (not-collected)
          ALTER TABLE surface_sampling ALTER COLUMN cfu_found DROP NOT NULL;
          ALTER TABLE surface_sampling ALTER COLUMN cfu_found DROP DEFAULT;
        END IF;
      END $$
    `).catch(err => console.warn('[db] M-13 partial:', err.message));
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_viable_monitoring_context ON viable_data(monitoring_context) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_viable_lot_id             ON viable_data(lot_id) WHERE lot_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_surface_monitoring_context ON surface_sampling(monitoring_context) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_surface_lot_id            ON surface_sampling(lot_id) WHERE lot_id IS NOT NULL;
    `).catch(() => {});
    console.log('[db] M-13: monitoring context columns on viable_data / surface_sampling OK');

  } catch (err) {
    console.error('[db] Migration error:', err.message);
    // Don't crash — the app can still partially work
  } finally {
    client.release();
  }
}

// Run migrations immediately and export the promise so server.js can await it
const migrationReady = runMigrations();

module.exports = pool;
module.exports.migrationReady = migrationReady;
