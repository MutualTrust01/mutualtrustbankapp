const pool = require('./db');

async function testTable() {
  try {
    const result = await pool.query('SELECT * FROM users'); // replace 'users' with your table name
    console.log('Table data:', result.rows);
  } catch (err) {
    console.error('Error accessing table:', err.message);
  } finally {
    pool.end();
  }
}

testTable();
