const express = require('express');
const router = express.Router();
const transferController = require('../controllers/transferController'); // Adjust the path if necessary

// Define the routes and link them to the controller

// GET commercial banks using token
router.get('/banks/:token', transferController.getBanks);

// POST name enquiry with token, AccountNumber, and BankCode in the body
router.post('/name-enquiry/:token', transferController.nameEnquiry);

// POST Inter Bank Transfer request
router.post('/inter-bank-transfer', transferController.interBankTransfer);  // Added the Inter Bank Transfer endpoint

router.post('/transaction-status', transferController.transactionStatusQuery); 

router.post('/local-fund-transfer', transferController.localFundTransfer);

router.post('/credit-customer-account', transferController.creditCustomerAccount); // Credit Customer Account

router.post(
  '/core-transaction-status',
  transferController.coreTransactionStatusQuery
);

// ✅ Core Transaction Reversal
router.post("/reversal", transferController.reversal);

module.exports = router; // Export the router
