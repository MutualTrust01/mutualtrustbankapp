const db = require("../../db");
const axios = require("axios");

const CORE_BASE_URL =
  process.env.CORE_BASE_URL ||
  process.env.MYBANKONE_BASE_URL ||
  "https://staging.mybankone.com";

const CORE_TOKEN = process.env.CORE_TOKEN || process.env.CORE_API_KEY;
const MFB_CODE = Number(process.env.MFB_CODE || 100304);
const LOAN_REPAYMENT_GL_CODE = Number(
  process.env.LOAN_REPAYMENT_GL_CODE || 1633
);

// ✅ GET PENDING
exports.getPendingRepayments = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM repayments WHERE status = 'PENDING' ORDER BY created_at DESC`
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("❌ GET PENDING ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ✅ POST TO CORE
exports.postRepaymentToCore = async (req, res) => {
  const { id } = req.params;

  try {
    // 🔍 FETCH REPAYMENT
    const repaymentRes = await db.query(
      "SELECT * FROM repayments WHERE id = $1",
      [id]
    );

    const repayment = repaymentRes.rows[0];

    if (!repayment) {
      return res.status(404).json({
        success: false,
        message: "Repayment not found",
      });
    }

    // 🔍 FETCH SETTLEMENT ACCOUNT FROM LOAN
    const loanRes = await db.query(
  `
  SELECT
    id,
    core_loan_account_number,
    settlement_account_number
  FROM loans
  WHERE id = $1
  `,
  [repayment.loan_id]
);

    const loan = loanRes.rows[0];

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Related loan not found",
      });
    }

    const settlementAccount = loan.settlement_account_number;

    if (!settlementAccount) {
      return res.status(400).json({
        success: false,
        message: "Settlement account not found for this loan",
      });
    }

    if (!CORE_TOKEN) {
      return res.status(500).json({
        success: false,
        message: "CORE token is missing in environment variables",
      });
    }

    // 🔥 GENERATE SHORT UNIQUE REFERENCE (max 12 chars)
    const retrievalReference = Date.now().toString().slice(-10);

    // 🔥 PREPARE PAYLOAD
    const payload = {
      RetrievalReference: retrievalReference,
      AccountNumber: settlementAccount,
      NibssCode: MFB_CODE,
      Amount: Number(repayment.amount) * 100,
      Fee: 0,
      Narration: "Loan repayment",
      Token: CORE_TOKEN,
      GLCode: LOAN_REPAYMENT_GL_CODE,
    };

    const coreUrl = `${CORE_BASE_URL}/thirdpartyapiservice/apiservice/CoreTransactions/Credit`;

    console.log("🚀 POSTING REPAYMENT TO CORE");
    console.log("🌐 CORE URL:", coreUrl);
    console.log("🧾 REPAYMENT ID:", repayment.id);
    console.log("🧾 LOAN ID:", repayment.loan_id);
    console.log("🏦 LOAN ACCOUNT NUMBER:", loan.core_loan_account_number);
    console.log("🏦 SETTLEMENT ACCOUNT:", settlementAccount);
    console.log("📦 Payload:", payload);
    console.log("🔐 CORE TOKEN PRESENT:", !!CORE_TOKEN);

    const coreRes = await axios.post(coreUrl, payload, {
      timeout: 15000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    console.log("✅ CORE RESPONSE:", coreRes.data);

    const coreData = coreRes.data || {};

    if (!coreData.IsSuccessful || coreData.ResponseCode !== "00") {
      await db.query("UPDATE repayments SET status = 'FAILED' WHERE id = $1", [
        id,
      ]);

      return res.status(400).json({
        success: false,
        message: coreData.ResponseMessage || "Core posting failed",
        core: coreData,
      });
    }

    // ✅ UPDATE STATUS + SAVE REFERENCES
    await db.query(
      `
      UPDATE repayments
      SET
        status = 'POSTED',
        reference = $2,
        posted_at = NOW()
      WHERE id = $1
      `,
      [id, retrievalReference]
    );

    return res.json({
      success: true,
      message: "Repayment posted successfully",
      core: coreData,
    });
  } catch (err) {
    console.error("❌ REPAYMENT POST FAILED");
    console.error("STATUS:", err?.response?.status);
    console.error("DATA:", err?.response?.data);
    console.error("MESSAGE:", err?.message);

    await db.query("UPDATE repayments SET status = 'FAILED' WHERE id = $1", [
      id,
    ]);

    return res.status(500).json({
      success: false,
      message:
        err?.response?.data?.ResponseMessage ||
        err?.response?.data?.Message ||
        err?.response?.data?.message ||
        err?.message ||
        "Repayment posting failed",
    });
  }
};
