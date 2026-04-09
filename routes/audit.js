const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

router.get("/logs", auth, async (req, res) => {
  try {
    // ✅ enforce Super Admin
    const roleRes = await pool.query(
      "SELECT name FROM roles WHERE id=$1",
      [req.user.role_id]
    );

    if (roleRes.rows[0]?.name !== "Super Admin") {
      return res.status(403).json([]);
    }

    const sql = `
      SELECT
        a.id,
        a.actor_type,
        a.actor_id,
        a.action,
        a.status,
        a.description,
        a.ip_address,
        a.user_agent,
        a.target_id,
        a.target_type,
        a.created_at,
        CASE
          WHEN a.actor_type = 'admin_user'
            THEN u.first_name || ' ' || u.last_name
          WHEN a.actor_type = 'system'
            THEN 'System'
          ELSE 'Unknown Actor'
        END AS actor_name
      FROM audit_logs a
      LEFT JOIN users u
        ON u.id = a.actor_id
       AND a.actor_type = 'admin_user'
      ORDER BY a.created_at DESC;
    `;

    const result = await pool.query(sql);
    res.json(result.rows); // 🔥 KEEP THIS FORMAT

  } catch (err) {
    console.error("❌ Audit fetch error:", err);
    res.status(500).json([]);
  }
});

module.exports = router;
