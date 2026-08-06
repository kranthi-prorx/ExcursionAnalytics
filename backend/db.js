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
