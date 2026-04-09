const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

/**
 * ================= ADMIN CHAT INBOX =================
 * - Uses stored room_id directly (chat:{account_number})
 * - Prevents chat:undefined issues
 * - Safe for socket join_room
 */
router.get("/inbox", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        cr.room_id,
        cr.customer_name,
        cr.status,
        COUNT(
          CASE 
            WHEN cm.sender = 'CUSTOMER' AND cm.read = false 
            THEN 1 
          END
        ) AS unread_count,
        MAX(cm.created_at) AS last_message_time
      FROM chat_rooms cr
      LEFT JOIN chat_messages cm
        ON cm.room_id = cr.room_id
      WHERE cr.status IN ('BOT', 'OPEN', 'ASSIGNED')
      GROUP BY cr.room_id, cr.customer_name, cr.status
      ORDER BY last_message_time DESC NULLS LAST
    `);

    res.json(rows);
  } catch (err) {
    console.error("Inbox error:", err);
    res.status(500).json([]);
  }
});

module.exports = router;
