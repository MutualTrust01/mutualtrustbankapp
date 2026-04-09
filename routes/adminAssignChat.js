const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

/*
===============================
ASSIGN CHAT TO ADMIN
===============================
*/

router.post("/assign/:roomId", auth, async (req, res) => {

  try {

    const adminId = req.user.id;
    const { roomId } = req.params;

    const result = await pool.query(
      `
      UPDATE chat_rooms
      SET assigned_admin = $1,
          status = 'ASSIGNED'
      WHERE room_id = $2
      AND (assigned_admin IS NULL OR assigned_admin = $1)
      RETURNING room_id
      `,
      [adminId, roomId]
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "Chat already assigned to another admin"
      });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Assign chat error:", err.message);
    res.status(500).json({ error: "Assignment failed" });
  }

});

module.exports = router;
