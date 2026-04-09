const express = require("express");
const router = express.Router();
const accountController = require("../controllers/accountController");

const auth = require("../../middleware/auth");
/* 🔐 Account APIs */

// ✅ GET accounts by customer ID
router.get("/customer/:customerId", accountController.getAccountsByCustomer);

// ✅ Account enquiry
router.get("/enquiry/:accountNumber", accountController.accountEnquiry);

// ✅ Balance enquiry
router.get("/balance/:accountNumber", accountController.balanceEnquiry);

// ✅ Transactions
router.get("/transactions/:accountNumber", auth, accountController.getTransactions);

module.exports = router;
