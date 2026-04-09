const jwt = require("jsonwebtoken");

module.exports = function initSocket(io) {
  io.on("connection", (socket) => {
    try {
      const token = socket.handshake.auth?.token;
      let role = "guest";

      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        role = decoded.role; // 'ADMIN' or 'CUSTOMER'
      }

      socket.role = role;

      console.log("🟢 Socket connected:", socket.id, role);

      /* ================= JOIN ROOM ================= */
      socket.on("join_room", (roomId) => {
        if (!roomId) return;

        socket.join(roomId);
        console.log(`📦 ${socket.role} joined ${roomId}`);
      });

      /* ================= SEND MESSAGE ================= */
      socket.on("send_message", async (data) => {
        const { roomId, sender, message } = data;
        if (!roomId || !message) return;

        console.log("📨 Message:", data);

        // 🔹 Persist message
        await global.pool.query(
          `
          INSERT INTO chat_messages (room_id, sender, message, read)
          VALUES ($1, $2, $3, $4)
          `,
          [roomId, sender, message, sender === "ADMIN"]
        );

        // 🔹 Emit to BOTH admin & customer in room
        io.to(roomId).emit("receive_message", {
          roomId,
          sender,
          message,
          timestamp: new Date()
        });
      });

      socket.on("disconnect", () => {
        console.log("🔴 Socket disconnected:", socket.id);
      });

    } catch (err) {
      console.error("Socket error:", err);
      socket.disconnect();
    }
  });
};
