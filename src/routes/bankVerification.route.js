import express from "express";
import axios from "axios";

const router = express.Router();
const TRANSFER_TOKEN = process.env.TRANSFER_TOKEN;

router.post("/verify-account", async (req, res) => {

  try {

    let { accountNumber, bankCode } = req.body;

    accountNumber = String(accountNumber || "").trim();
    bankCode = String(bankCode || "").trim();

    if (!accountNumber || accountNumber.length !== 10) {
      return res.status(400).json({
        success:false,
        message:"Invalid account number"
      });
    }

    if (!bankCode) {
      return res.status(400).json({
        success:false,
        message:"Bank code required"
      });
    }

    console.log("CACHE MISS → verifying account");

    const response = await axios.post(
      "https://api.mybankone.com/BankOneWebAPI/api/Transfer/NameEnquiry",
      {
        AccountNumber: accountNumber,
        BankCode: bankCode
      },
      {
        params:{ authtoken:TRANSFER_TOKEN },
        timeout:7000
      }
    );

    const data = response.data;

    if (data?.IsSuccessful && data?.Name) {

      console.log("🔥 Account verified:", data.Name);

      return res.json({
        success: true,
        accountName: data.Name,
        bankCode: bankCode
      });
    }

    return res.json({
      success:false,
      message:"Account not found"
    });

  } catch (err) {

    console.error("🔥 FULL ERROR:", err);

    return res.status(500).json({
      success:false,
      message:"Verification failed"
    });

  }

});

export default router;
