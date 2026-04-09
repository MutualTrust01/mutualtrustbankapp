// src/controllers/balanceController.js

// Adjust path depending on your folder structure.
// If coreBankingService is NOT inside src/utils, tell me and I’ll modify it.
const { getBalance } = require("../utils/coreBankingService");

exports.checkBalance = async (req, res) => {
  try {
    const accountNumber = req.query.accountNumber || req.body.accountNumber; // supports both query & body

    // Validate input
    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: "accountNumber is required"
      });
    }

    // Call core banking API / internal DB service
    const result = await getBalance(accountNumber);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "No balance record found for this account"
      });
    }

    res.status(200).json({
      success: true,
      balance: result.balance ?? result, // supports object or primitive response
      data: result,
      message: "Balance fetched successfully"
    });

  } catch (error) {
    console.error("Balance Error:", error);

    res.status(500).json({
      success: false,
      message: "Server error while checking balance",
      error: error.message
    });
  }
};
