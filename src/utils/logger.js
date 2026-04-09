const pool = require("../../db");

async function logEvent(event_type, message, details = null) {
  try {
   await pool.query(
  `INSERT INTO system_logs (event_type, message, details)
   VALUES ($1,$2,$3::jsonb)`,
  [event_type, message, details ? JSON.stringify(details) : null]
);

  } catch (err) {
    console.error("❌ Failed to write log:", err.message);
  }
}

module.exports = { logEvent };
