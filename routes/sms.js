const express = require("express");
const router = express.Router();

// ✅ NORMAL USER AUTH (JWT / session)
const auth = require("../middleware/auth");

const { sendSms } = require("../src/controllers/smsController");

/* ===============================
   USER / ADMIN SMS
================================ */
router.post("/send", auth, sendSms);

module.exports = router;
