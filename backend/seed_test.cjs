require('dotenv').config({ path: './backend/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create test user
    const res = await client.query(`
      INSERT INTO users (name, email, password_hash, role) 
      VALUES ('Test User', 'test@test.com', 'hash', 'admin') 
      ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id
    `);
    const userId = res.rows[0].id;

    // Helper to insert record
    async function insertRecord(date, lot, hits) {
      const rec = await client.query(`
        INSERT INTO records (name, lot_number, personnel_type, iso_class, alert_level, action_level, date_of_batch, created_by, name_key, lot_number_key)
        VALUES ('Test Person', $1, 'Filling', 'ISO 5', 1, 3, $2, $3, 'test_person', lower($1))
        RETURNING id
      `, [lot, date, userId]);
      
      const recordId = rec.rows[0].id;
      
      if (hits > 0) {
        await client.query(`
          INSERT INTO hit_details (record_id, location, hit_value, alert_level, action_level, iso_class)
          VALUES ($1, 'Left Fingertip', $2, 1, 3, 'ISO 5')
        `, [recordId, hits]);
      } else {
        await client.query(`
          INSERT INTO hit_details (record_id, location, hit_value, alert_level, action_level, iso_class)
          VALUES ($1, 'Left Fingertip', 0, 1, 3, 'ISO 5')
        `, [recordId]);
      }
    }

    // Clear old data for test
    await client.query('DELETE FROM hit_details');
    await client.query('DELETE FROM records');

    // Jan 1: 4 batches, 4 total hits, average 1.00
    await insertRecord('2026-01-01', 'LOT-101', 1);
    await insertRecord('2026-01-01', 'LOT-102', 1);
    await insertRecord('2026-01-01', 'LOT-103', 2);
    await insertRecord('2026-01-01', 'LOT-104', 0); // Total: 4 batches, hits: 1+1+2+0 = 4. Avg: 1.00

    // Jan 2: 1 batch, 1 total hit, average 1.00
    await insertRecord('2026-01-02', 'LOT-201', 1);

    // Jan 3: 1 batch, 0 total hits, average 0.00
    await insertRecord('2026-01-03', 'LOT-301', 0);

    // Jan 4: 2 batches, 1 total hit, average 0.50
    await insertRecord('2026-01-04', 'LOT-401', 1);
    await insertRecord('2026-01-04', 'LOT-402', 0);

    await client.query('COMMIT');
    console.log('Seed successful');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
