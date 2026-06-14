/**
 * Demo seed — inserts realistic excursion records for dashboard demonstration.
 * All records have lot_number prefixed with "DEMO-" for easy bulk deletion:
 *   DELETE FROM records WHERE lot_number LIKE 'DEMO-%';
 *
 * Run from the backend/ directory:
 *   node seed_demo.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('./db');

// ── Config ────────────────────────────────────────────────────────────────────
const NAMES = [
  'Alice Johnson', 'Bob Martinez', 'Carol Williams', 'David Chen',
  'Emma Thompson', 'Frank Davis',  'Grace Kim',      'Henry Wilson',
  'Isabel Garcia', 'James Brown',
];

const LOTS = [
  'DEMO-LOT-2025-001', 'DEMO-LOT-2025-002', 'DEMO-LOT-2025-003',
  'DEMO-BATCH-A01',    'DEMO-BATCH-B02',    'DEMO-BATCH-C03',
];

const JOB_FUNCTIONS = [
  'Aseptic Fill', 'Visual Inspection', 'Crimping Operation',
  'Gowning Check', 'Equipment Setup',
];

const PERSONNEL_TYPES = ['Filling', 'Crimping'];

// Locations per personnel type (matches getLocationsForPersonnelType in types/index.ts)
const LOCATIONS_BY_TYPE = {
  Filling:  ['Left Gown', 'Right Gown', 'Left Sleeve', 'Right Sleeve', 'Left Finger', 'Right Finger'],
  Crimping: ['Left Finger', 'Right Finger'],
};

// ISO class + thresholds per location per type (matches getLocationConfig)
function getLocCfg(personnelType, location) {
  if (personnelType === 'Filling') {
    if (location === 'Left Finger' || location === 'Right Finger') {
      return { iso_class: 'ISO 5', alertLevel: 0, actionLevel: 1 };
    }
    return { iso_class: 'ISO 7', alertLevel: 0, actionLevel: 4 };
  }
  // Crimping — ISO 7 everywhere
  return { iso_class: 'ISO 7', alertLevel: 2, actionLevel: 4 };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rand(arr)         { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

/** Returns a YYYY-MM-DD date string for `daysAgo` days before today */
function daysAgoDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ── Seed ──────────────────────────────────────────────────────────────────────
async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Ensure all demo users exist ───────────────────────────────────────────
    const adminHash   = await bcrypt.hash('Admin@ProRx2026!',   10);
    const managerHash = await bcrypt.hash('Manager@ProRx2026!', 10);
    const userHash    = await bcrypt.hash('User@ProRx2026!',    10);

    const adminRes = await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Administrator', 'admin@prorxpharma.com', $1, 'admin')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id
    `, [adminHash]);
    const adminId = adminRes.rows[0].id;

    await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Jane Manager', 'manager@prorxpharma.com', $1, 'manager')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, [managerHash]);

    await client.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('John User', 'user@prorxpharma.com', $1, 'user')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, [userHash]);

    // ── Build 80 demo records spread over the last 60 days ───────────────────
    let recordsInserted = 0;
    let detailsInserted = 0;

    // Track assigned personnel_type per (name, lot) to enforce the business rule:
    // a person cannot switch roles on the same batch.
    const personLotType = {};

    for (let i = 0; i < 80; i++) {
      const daysAgo     = randInt(0, 60);
      const hitDate     = daysAgoDate(daysAgo);
      const name        = rand(NAMES);
      const lot         = rand(LOTS);
      const jobFunction = rand(JOB_FUNCTIONS);

      // Enforce consistent personnel_type per (name, lot)
      const key = `${name}|${lot}`;
      if (!personLotType[key]) {
        personLotType[key] = rand(PERSONNEL_TYPES);
      }
      const personnelType = personLotType[key];

      // Locations and ISO class are fully derived from personnelType (no random ISO)
      const locations = LOCATIONS_BY_TYPE[personnelType];

      const hitDetails = locations.map(loc => {
        const cfg = getLocCfg(personnelType, loc);

        // Weighted hit distribution: mostly 0, occasional 1-2, rare 3+
        let hitValue = 0;
        const r = Math.random();
        if      (r < 0.55) hitValue = 0;
        else if (r < 0.75) hitValue = 1;
        else if (r < 0.88) hitValue = 2;
        else if (r < 0.95) hitValue = 3;
        else               hitValue = randInt(4, 6);

        return { location: loc, iso_class: cfg.iso_class, hitValue, alertLevel: cfg.alertLevel, actionLevel: cfg.actionLevel };
      });

      // Record-level aggregates
      const dominantIso    = hitDetails.some(h => h.iso_class === 'ISO 5') ? 'ISO 5' : 'ISO 7';
      const recAlertLevel  = Math.min(...hitDetails.map(h => h.alertLevel));
      const recActionLevel = Math.max(...hitDetails.map(h => h.actionLevel));

      const recRes = await client.query(`
        INSERT INTO records
          (name, lot_number, job_function, personnel_type, iso_class,
           alert_level, action_level, hit_date, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id
      `, [name, lot, jobFunction, personnelType, dominantIso,
          recAlertLevel, recActionLevel, hitDate, adminId]);

      const recordId = recRes.rows[0].id;
      recordsInserted++;

      for (const hd of hitDetails) {
        await client.query(`
          INSERT INTO hit_details
            (record_id, location, iso_class, hit_value, alert_level, action_level)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [recordId, hd.location, hd.iso_class, hd.hitValue, hd.alertLevel, hd.actionLevel]);
        detailsInserted++;
      }
    }

    await client.query('COMMIT');

    console.log('✅ Demo seed completed!');
    console.log(`   Records inserted : ${recordsInserted}`);
    console.log(`   Hit details rows : ${detailsInserted}`);
    console.log('');
    console.log('   Demo credentials:');
    console.log('   Admin:   admin@prorxpharma.com   / Admin@ProRx2026!');
    console.log('   Manager: manager@prorxpharma.com / Manager@ProRx2026!');
    console.log('   User:    user@prorxpharma.com    / User@ProRx2026!');
    console.log('');
    console.log('   To remove ALL demo records later:');
    console.log("   DELETE FROM records WHERE lot_number LIKE 'DEMO-%';");

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
