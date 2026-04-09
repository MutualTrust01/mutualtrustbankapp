const express = require("express");
const router = express.Router();
const pool = require("../../db");

// ✅ SAVE SUBSCRIPTION
router.post("/save-subscription", async (req, res) => {
  try {
    const subscription = req.body;

    await pool.query(
      `INSERT INTO push_subscriptions (subscription) VALUES ($1)`,
      [subscription]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Save subscription error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ TEST PUSH
const webpush = require("web-push");

router.get("/test-push", async (req, res) => {
  try {
    const subs = await pool.query("SELECT * FROM push_subscriptions");

    for (const sub of subs.rows) {
  const subscription =
    typeof sub.subscription === "string"
      ? JSON.parse(sub.subscription)
      : sub.subscription;

  await webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: "Test Notification",
      body: "Push is working 🚀",
    })
  );
}

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Push error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
