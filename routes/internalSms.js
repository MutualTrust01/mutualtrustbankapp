const express = require("express");
const router = express.Router();

// 🔐 CORE AUTH (x-core-key)
const coreAuth = require("../middleware/coreAuth");

const { sendSms } = require("../src/controllers/smsController");

/* ===============================
   INTERNAL / CORE SMS
================================ */
router.post("/send", coreAuth, sendSms);

module.exports = router;
