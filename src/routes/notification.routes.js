const express = require("express");
const router = express.Router();
const pool = require("../../db");

/**
 * =====================================================
 * NOTIFICATION ROUTES
 * Supports:
 * - Fetch unread notifications
 * - Fetch all notifications (paginated)
 * - Mark single notification as read
 * - Mark all as read
 * =====================================================
 */


/* =====================================================
   GET UNREAD NOTIFICATIONS
   ===================================================== */
router.get("/unread", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM notifications
      WHERE is_read = false
      ORDER BY created_at DESC
      LIMIT 20
      `
    );

    res.json({
      success: true,
      count: result.rows.length,
      notifications: result.rows,
    });

  } catch (err) {
    console.error("❌ Fetch unread notifications error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch unread notifications",
    });
  }
});


/* =====================================================
   GET ALL NOTIFICATIONS (OPTIONAL PAGINATION)
   ===================================================== */
router.get("/", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;

    const result = await pool.query(
      `
      SELECT *
      FROM notifications
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
      `,
      [limit, offset]
    );

    res.json({
      success: true,
      notifications: result.rows,
    });

  } catch (err) {
    console.error("❌ Fetch notifications error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
});


/* =====================================================
   MARK SINGLE NOTIFICATION AS READ
   ===================================================== */
router.patch("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1
      `,
      [id]
    );

    res.json({
      success: true,
      message: "Notification marked as read",
    });

  } catch (err) {
    console.error("❌ Mark notification read error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update notification",
    });
  }
});


/* =====================================================
   MARK ALL NOTIFICATIONS AS READ
   ===================================================== */
router.patch("/mark-all-read", async (req, res) => {
  try {
    await pool.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE is_read = false
      `
    );

    res.json({
      success: true,
      message: "All notifications marked as read",
    });

  } catch (err) {
    console.error("❌ Mark all notifications read error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update notifications",
    });
  }
});


module.exports = router;
