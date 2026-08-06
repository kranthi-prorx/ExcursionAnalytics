const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:ProRxRDS2024!@ataglance-db.cpay4oy22ddg.us-east-2.rds.amazonaws.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
async function run() {
  const query = `
    UPDATE records r
    SET iso_class = (
      SELECT CASE
        WHEN EXISTS(SELECT 1 FROM hit_details hd WHERE hd.record_id = r.id AND hd.iso_class = 'ISO 5' AND hd.hit_value > 0) THEN 'ISO 5'
        WHEN EXISTS(SELECT 1 FROM hit_details hd WHERE hd.record_id = r.id AND hd.iso_class = 'ISO 7' AND hd.hit_value > 0) THEN 'ISO 7'
        ELSE r.iso_class
      END
    )
    WHERE EXISTS (SELECT 1 FROM hit_details hd WHERE hd.record_id = r.id AND hd.hit_value > 0)
    RETURNING id, name, iso_class;
  `;
  const res = await pool.query(query);
  console.log('Updated rows:', res.rowCount);
  console.table(res.rows);
  pool.end();
}
run().catch(console.error);
