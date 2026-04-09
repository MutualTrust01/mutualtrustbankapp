const express = require("express");
const router = express.Router();

const auth = require("../../middleware/auth"); // ✅ YOUR EXISTING AUTH MIDDLEWARE

const {
  initializeDirectDebitMandate,
  handleDirectDebitCallback,
  getDirectDebitStatus,
  chargeDirectDebit,
  handleDirectDebitWebhook, 
getMandates
} = require("../controllers/paystackDirectDebit.controller");

/* =====================================
   INITIATE DIRECT DEBIT MANDATE
   (ADMIN ONLY)
===================================== */

router.post(
  "/direct-debit/initialize",
  auth, // 🔐 PROTECT THIS
  initializeDirectDebitMandate
);

/* =====================================
   PAYSTACK CALLBACK (PUBLIC)
   Paystack redirects customer here
===================================== */
router.get(
  "/direct-debit/callback",
  handleDirectDebitCallback
);

/* =====================================
   POLL DIRECT DEBIT STATUS (PUBLIC)
   Used by customer after redirect
===================================== */
router.get(
  "/direct-debit/status",
  getDirectDebitStatus
);

/* =====================================
   CHARGE DIRECT DEBIT (ADMIN / SYSTEM)
===================================== */
router.post(
  "/direct-debit/charge",
  auth,                          // 🔐 REQUIRED
  chargeDirectDebit
);

/* =====================================
   PAYSTACK WEBHOOK (PUBLIC)
===================================== */
router.post(
  "/direct-debit/webhook",
  express.raw({ type: "application/json" }), // ⚠️ VERY IMPORTANT
  handleDirectDebitWebhook
);

router.get(
  "/mandates",
  auth, // 🔐 protect (optional but recommended)
  getMandates
);

const axios = require("axios");

router.get("/resolve-account", async (req, res) => {
  try {
    const { account_number, bank_code } = req.query;

    if (!account_number || !bank_code) {
      return res.status(400).json({
        status: false,
        message: "Account number and bank code required",
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    return res.json(response.data);

  } catch (err) {
    console.error("❌ RESOLVE ERROR:", err.response?.data || err.message);

    return res.status(500).json({
      status: false,
      message: "Unable to verify account",
    });
  }
});

module.exports = router;
