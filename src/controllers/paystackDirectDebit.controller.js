const axios = require("axios");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const coreBankingClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");
const { sendStyledMail } = require("../../mailer");

const PAYSTACK_BASE = "https://api.paystack.co";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

/* =====================================================
   INITIATE DIRECT DEBIT MANDATE
===================================================== */
exports.initializeDirectDebitMandate = async (req, res) => {
  try {
    const initiatorEmail = req.session?.user?.email || null;
    const { email, accountNumber, bankCode, accountName } = req.body;

 const callbackToken = crypto.randomBytes(16).toString("hex");

const normalizedBankCode = String(bankCode || "").trim();
const normalizedAccountNumber = String(accountNumber || "").trim();

console.log("NORMALIZED DIRECT DEBIT INPUT:", {
  email,
  normalizedAccountNumber,
  normalizedBankCode,
  accountName,
});

    
if (!email || !accountNumber || !bankCode) {
  return res.status(400).json({
    success: false,
    message: "Email, account number and bank are required",
  });
}

const BASE_URL = process.env.BASE_URL || "https://ibank.mutualtrustmfbank.com";

// 🔥 ENSURE CUSTOMER EXISTS IN PAYSTACK
try {
  


await axios.post(
  `${PAYSTACK_BASE}/customer`,
  {
    email,
    first_name: accountName?.split(" ")[0] || "Customer",
    last_name: accountName?.split(" ").slice(1).join(" ") || "User"
  },
  {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
    },
  }
);
  console.log("✅ Customer ensured on Paystack");
} catch (err) {
  console.log("ℹ Customer may already exist");
}

console.log("PAYSTACK MANDATE INIT INPUT:", {
  email,
  accountNumber: normalizedAccountNumber,
  bankCode: normalizedBankCode,
  accountName,
});

    const response = await axios.post(
      `${PAYSTACK_BASE}/customer/authorization/initialize`,
      {
  channel: "direct_debit",
  email,

  
account: {
  number: normalizedAccountNumber,
  bank_code: normalizedBankCode,
},


  callback_url: `${BASE_URL}/api/paystack/direct-debit/callback?cb=${encodeURIComponent(callbackToken)}`,
},
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { redirect_url, reference } = response.data.data;

const existingMandate = await prisma.direct_debit_mandates.findFirst({
  where: {
    loan_id: req.body.loanId || null,
    account_number: normalizedAccountNumber,
    bank: normalizedBankCode,
  },
  orderBy: { created_at: "desc" },
});

// ✅ Block only if an ACTIVE mandate already exists


// ✅ If an ACTIVE mandate already exists, resend the existing authorization link
if (existingMandate?.status === "ACTIVE") {
  const existingCustomerStartUrl =
    `${process.env.FRONTEND_URL}/wallet/direct-debit` +
    `?reference=${encodeURIComponent(existingMandate.reference)}` +
    `&redirect_url=${encodeURIComponent(redirect_url)}`;

  await sendStyledMail({
    to: email,
    subject: "Authorize Direct Debit Mandate",
    title: "Direct Debit Authorization Required",
    body: `
      <p>Your direct debit mandate is already active for this loan.</p>
      <p>You can open the authorization page again using the link below.</p>
      <a href="${existingCustomerStartUrl}" target="_blank">Open Authorization Page</a>
    `,
  });

  return res.json({
    success: true,
    existing: true,
    message: "Mandate is already active for this account on this loan",
    reference: existingMandate.reference,
    redirect_url,
  });
}


await prisma.direct_debit_mandates.create({
  data: {
    customer_email: email,
    reference,
    callback_token: callbackToken,
    status: "PENDING",
    initiated_by: initiatorEmail,

bank: normalizedBankCode,
account_number: normalizedAccountNumber,    

    account_name: accountName,

    ...(req.body.loanId && {
      loan: {
        connect: { id: req.body.loanId },
      },
    }),
  },
});

if (req.body.loanId) {
  await prisma.loans.update({
    where: { id: req.body.loanId },
    data: {
      mandate_sent: true,
      mandate_reference: reference,
      mandate_sent_at: new Date(),
    },
  });
}


    
const io = req.app.get("io");

io.of("/notifications").emit("new_notification", {
  type: "MANDATE_CREATED",
  message: `${email} initiated direct debit`,
  email,
});


// 📧 Customer email
const customerStartUrl =
  `${process.env.FRONTEND_URL}/wallet/direct-debit` +
  `?reference=${encodeURIComponent(reference)}` +
  `&redirect_url=${encodeURIComponent(redirect_url)}`;

console.log("📧 ABOUT TO SEND CUSTOMER MANDATE EMAIL TO:", email);
console.log("📧 CUSTOMER START URL:", customerStartUrl);

try {
  const mailResult = await sendStyledMail({
    to: email,
    subject: "Authorize Direct Debit Mandate",
    title: "Direct Debit Authorization Required",
    body: `
      <p>Please authorize direct debit for repayments.</p>
      <a href="${customerStartUrl}" target="_blank">Authorize Now</a>
    `,
  });

  console.log("✅ CUSTOMER EMAIL SEND RESULT:", mailResult);
} catch (mailErr) {
  console.error("❌ CUSTOMER EMAIL SEND ERROR:", mailErr);
  throw mailErr;
}



     


    // 📧 Admin email
    if (initiatorEmail) {
      await sendStyledMail({
        to: initiatorEmail,
        subject: "Mandate Sent",
        title: "Direct Debit Initiated",
        body: `<p>Mandate sent to ${email}</p>`,
      });
    }

    return res.json({ success: true, redirect_url, reference });
} catch (err) {
  const errorMessage =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    "Failed to initialize direct debit";

  console.error("❌ PAYSTACK FULL ERROR:", err.response?.data || err.message);

  try {
    const io = req.app.get("io");
    const initiatorEmail = req.session?.user?.email || null;
    const customerEmail = req.body?.email || null;

    io.of("/notifications").emit("new_notification", {
      type: "MANDATE_FAILED",
      message: `Mandate generation failed for ${customerEmail || "customer"}`,
      email: customerEmail,
      error: errorMessage,
    });

    io.of("/notifications").emit("mandate_failed", {
      loan_id: req.body?.loanId || null,
      email: customerEmail,
      error: errorMessage,
    });

    if (initiatorEmail) {
      await sendStyledMail({
        to: initiatorEmail,
        subject: "Mandate Generation Failed",
        title: "Direct Debit Failed",
        body: `
          <p>Mandate generation failed for ${customerEmail || "customer"}.</p>
          <p><strong>Reason:</strong> ${errorMessage}</p>
        `,
      });
    }
  } catch (notifyErr) {
    console.error("❌ FAILURE NOTIFICATION ERROR:", notifyErr.message);
  }

  return res.status(500).json({
    success: false,
    message: errorMessage,
  });
}


};

