/**
 * run-schema.js — runs schema.sql + creates admin user on RDS
 * Usage: node run-schema.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const path = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'postgres',
  user:     process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('✅ Connected to RDS');

    // Run schema
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✅ Schema created (tables: users, records, hit_details)');

    // Check if admin exists
    const { rows } = await client.query("SELECT id FROM users WHERE email = 'shiva@prorxpharma.com'");
    if (rows.length) {
      console.log('ℹ️  Admin user already exists');
    } else {
      const hash = await bcrypt.hash('WsxIjn@123', 10);
      await client.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)",
        ['Shiva', 'shiva@prorxpharma.com', hash, 'admin']
      );
      console.log('✅ Admin user created: shiva@prorxpharma.com / WsxIjn@123');
    }

    console.log('\n🎉 Database ready!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
