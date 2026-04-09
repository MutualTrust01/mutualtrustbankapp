const axios = require("axios");
const prisma = require("../lib/prisma");

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = "https://api.paystack.co";

const CORE_BASE_URL =
  process.env.CORE_BASE_URL || process.env.MYBANKONE_BASE_URL;

const CORE_TOKEN = process.env.CORE_TOKEN || process.env.CORE_API_KEY;
const MFB_CODE = Number(process.env.MFB_CODE);
const LOAN_REPAYMENT_GL_CODE = Number(process.env.LOAN_REPAYMENT_GL_CODE);

async function runLoanRepayments() {
  try {
    console.log("⏳ Running loan repayment cron...");

    const repayments = await prisma.$queryRaw`
      SELECT
  lrs.id,
  lrs.loan_id,
  lrs.loan_account_number,
  lrs.schedule_ref_id,
  lrs.due_date,
  lrs.total,
  lrs.payment_status,
  l.core_loan_account_number,
  l.settlement_account_number,
  la.answers
      FROM loan_repayment_schedules lrs
      JOIN loans l
        ON l.id = lrs.loan_id
      JOIN loan_answers la
        ON la.loan_id = l.id
      WHERE lrs.due_date <= NOW()
        AND lrs.payment_status = 'PENDING'
      ORDER BY lrs.due_date ASC
    `;

    console.log(`📊 Found ${repayments.length} due repayments`);

    for (const repayment of repayments) {
      try {
        const parsedAnswers =
          typeof repayment.answers === "string"
            ? JSON.parse(repayment.answers)
            : repayment.answers || {};

        // ✅ Only use active mandate linked to this loan
        const mandate = await prisma.direct_debit_mandates.findFirst({
          where: {
            loan_id: repayment.loan_id,
            status: "ACTIVE",
          },
          orderBy: { created_at: "desc" },
        });

        if (!mandate) {
          console.log("❌ No active mandate for loan:", repayment.loan_id);

          await prisma.$executeRaw`
            UPDATE loan_repayment_schedules
            SET
              payment_status = 'FAILED',
              deduction_message = 'No active direct debit mandate found for this loan',
              deduction_attempted_at = NOW(),
              updated_at = NOW()
            WHERE id = ${repayment.id}
          `;

          continue;
        }

        if (!mandate.authorization_code) {
          console.log("❌ No authorization_code for loan:", repayment.loan_id);

          await prisma.$executeRaw`
            UPDATE loan_repayment_schedules
            SET
              payment_status = 'FAILED',
              deduction_message = 'Mandate has no authorization code',
              deduction_attempted_at = NOW(),
              updated_at = NOW()
            WHERE id = ${repayment.id}
          `;

          continue;
        }

        // ✅ Email only for Paystack payload
        const customerEmail =
          mandate.customer_email ||
          parsedAnswers.field_email ||
          parsedAnswers.email ||
          parsedAnswers.Email ||
          parsedAnswers.customer_email ||
          parsedAnswers.mail ||
          null;

        if (!customerEmail) {
          console.log("❌ Mandate has no customer email for loan:", repayment.loan_id);

          await prisma.$executeRaw`
            UPDATE loan_repayment_schedules
            SET
              payment_status = 'FAILED',
              deduction_message = 'Mandate customer email is missing',
              deduction_attempted_at = NOW(),
              updated_at = NOW()
            WHERE id = ${repayment.id}
          `;

          continue;
        }

        const createdAt = new Date(mandate.created_at);
        const now = new Date();
        const diffHours = (now - createdAt) / (1000 * 60 * 60);

        // TEMP: disabled 6hr rule for testing
        // if (diffHours < 6) {
        //   console.log("⏳ Skipping (6hr rule):", repayment.loan_id);
        //   continue;
        // }

        const amountKobo = Math.round(Number(repayment.total || 0) * 100);

        if (!amountKobo || amountKobo <= 0) {
          console.log("❌ Invalid repayment amount for:", repayment.id);

          await prisma.$executeRaw`
            UPDATE loan_repayment_schedules
            SET
              payment_status = 'FAILED',
              deduction_message = 'Invalid repayment amount',
              deduction_attempted_at = NOW(),
              updated_at = NOW()
            WHERE id = ${repayment.id}
          `;

          continue;
        }

const totalRepaymentsResult = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS total_repayments
  FROM loan_repayment_schedules
  WHERE loan_id = ${repayment.loan_id}
`;

const currentRepaymentResult = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS current_repayment_number
  FROM loan_repayment_schedules
  WHERE loan_id = ${repayment.loan_id}
    AND due_date <= ${repayment.due_date}
`;

const totalRepayments =
  totalRepaymentsResult?.[0]?.total_repayments || 1;

const currentRepaymentNumber =
  currentRepaymentResult?.[0]?.current_repayment_number || 1;

const customerName =
  mandate.account_name ||
  parsedAnswers.full_name ||
  parsedAnswers.account_name ||
  parsedAnswers.customer_name ||
  parsedAnswers.name ||
  "Customer";

const shortLoanRef = String(repayment.loan_account_number || "").slice(-4);

const narration =
  `Repayment ${currentRepaymentNumber} of ${totalRepayments} - ${customerName} - LN${shortLoanRef}`.substring(0, 100);




        const reference = `LR-${Date.now()}-${repayment.id}`;

        const paystackRes = await axios.post(
          `${PAYSTACK_BASE}/transaction/charge_authorization`,
          {
            authorization_code: mandate.authorization_code,
            email: customerEmail,
            amount: amountKobo,
            reference,
          },
          {
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET}`,
              "Content-Type": "application/json",
            },
          }
        );

        
const paystackData = paystackRes?.data || {};
const paystackStatus = String(paystackData?.data?.status || "").toLowerCase();
const paystackMessage =
  paystackData?.data?.gateway_response ||
  paystackData?.message ||
  "Charge sent to Paystack";

const lowerMessage = String(paystackMessage || "").toLowerCase();

const isRejected =
  paystackStatus === "failed" ||
  lowerMessage.includes("denied") ||
  lowerMessage.includes("fraud") ||
  lowerMessage.includes("declined");

//const isRejected = false;


if (isRejected) {
  await prisma.$executeRaw`
    UPDATE loan_repayment_schedules
    SET
      deduction_reference = ${reference},
      payment_status = 'FAILED',
      deduction_attempted_at = NOW(),
      deduction_message = ${paystackMessage},
      paid_at = NULL,
      updated_at = NOW()
    WHERE id = ${repayment.id}
  `;

  console.log(
    "❌ Charge rejected:",
    customerEmail,
    "| Ref:",
    reference,
    "| Status:",
    paystackStatus || "failed"
  );

  continue;
}

if (!repayment.settlement_account_number) {
  await prisma.$executeRaw`
    UPDATE loan_repayment_schedules
    SET
      payment_status = 'FAILED',
      deduction_reference = ${reference},
      deduction_attempted_at = NOW(),
      deduction_message = 'Settlement account number is missing on loan',
      updated_at = NOW()
    WHERE id = ${repayment.id}
  `;
  continue;
}

if (!CORE_BASE_URL || !CORE_TOKEN || !MFB_CODE || !LOAN_REPAYMENT_GL_CODE) {
  await prisma.$executeRaw`
    UPDATE loan_repayment_schedules
    SET
      payment_status = 'FAILED',
      deduction_reference = ${reference},
      deduction_attempted_at = NOW(),
      deduction_message = 'Core repayment configuration missing in environment',
      updated_at = NOW()
    WHERE id = ${repayment.id}
  `;
  continue;
}

const coreReference = Date.now().toString().slice(-10);

const corePayload = {
  RetrievalReference: coreReference,
  AccountNumber: repayment.settlement_account_number,
  NibssCode: MFB_CODE,
  Amount: amountKobo,
  Fee: 0,
  Narration: narration,
  Token: CORE_TOKEN,
  GLCode: LOAN_REPAYMENT_GL_CODE,
};

const coreUrl = `${CORE_BASE_URL}/thirdpartyapiservice/apiservice/CoreTransactions/Credit`;

console.log("🚀 Posting repayment to Core...");
console.log("🌐 CORE URL:", coreUrl);
console.log("🏦 Loan Account:", repayment.core_loan_account_number);
console.log("🏦 Settlement Account:", repayment.settlement_account_number);
console.log("📝 Narration:", narration);

console.log("📦 CORE Payload:", {
  ...corePayload,
  Token: corePayload.Token ? "***MASKED***" : null,
});

const coreRes = await axios.post(coreUrl, corePayload, {
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

const coreData = coreRes?.data || {};
console.log("✅ CORE RESPONSE:", coreData);

if (coreData.IsSuccessful && coreData.ResponseCode === "00") {
  await prisma.$executeRaw`
    UPDATE loan_repayment_schedules
    SET
      deduction_reference = ${reference},
      payment_status = 'PAID',
      deduction_attempted_at = NOW(),
      deduction_message = ${
  `Paystack: ${paystackMessage} | Core: ${
    coreData.ResponseMessage || "Approved by Financial Institution"
  }`
},
      paid_at = NOW(),
      updated_at = NOW()
    WHERE id = ${repayment.id}
  `;

  console.log(
    "✅ Repayment fully processed:",
    customerEmail,
    "| Paystack Ref:",
    reference,
    "| Core Ref:",
    coreData.Reference || coreReference
  );
} else {
  await prisma.$executeRaw`
    UPDATE loan_repayment_schedules
    SET
      deduction_reference = ${reference},
      payment_status = 'FAILED',
      deduction_attempted_at = NOW(),
      deduction_message = ${
        coreData.ResponseMessage || "Core repayment posting failed"
      },
      paid_at = NULL,
      updated_at = NOW()
    WHERE id = ${repayment.id}
  `;

  console.log("❌ Core posting failed:", coreData);
}
      } catch (err) {
        console.error("❌ Charge failed:", err.response?.data || err.message);

        await prisma.$executeRaw`
          UPDATE loan_repayment_schedules
          SET
            payment_status = 'FAILED',
            deduction_attempted_at = NOW(),
            deduction_message = ${
              err.response?.data?.message ||
              err.response?.data?.data?.gateway_response ||
              err.message
            },
            updated_at = NOW()
          WHERE id = ${repayment.id}
        `;
      }
    }

    console.log("✅ Loan repayment cron completed");
  } catch (err) {
    console.error("🔥 Cron error:", err.message);
  }
}

module.exports = { runLoanRepayments };
