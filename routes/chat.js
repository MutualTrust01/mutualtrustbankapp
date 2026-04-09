const express = require("express");
const router = express.Router();
const pool = require("../db");

/**
 * ===============================
 * START OR FETCH CHAT ROOM
 * Room format: chat:{account_number}
 * ===============================
 */
router.post("/start", async (req, res) => {
  try {
    const { account_number, customer_name } = req.body;

    if (!account_number) {
      return res.status(400).json({ error: "Account number required" });
    }

    const roomId = `chat:${account_number}`;

    await pool.query(
      `
      INSERT INTO chat_rooms (
        room_id,
        account_number,
        customer_name,
        status,
        assigned_admin
      )
      VALUES ($1, $2, $3, 'WAITING', NULL)
      ON CONFLICT (room_id) DO NOTHING
      `,
      [
        roomId,
        account_number,
        customer_name || "Customer",
      ]
    );

    res.json({ roomId });

  } catch (err) {
    console.error("❌ Chat start error:", err.message);
    res.status(500).json({ error: "Chat start failed" });
  }
});

/**
 * ===============================
 * FETCH CHAT MESSAGES (ADMIN)
 * ===============================
 */
router.get("/messages/:roomId", async (req, res) => {
  const { roomId } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        room_id,
        sender,
        message,
        created_at
      FROM chat_messages
      WHERE room_id = $1
      ORDER BY created_at ASC
      `,
      [roomId]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("❌ Fetch messages error:", err.message);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

/**
 * ===============================
 * MARK MESSAGES AS READ
 * ===============================
 */
router.post("/read/:roomId", async (req, res) => {
  try {

    await pool.query(
      `
      UPDATE chat_messages
      SET read = true,
          read_at = NOW()
      WHERE room_id = $1
        AND sender = 'CUSTOMER'
        AND read = false
      `,
      [req.params.roomId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Mark read error:", err.message);
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
});

module.exports = router;
