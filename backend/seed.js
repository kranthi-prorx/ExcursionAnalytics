/**
 * Seed script — inserts demo users and realistic sample data
 * Run: node backend/seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

const LOCATIONS = ['Left Gown','Right Gown','Left Sleeve','Right Sleeve','Left Finger','Right Finger'];
const PERSONNEL_TYPES = ['Filling','Crimping','Helper','Supervisor','Technician'];
const ISO_CLASSES = ['ISO 5','ISO 7'];
const ALERT_LEVELS = ['Normal','Alert','Action'];

const NAMES = [
  'Alice Johnson','Bob Martinez','Carol Williams','David Chen',
  'Emma Thompson','Frank Davis','Grace Kim','Henry Wilson',
  'Isabel Garcia','James Brown'
];
const LOTS = ['LOT-2024-001','LOT-2024-002','LOT-2024-003','LOT-2025-001','LOT-2025-002','BATCH-A01','BATCH-B02'];
const JOB_FUNCTIONS = ['Aseptic Fill','Visual Inspection','Crimping Operation','Gowning Check','Equipment Setup'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── Users ───────────────────────────────────────────────────────────────
    const adminHash   = await bcrypt.hash('WsxIjn@123', 10);

    const adminRes = await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Shiva', 'shiva@prorxpharma.com', $1, 'admin')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id
    `, [adminHash]);

    const adminId = adminRes.rows[0].id;

    // ─── Sample Records (90 days) ─────────────────────────────────────────────
    const now = new Date();
    for (let i = 0; i < 120; i++) {
      const daysAgo = randInt(0, 90);
      const ts = new Date(now);
      ts.setDate(ts.getDate() - daysAgo);
      ts.setHours(randInt(6, 18), randInt(0, 59));

      const isoClass    = rand(ISO_CLASSES);
      const alertLevel  = isoClass === 'ISO 5' ? 0 : rand([0, 2]);
      const actionLevel = isoClass === 'ISO 5' ? 1 : 4;

      const recRes = await client.query(`
        INSERT INTO records (name, lot_number, job_function, personnel_type, iso_class, alert_level, action_level, timestamp, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [rand(NAMES), rand(LOTS), rand(JOB_FUNCTIONS), rand(PERSONNEL_TYPES), isoClass, alertLevel, actionLevel, ts.toISOString(), adminId]);

      const recordId = recRes.rows[0].id;

      for (const loc of LOCATIONS) {
        const hit = Math.random() < 0.3 ? 1 : 0; // 30% hit probability
        const detAlert  = isoClass === 'ISO 5' ? 0 : rand([0, 2]);
        const detAction = isoClass === 'ISO 5' ? 1 : 4;
        await client.query(`
          INSERT INTO hit_details (record_id, location, hit_value, alert_level, action_level)
          VALUES ($1, $2, $3, $4, $5)
        `, [recordId, loc, hit, detAlert, detAction]);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Seed completed successfully!');
    console.log('   Admin:   shiva@prorxpharma.com   / WsxIjn@123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
