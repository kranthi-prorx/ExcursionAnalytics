require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('Creating viable_data table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS viable_data (
        id               SERIAL PRIMARY KEY,
        lot_number       TEXT NOT NULL,
        sample_date      DATE NOT NULL,
        iso_class        TEXT NOT NULL DEFAULT 'ISO 7',
        room_number      TEXT,
        iso5_cfu         SMALLINT NOT NULL DEFAULT 0,
        iso7_cfu         SMALLINT NOT NULL DEFAULT 0,
        particle_05um    NUMERIC(12,2) NOT NULL DEFAULT 0,
        particle_50um    NUMERIC(12,2) NOT NULL DEFAULT 0,
        deviation_number TEXT,
        notes            TEXT,
        created_by       UUID REFERENCES users(id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ viable_data created');

    console.log('Creating surface_sampling table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS surface_sampling (
        id               SERIAL PRIMARY KEY,
        sample_location  TEXT NOT NULL,
        lot_number       TEXT NOT NULL,
        sample_date      DATE NOT NULL,
        iso_class        TEXT NOT NULL DEFAULT 'ISO 7',
        cfu_found        SMALLINT NOT NULL DEFAULT 0,
        organism_id      TEXT,
        deviation_number TEXT,
        notes            TEXT,
        created_by       UUID REFERENCES users(id),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ surface_sampling created');

    // List all tables
    const { rows } = await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    );
    console.log('\nAll tables:', rows.map(r => r.tablename).join(', '));
    console.log('\n🎉 All tables ready!');
  } catch (err) {
    console.error('❌', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
