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

async function migrate() {
  const client = await pool.connect();
  try {
    // Add hit_date column if missing (queries use r.hit_date, schema has timestamp)
    await client.query(`
      ALTER TABLE records 
      ADD COLUMN IF NOT EXISTS hit_date DATE NOT NULL DEFAULT CURRENT_DATE
    `);
    console.log('✅ hit_date column added/exists');

    // Backfill from timestamp
    await client.query(`
      UPDATE records SET hit_date = timestamp::date WHERE hit_date = CURRENT_DATE AND timestamp IS NOT NULL
    `);
    console.log('✅ Backfilled hit_date from timestamp');

    // Show all columns
    const { rows } = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='records' ORDER BY ordinal_position"
    );
    console.log('\nrecords table columns:');
    rows.forEach(r => console.log(' -', r.column_name, ':', r.data_type));

    console.log('\n🎉 Migration complete!');
  } catch (err) {
    console.error('❌', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
