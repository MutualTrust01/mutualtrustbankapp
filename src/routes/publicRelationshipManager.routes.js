const express = require("express");
const router = express.Router();
const pool = require("../../db");

/**
 * GET ALL RELATIONSHIP MANAGERS
 * URL: /api/loans/public/relationship-managers
 */
router.get("/relationship-managers", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, first_name, last_name, designation, phone_number
      FROM users
      WHERE COALESCE(LOWER(staff_status), 'active') != 'inactive'
      ORDER BY first_name ASC
    `);

    res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error("❌ Public RM list failed:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * GET SINGLE RELATIONSHIP MANAGER
 * URL: /api/loans/public/relationship-manager/:id
 */
router.get("/relationship-manager/:id", async (req, res) => {
  

const rawId = req.params.id;

// 🔥 Prevent "product" or invalid values
if (!rawId || isNaN(Number(rawId))) {
  return res.status(404).json({
    success: false,
    message: "Invalid relationship manager ID",
  });
}

const staffId = Number(rawId);
  try {
   const { rows } = await pool.query(
  `
  SELECT id, first_name, last_name, designation, phone_number
  FROM users
  WHERE id = $1
    AND COALESCE(LOWER(staff_status), 'active') != 'inactive'
  LIMIT 1
  `,
  [staffId]
);
    if (!rows.length) {
      return res.status(404).json({
        message: "Relationship manager not found or inactive",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (err) {
    console.error("❌ Public RM lookup failed:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;
