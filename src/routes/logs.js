const router = require("express").Router();
const pool = require("../../db");

// Get Logs
router.get("/", async (req, res) => {
  const logs = await pool.query("SELECT * FROM system_logs ORDER BY id DESC");
  res.json(logs.rows);
});

module.exports = router;
