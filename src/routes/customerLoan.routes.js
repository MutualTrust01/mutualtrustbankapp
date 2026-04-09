const express = require("express");
const router = express.Router();

const customerLoanController = require("../controllers/customerLoanController");

/*
==================================================
 CUSTOMER LOAN PORTAL ROUTES
==================================================
*/

/**
 * Get all loans for a customer
 */
router.post(
  "/loans",
  customerLoanController.getCustomerLoans
);

module.exports = router;
