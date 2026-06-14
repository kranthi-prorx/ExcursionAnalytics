require('dotenv').config({ path: __dirname + '/../.env' });
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Connected to DB...');

    // List existing tables
    const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`);
    console.log('Existing tables:', tables.rows.map(r => r.tablename).join(', ') || '(none)');

    // Create viable_data
    await client.query(`
      CREATE TABLE IF NOT EXISTS viable_data (
        id               SERIAL PRIMARY KEY,
        lot_number       TEXT NOT NULL,
        sample_date      DATE NOT NULL,
        iso_class        TEXT NOT NULL DEFAULT 'ISO 7',
        iso5_cfu         INTEGER NOT NULL DEFAULT 0,
        iso7_cfu         INTEGER NOT NULL DEFAULT 0,
        particle_05um    NUMERIC(14,2) NOT NULL DEFAULT 0,
        particle_50um    NUMERIC(14,2) NOT NULL DEFAULT 0,
        deviation_number TEXT,
        notes            TEXT,
        created_by       UUID REFERENCES users(id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ viable_data table ready');

    // Ensure iso_class column exists (for tables created before this migration)
    await client.query(`ALTER TABLE viable_data ADD COLUMN IF NOT EXISTS iso_class TEXT NOT NULL DEFAULT 'ISO 7'`);
    console.log('✓ viable_data.iso_class column verified');

    // Create surface_sampling
    await client.query(`
      CREATE TABLE IF NOT EXISTS surface_sampling (
        id               SERIAL PRIMARY KEY,
        sample_location  TEXT NOT NULL,
        lot_number       TEXT NOT NULL,
        sample_date      DATE NOT NULL,
        iso_class        TEXT NOT NULL DEFAULT 'ISO 7',
        cfu_found        INTEGER NOT NULL DEFAULT 0,
        organism_id      TEXT,
        deviation_number TEXT,
        notes            TEXT,
        created_by       UUID REFERENCES users(id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✓ surface_sampling table ready');

    // Show final columns
    const vc = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'viable_data' ORDER BY ordinal_position`);
    console.log('viable_data columns:', vc.rows.map(r => r.column_name).join(', '));
    const sc = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'surface_sampling' ORDER BY ordinal_position`);
    console.log('surface_sampling columns:', sc.rows.map(r => r.column_name).join(', '));

    console.log('\n✅ Migration complete — both tables are ready!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
