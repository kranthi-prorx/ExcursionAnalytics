// Run SQL migration via Node.js pg pool
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node run-migration.js <path-to-sql>'); process.exit(1); }
  const sql = fs.readFileSync(path.resolve(file), 'utf8');
  console.log(`Running migration: ${file}`);
  try {
    await pool.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration error:', JSON.stringify({ message: err.message, detail: err.detail, hint: err.hint, code: err.code, position: err.position, severity: err.severity }));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
