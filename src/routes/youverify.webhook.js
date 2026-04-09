const express = require("express");
const crypto = require("crypto");

const router = express.Router();

/**
 * YouVerify Webhook Receiver (YVOS)
 * IMPORTANT: Must use raw body for signature verification
 */
router.post(
  "/youverify",
  express.raw({ type: "*/*" }),
  (req, res) => {
    try {
      const signature =
        req.headers["x-youverify-signature"] ||
        req.headers["x-yv-signature"];

      if (!signature) {
        console.error("❌ Missing YouVerify webhook signature");
        return res.status(400).send("Missing signature");
      }

      const payload = req.body.toString("utf8");

      const expectedSignature = crypto
        .createHmac("sha256", process.env.YOUVERIFY_WEBHOOK_SECRET)
        .update(payload)
        .digest("hex");

      // 🔐 Timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );

      if (!isValid) {
        console.error("❌ Invalid YouVerify webhook signature");
        return res.status(401).send("Invalid signature");
      }

      // ✅ Parse payload AFTER verification
      const event = JSON.parse(payload);

      console.log("✅ YouVerify Webhook Verified:", event);

      /**
       * TODO:
       * - event.event
       * - event.data.type (BVN, NIN, etc.)
       * - event.data.status (completed, failed)
       */

      return res.status(200).send("OK");
    } catch (error) {
      console.error("❌ Webhook processing error:", error.message);
      return res.status(500).send("Webhook error");
    }
  }
);

module.exports = router;
