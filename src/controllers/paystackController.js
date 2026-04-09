const paystack = require("../services/paystack.service");

/* =====================================
   💳 TRANSACTIONS
===================================== */

exports.initializeTransaction = async (req, res) => {
  try {
    const { amount, metadata } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    // ✅ SESSION OR JWT
    const email =
      req.user?.email || req.session?.user?.email;

    const userId =
      req.user?.id || req.session?.user?.id;

    if (!email || !userId) {
      return res.status(440).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const response = await paystack.post("/transaction/initialize", {
      email,
      amount: Number(amount) * 100,
      metadata: {
        ...metadata,
        initiated_by: email,
        user_id: userId,
      },
      callback_url: `${process.env.FRONTEND_URL}/wallet/verify`,
    });

    const { authorization_url, reference } = response.data.data;
await req.db.query(
  `
  INSERT INTO wallet_transactions
  (user_id, reference, amount, type, source, status)
  VALUES ($1, $2, $3, $4, $5, $6)
  `,
  [
    userId,
    reference,
    amount,
    "credit",   // ✅ MUST MATCH CHECK CONSTRAINT
    "PAYSTACK",
    "PENDING",
  ]
);


    return res.json({
      success: true,
      authorization_url,
      reference,
    });
  } catch (err) {
    console.error("Paystack init error:", err.response?.data || err.message);

    return res.status(400).json({
      success: false,
      message: "Transaction initialization failed",
    });
  }
};






exports.verifyTransaction = async (req, res) => {
  const { reference } = req.params;

  try {
    const response = await paystack.get(
      `/transaction/verify/${reference}`
    );

    const tx = response.data.data;

    if (tx.status === "success") {
      // ✅ MARK SUCCESS
      await req.db.query(
        `
        UPDATE wallet_transactions
        SET status = 'SUCCESS'
        WHERE reference = $1
        `,
        [reference]
      );

      return res.json({
        success: true,
        message: "Transaction successful",
      });
    }

    // ❌ USER CANCELLED / CLOSED PAYSTACK
    await req.db.query(
      `
      UPDATE wallet_transactions
      SET status = 'ABANDONED'
      WHERE reference = $1
      `,
      [reference]
    );

    return res.json({
      success: false,
      message: "Transaction abandoned",
    });

  } catch (err) {
    console.error("Verify error:", err.response?.data || err.message);

    // ❌ FAIL-SAFE → MARK AS ABANDONED
    await req.db.query(
      `
      UPDATE wallet_transactions
      SET status = 'ABANDONED'
      WHERE reference = $1
      `,
      [reference]
    );

    return res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
};

exports.listTransactions = async (req, res) => {
  try {
    const response = await paystack.get("/transaction");
    res.json({ success: true, data: response.data.data });
  } catch {
    res.status(500).json({ success: false });
  }
};

exports.getTransaction = async (req, res) => {
  try {
    const response = await paystack.get(
      `/transaction/${req.params.id}`
    );
    res.json({ success: true, data: response.data.data });
  } catch {
    res.status(404).json({ success: false });
  }
};

exports.chargeAuthorization = async (req, res) => {
  const { email, amount, authorization_code } = req.body;

  try {
    const response = await paystack.post(
      "/transaction/charge_authorization",
      {
        email,
        amount: amount * 100,
        authorization_code,
      }
    );

    res.json({ success: true, data: response.data.data });
  } catch {
    res.status(400).json({
      success: false,
      message: "Charge failed",
    });
  }
};

exports.partialDebit = async (req, res) => {
  const { authorization_code, amount, email } = req.body;

  try {
    const response = await paystack.post(
      "/transaction/partial_debit",
      {
        authorization_code,
        amount: amount * 100,
        currency: "NGN",
        email,
      }
    );

    res.json({ success: true, data: response.data.data });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Partial debit failed",
      error: err.response?.data || err.message,
    });
  }
};

exports.transactionTimeline = async (req, res) => {
  try {
    const response = await paystack.get(
      `/transaction/timeline/${req.params.id}`
    );
    res.json({ success: true, data: response.data.data });
  } catch {
    res.status(400).json({ success: false });
  }
};

exports.transactionTotals = async (req, res) => {
  try {
    const response = await paystack.get("/transaction/totals");
    res.json({ success: true, data: response.data.data });
  } catch {
    res.status(500).json({ success: false });
  }
};

exports.exportTransactions = async (req, res) => {
  try {
    const response = await paystack.get("/transaction/export");
    res.json({ success: true, data: response.data.data });
  } catch {
    res.status(500).json({ success: false });
  }
};

/* =====================================
   💸 TRANSFERS
===================================== */

exports.listTransfers = async (req, res) => {
  try {
    const response = await paystack.get("/transfer");
    res.json({ success: true, data: response.data.data });
  } catch {
    res.status(500).json({ success: false });
  }
};

exports.createRecipient = async (req, res) => {
  const { name, account_number, bank_code } = req.body;

  try {
    const response = await paystack.post(
      "/transferrecipient",
      {
        type: "nuban",
        name,
        account_number,
        bank_code,
        currency: "NGN",
      }
    );

    res.json({ success: true, data: response.data.data });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Recipient creation failed",
      error: err.response?.data || err.message,
    });
  }
};

exports.initiateTransfer = async (req, res) => {
  const { amount, recipient, reason } = req.body;

  try {
    const response = await paystack.post("/transfer", {
      source: "balance",
      amount: amount * 100,
      recipient,
      reason,
    });

    res.json({ success: true, data: response.data.data });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Transfer failed",
      error: err.response?.data || err.message,
    });
  }
};

/* =====================================
   🔁 RETRY ABANDONED TRANSACTION
===================================== */

exports.retryTransaction = async (req, res) => {
  try {
    const { reference } = req.params;

    // 1️⃣ Find transaction
    const txRes = await req.db.query(
      `
      SELECT amount, email, status
      FROM wallet_transactions
      WHERE reference = $1
      `,
      [reference]
    );

    if (!txRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    const tx = txRes.rows[0];

    // 2️⃣ Only abandoned transactions can be retried
    if (tx.status !== "ABANDONED") {
      return res.status(400).json({
        success: false,
        message: "Only abandoned transactions can be retried",
      });
    }

    // 3️⃣ Re-initialize Paystack
    const response = await paystack.post("/transaction/initialize", {
      email: tx.email,
      amount: tx.amount * 100,
      callback_url: `${process.env.FRONTEND_URL}/wallet/verify`,
      metadata: {
        retry_of: reference,
      },
    });

    return res.json({
      success: true,
      authorization_url: response.data.data.authorization_url,
    });
  } catch (err) {
    console.error("Retry transaction error:", err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      message: "Retry failed",
    });
  }
};

