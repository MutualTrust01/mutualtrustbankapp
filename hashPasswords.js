require("dotenv").config();
const pool = require("./db"); // your PostgreSQL pool
const bcrypt = require("bcrypt");

async function hashPasswords() {
  try {
    const result = await pool.query("SELECT id, password FROM users");
    const users = result.rows;

    for (const user of users) {
      // Skip already hashed passwords (optional)
      if (user.password.startsWith("$2b$")) continue;

      const hashed = await bcrypt.hash(user.password, 10); // 10 salt rounds
      await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, user.id]);
      console.log(`✅ Hashed password for user ID: ${user.id}`);
    }

    console.log("✅ All passwords hashed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error hashing passwords:", err);
    process.exit(1);
  }
}

hashPasswords();