/* =====================================================
   CALLBACK
===================================================== */

exports.handleDirectDebitCallback = async (req, res) => {
  try {
    const callbackToken = req.query.cb || "";
    const reference =
      req.query.reference ||
      req.query.trxref ||
      req.query.ref ||
      "";

    console.log("PAYSTACK CALLBACK QUERY:", req.query);
    console.log("PAYSTACK CALLBACK REFERENCE:", reference);
    console.log("PAYSTACK CALLBACK TOKEN:", callbackToken);

    let mandate = null;

    if (reference) {
      mandate = await prisma.direct_debit_mandates.findFirst({
        where: { reference },
      });
    }

    if (!mandate && callbackToken) {
      mandate = await prisma.direct_debit_mandates.findFirst({
        where: { callback_token: callbackToken },
      });
    }

    if (!mandate) {
      console.log("PAYSTACK CALLBACK WITHOUT MATCH:", req.query);
      return res.redirect(
        `${process.env.FRONTEND_URL}/wallet/direct-debit?status=pending`
      );
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/wallet/direct-debit?reference=${encodeURIComponent(mandate.reference)}&loanId=${mandate.loan_id || ""}`
    );
  } catch (err) {
    console.error("DIRECT DEBIT CALLBACK ERROR:", err);
    return res.redirect(
      `${process.env.FRONTEND_URL}/error?message=Callback failed`
    );
  }
};

/* =====================================================
   STATUS CHECK
===================================================== */

exports.getDirectDebitStatus = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.json({ status: "PENDING" });
    }

    let mandate = await prisma.direct_debit_mandates.findUnique({
      where: { reference },
    });

    if (!mandate) {
      return res.json({ status: "NOT_FOUND" });
    }

    // ✅ if already active locally, return immediately
    if (mandate.status === "ACTIVE") {
      return res.json({
        status: "ACTIVE",
        reference: mandate.reference,
        loanId: mandate.loan_id || null,
      });
    }

    

 
    return res.json({
      status: mandate.status || "PENDING",
      reference: mandate.reference,
      loanId: mandate.loan_id || null,
    });
  } catch (err) {
    console.error("DIRECT DEBIT STATUS ERROR:", err?.response?.data || err.message);
    return res.status(500).json({
      status: "PENDING",
      message: "Unable to confirm mandate status right now",
    });
  }
};

/* =====================================================
   CHARGE DIRECT DEBIT (MANUAL / CRON)
===================================================== */
exports.chargeDirectDebit = async (req, res) => {
  try {
    const { email, amount, user_id } = req.body;

    const mandate = await prisma.direct_debit_mandates.findFirst({
      where: { customer_email: email, status: "ACTIVE" },
      orderBy: { created_at: "desc" },
    });

    if (!mandate || !mandate.authorization_code) {
      return res.status(400).json({
        success: false,
        message: "No valid mandate",
      });
    }

    const reference = `DD-${Date.now()}`;

    await axios.post(
      `${PAYSTACK_BASE}/transaction/charge_authorization`,
      {
        authorization_code: mandate.authorization_code,
        email,
        amount: amount * 100,
        reference,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
        },
      }
    );

    await prisma.wallet_transactions.create({
      data: {
        user_id,
        amount,
        reference,
        status: "PENDING",
        channel: "DIRECT_DEBIT",
        type: "CREDIT",
      },
    });

    return res.json({ success: true, reference });

  } catch (err) {
    console.error("❌ CHARGE ERROR:", err.message);
    return res.status(500).json({ success: false });
  }
};

/* =====================================================
   PAYSTACK WEBHOOK
===================================================== */
exports.handleDirectDebitWebhook = async (req, res) => {
  try {
    console.log("🔔 PAYSTACK WEBHOOK HIT:", req.originalUrl);

    const io = req.app.get("io");
    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      console.log("❌ PAYSTACK WEBHOOK: missing signature");
      return res.sendStatus(401);
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body || {}));

    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (hash !== signature) {
      console.log("❌ PAYSTACK WEBHOOK: signature mismatch");
      return res.sendStatus(401);
    }

    const event = Buffer.isBuffer(req.body)
      ? JSON.parse(req.body.toString("utf8"))
      : req.body;

    const data = event?.data;

    if (!data) {
      console.log("⚠ PAYSTACK WEBHOOK: no data payload");
      return res.sendStatus(200);
    }

    console.log("📩 EVENT:", event.event);

    /* =====================================================
       1️⃣ CHARGE SUCCESS
    ===================================================== */
    if (event.event === "charge.success") {
      const auth = data.authorization;
      const { reference, amount } = data;
      const customerEmail = data.customer?.email || null;

      // ✅ Save/refresh mandate authorization
      

// ✅ Find repayment first so mandate refresh uses loan_id, not email
const repayments = await prisma.$queryRaw`
  SELECT *
  FROM loan_repayment_schedules
  WHERE deduction_reference = ${reference}
  LIMIT 1
`;

const repayment = repayments?.[0] || null;

// ✅ Save/refresh mandate authorization using loan_id
if (auth?.authorization_code && auth.reusable && repayment?.loan_id) {
  const mandate = await prisma.direct_debit_mandates.findFirst({
    where: {
      loan_id: repayment.loan_id,
    },
    orderBy: { created_at: "desc" },
  });

  if (mandate) {
    await prisma.direct_debit_mandates.update({
      where: { id: mandate.id },
      data: {
        authorization_code: auth.authorization_code,
        status: "ACTIVE",
      },
    });

    await prisma.loans.update({
      where: { id: mandate.loan_id },
      data: {
        mandate_sent: true,
        mandate_reference: mandate.reference,
      },
    });

    console.log("✅ Saved authorization_code:", auth.authorization_code);
  }
}


      if (repayment) {
        const loan = await prisma.loans.findUnique({
          where: { id: repayment.loan_id },
          select: {
            id: true,
            loan_code: true,
            settlement_account_number: true,
            core_loan_account_number: true,
          },
        });

        if (!loan) {
          console.error("❌ Loan not found for repayment reference:", reference);

          
await prisma.$executeRaw`
  UPDATE loan_repayment_schedules
  SET
    payment_status = 'FAILED',
    deduction_message = 'Loan not found during posting',
    deduction_attempted_at = NOW(),
    updated_at = NOW()
  WHERE id = ${repayment.id}
`;

          return res.sendStatus(200);
        }

        if (!loan.settlement_account_number) {
          console.error("❌ Settlement account not found for loan:", loan.id);

          await prisma.$executeRaw`
  UPDATE loan_repayment_schedules
  SET
    payment_status = 'FAILED',
    deduction_message = 'Settlement account missing for posting',
    deduction_attempted_at = NOW(),
    updated_at = NOW()
  WHERE id = ${repayment.id}
`;

          return res.sendStatus(200);
        }

        try {
          const narration = `Loan repayment received - ${loan.loan_code || loan.id}`;

          // ✅ Post into saved customer account
          const creditPayload = {
  RetrievalReference: String(reference),
  AccountNumber: String(loan.settlement_account_number),
  NibssCode: process.env.MFB_CODE,
  Amount: String(Number(amount) / 100),
  Fee: "0.00",
  Narration: narration,
  Token: process.env.CORE_API_KEY,
  GLCode: process.env.LOAN_REPAYMENT_GL_CODE,
};

          console.log("💳 CREDIT PAYLOAD:");
          console.log(JSON.stringify(creditPayload, null, 2));

const creditRes = await coreBankingClient.post(
  ENDPOINTS.LOCAL_TRANSACTIONS.CREDIT_CUSTOMER_ACCOUNT,
  creditPayload
);

          console.log("💳 CREDIT RESPONSE:");
          console.log(JSON.stringify(creditRes?.data, null, 2));

const isCreditSuccessful =
  creditRes?.data?.IsSuccessful === true ||
  creditRes?.data?.isSuccessful === true ||
  String(creditRes?.data?.ResponseCode || "") === "00";          

          if (!isCreditSuccessful) {
            throw new Error(
              creditRes?.data?.Message ||
                creditRes?.data?.ResponseMessage ||
                "Core posting failed"
            );
          }


await prisma.$executeRaw`
  UPDATE loan_repayment_schedules
  SET
    payment_status = 'PAID',
    paid_at = NOW(),
    deduction_message = ${`Debit successful and posted to customer account. Core ref: ${creditRes?.data?.Reference || "N/A"}`},
    updated_at = NOW()
  WHERE id = ${repayment.id}
`;

await prisma.loan_financial_events.create({
  data: {
    loan_id: loan.id,
    event_type: "REPAYMENT_POSTED",
    reference,
    amount: Number(amount) / 100,
    status: "SUCCESS",
    core_response: creditRes?.data || {},
  },
});

          if (customerEmail) {
            await sendStyledMail({
              to: customerEmail,
              subject: "Repayment Successful",
              title: "Loan Repayment Posted",
              body: `
                <p>Amount: ₦${Number(amount) / 100}</p>
                <p>Reference: ${reference}</p>
                <p>Your repayment has been received and posted successfully.</p>
              `,
            });
          }

          io.of("/notifications").emit("new_notification", {
            type: "REPAYMENT_POSTED",
            message: `₦${Number(amount) / 100} posted for ${customerEmail || "customer"}`,
            reference,
          });
        } catch (postingErr) {
          console.error("❌ Posting failed:", postingErr.message);

          await prisma.$executeRaw`
  UPDATE loan_repayment_schedules
  SET
    payment_status = 'FAILED',
    deduction_message = ${`Debit succeeded but posting failed: ${postingErr.message}`},
    deduction_attempted_at = NOW(),
    updated_at = NOW()
  WHERE id = ${repayment.id}
`;

await prisma.loan_financial_events.create({
  data: {
    loan_id: loan.id,
    event_type: "REPAYMENT_POSTING_FAILED",
    reference,
    amount: Number(amount) / 100,
    status: "FAILED",
    core_response: { message: postingErr.message },
  },
});

        }

        return res.sendStatus(200);
      }

      // ✅ Fallback: manual direct debit / wallet transaction flow
      const tx = await prisma.wallet_transactions.findUnique({
        where: { reference },
      });

      if (tx && tx.status !== "SUCCESS") {
        await prisma.$transaction([
          prisma.wallet_transactions.update({
            where: { reference },
            data: { status: "SUCCESS" },
          }),
          prisma.wallets.update({
            where: { user_id: tx.user_id },
            data: { balance: { increment: amount / 100 } },
          }),
        ]);

        if (customerEmail) {
          await sendStyledMail({
            to: customerEmail,
            subject: "Payment Successful",
            title: "Debit Successful",
            body: `
              <p>Amount: ₦${amount / 100}</p>
              <p>Reference: ${reference}</p>
            `,
          });
        }

        io.of("/notifications").emit("new_notification", {
          type: "REPAYMENT_RECEIVED",
          message: `₦${amount / 100} received from ${customerEmail}`,
          reference,
        });
      }
    }

    /* =====================================================
       2️⃣ MANDATE ACTIVATED
    ===================================================== */
    
if (event.event === "direct_debit.authorization.active") {

 console.log("✅ DIRECT DEBIT ACTIVATION PAYLOAD:", {
    reference: data?.reference,
    authorization_code: data?.authorization_code,
    email: data?.customer?.email,
    account_number: data?.account_number,
    bank_code: data?.bank_code,
  });
  let mandate = null;

  if (data.reference) {
    mandate = await prisma.direct_debit_mandates.findFirst({
      where: { reference: data.reference },
    });
  }

  if (!mandate && data.authorization_code) {
  mandate = await prisma.direct_debit_mandates.findFirst({
    where: {
      authorization_code: String(data.authorization_code || "").trim(),
    },
    orderBy: { created_at: "desc" },
  });
}

  if (!mandate) {
    console.log("⚠ No local mandate matched webhook activation", {
      reference: data.reference,
      email: data?.customer?.email,
      account_number: data?.account_number,
      bank_code: data?.bank_code,
    });
    return res.sendStatus(200);
  }
   

const wasPreviouslyActive =
  String(mandate.status || "").toUpperCase() === "ACTIVE";

if (!wasPreviouslyActive) {
  await prisma.direct_debit_mandates.update({
    where: { reference: mandate.reference },
    data: {
      status: "ACTIVE",
      authorization_code:
        data.authorization_code || mandate.authorization_code,
    },
  });

        if (mandate.loan_id) {
          await prisma.loans.update({
            where: { id: mandate.loan_id },
            data: {
              mandate_sent: true,
              mandate_reference: mandate.reference,
            },
          });
        }
      }

      const email = data.customer?.email || mandate.customer_email;

if (!wasPreviouslyActive && email) {
  await sendStyledMail({
    to: email,
    subject: "Mandate Activated",
    title: "Direct Debit Active",
    body: `<p>Your mandate is active.</p>`,
  });
}
     

if (!wasPreviouslyActive) {
  await sendStyledMail({
    to: [
      mandate?.initiated_by,
      "ict@mutualtrustmfbank.com",
      "credept@mutualtrustmfbank.com",
    ].filter(Boolean),
    subject: "Mandate Activated",
    title: "Customer Activated",
    body: `<p>${email} activated mandate</p>`,
  });

  io.of("/notifications").emit("new_notification", {
    type: "MANDATE_ACTIVATED",
    message: `${email} activated mandate`,
    email,
    reference: mandate.reference,
    loan_id: mandate.loan_id || null,
  });

  io.of("/notifications").emit("mandate_activated", {
    loan_id: mandate.loan_id || null,
    email,
    reference: mandate.reference,
  });
}   

    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("🔥 WEBHOOK ERROR:", err.message);
    return res.sendStatus(200);
  }
};

const getBankName = (code) => {
  const banks = {
    "044": "Access Bank",
    "023": "Citibank",
    "063": "Access Bank (Diamond)",
    "050": "Ecobank",
    "070": "Fidelity Bank",
    "011": "First Bank",
    "214": "FCMB",
    "058": "GTBank",
    "030": "Heritage Bank",
    "082": "Keystone Bank",
    "076": "Polaris Bank",
    "221": "Stanbic IBTC",
    "068": "Standard Chartered",
    "232": "Sterling Bank",
    "100": "Suntrust Bank",
    "032": "Union Bank",
    "033": "UBA",
    "215": "Unity Bank",
    "035": "Wema Bank",
    "057": "Zenith Bank",

    "090405": "Moniepoint",
    "100033": "OPay",
    "999991": "PalmPay",
    "090267": "Kuda Bank",
    "090110": "VFD Bank",
    "090180": "AMJU Unique MFB",
    "090629": "Fina Trust MFB",
  };

  return banks[String(code)] || code || "—";
};


exports.getMandates = async (req, res) => {
  try {
    let mandates = await prisma.direct_debit_mandates.findMany({
      orderBy: { created_at: "desc" },
      include: {
        loan: true,
      },
    });

    
    res.json({
      success: true,
      data: mandates.map((m) => {
        const customerName =
          [m.loan?.first_name, m.loan?.last_name]
            .filter(Boolean)
            .join(" ") || m.account_name || "—";

        return {
          id: m.id,
          email: m.customer_email,
          authorization_code: m.authorization_code,
          status: m.status,
          created_at: m.created_at,
          account_number: m.account_number,
          account_name: m.account_name,
          bank_code: m.bank,
          bank_name: getBankName(m.bank),
          loan_id: m.loan_id,
          customer_name: customerName,
        };
      }),
    });
  } catch (err) {
    console.error("Fetch mandates error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch mandates",
    });
  }
};    
