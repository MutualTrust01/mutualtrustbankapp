const express = require("express");
const router = express.Router();
const paystackController = require("../controllers/paystackController");
const auth = require("../../middleware/auth");// use if you already have auth

/* =====================================
   💳 PAYSTACK – TRANSACTIONS
===================================== */

// Initialize payment
router.post(
  "/transaction/initialize",
  auth,
  paystackController.initializeTransaction
);

// Verify payment (callback / redirect)
router.get(
  "/transaction/verify/:reference",
  paystackController.verifyTransaction
);

// List all transactions (admin)
router.get(
  "/transactions",
  auth,
  paystackController.listTransactions
);

// Fetch single transaction
router.get(
  "/transaction/:id",
  auth,
  paystackController.getTransaction
);

// Charge saved authorization (recurring)
router.post(
  "/transaction/charge",
  auth,
  paystackController.chargeAuthorization
);

// Partial debit
router.post(
  "/transaction/partial-debit",
  auth,
  paystackController.partialDebit
);

// Transaction timeline
router.get(
  "/transaction/timeline/:id",
  auth,
  paystackController.transactionTimeline
);

// Transaction totals (admin)
router.get(
  "/transaction/totals",
  auth,
  paystackController.transactionTotals
);

// Export transactions (admin)
router.get(
  "/transaction/export",
  auth,
  paystackController.exportTransactions
);


/* =====================================
   💸 PAYSTACK – TRANSFERS
===================================== */

// List transfers
router.get(
  "/transfers",
  auth,
  paystackController.listTransfers
);

// Create transfer recipient
router.post(
  "/transfers/recipients",
  auth,
  paystackController.createRecipient
);

// Initiate transfer
router.post(
  "/transfers/initiate",
  auth,
  paystackController.initiateTransfer
);

module.exports = router;
