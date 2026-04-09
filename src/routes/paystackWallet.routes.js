// backend/src/routes/paystackWallet.routes.js

const express = require("express");
const router = express.Router();
const controller = require("../controllers/paystackWallet.controller");
const auth = require("../../middleware/auth");

/* =====================================
   PAYSTACK WALLET
===================================== */

router.get(
  "/transactions",
  auth,
  controller.getPaystackWalletTransactions
);

module.exports = router;
