const express = require("express");
const axios = require("axios");

const router = express.Router();

const API_BASE = process.env.API_BASE_URL;
const TRANSFER_TOKEN = process.env.TRANSFER_TOKEN;

router.post("/verify-account", async (req, res) => {

  const { accountNumber, bankCode } = req.body;

  if (!accountNumber || accountNumber.length !== 10) {
    return res.json({
      success: false,
      message: "Invalid account number"
    });
  }

  if (!bankCode) {
    return res.json({
      success: false,
      message: "Bank code required"
    });
  }

  try {

    const response = await axios.post(
      `${API_BASE}/api/transfer/name-enquiry/${TRANSFER_TOKEN}`,
      {
        AccountNumber: accountNumber,
        BankCode: bankCode
      },
      {
        timeout: 7000,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    const data = response.data;

    if (data?.IsSuccessful && data?.Name) {

      return res.json({
        success: true,
        accountName: data.Name
      });

    }

    return res.json({
      success: false,
      message: "Account not found"
    });

  } catch (err) {

    console.error("Verification error:", err.message);

    return res.json({
      success: false,
      message: "Verification failed"
    });

  }

});

module.exports = router;
