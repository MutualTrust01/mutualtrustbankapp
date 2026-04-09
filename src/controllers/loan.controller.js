const LoanService = require("../core/loan.service");
const pool = require("../../db"); // adjust path to your db file
const { notifyLoanUpdate } = require("../utils/loanNotifier");
const prisma = require("../../prisma/client");
const axios = require("axios");
/* ===============================
   CREATE LOAN


================================ */

const BANK_MAP = {
  "044": "Access Bank",
  "023": "Citibank",
  "063": "Access Bank (Diamond)",
  "050": "Ecobank",
  "070": "Fidelity Bank",
  "011": "First Bank",
  "214": "First City Monument Bank",
  "058": "GTBank",
  "030": "Heritage Bank",
  "082": "Keystone Bank",
  "014": "Mainstreet Bank",
  "076": "Polaris Bank",
  "221": "Stanbic IBTC",
  "068": "Standard Chartered",
  "232": "Sterling Bank",
  "033": "UBA",
  "032": "Union Bank",
  "035": "Wema Bank",
  "057": "Zenith Bank",

  // Microfinance / fintech
  "090001": "Mutual Trust MFB",
  "090267": "Kuda Bank",
  "090110": "VFD Microfinance Bank",
  "090405": "Moniepoint MFB",
  "090180": "Rubies MFB",
  "090281": "Mint MFB",
  "090286": "Safe Haven MFB",
  "090272": "AB Microfinance Bank",
};

exports.createLoan = async (req, res) => {
  try {
   const result = await LoanService.createLoanApplication(req.body);

return res.status(201).json({
  success: true,
  message: result.message,
  data: result,
});

  } catch (err) {
  return res.status(400).json({
    success: false,
    message: err.message,
  });
}

};

/* ===============================
   GET LOANS BY CUSTOMER
================================ */
exports.getLoansByCustomer = async (req, res) => {
  try {
    const result =
      await LoanService.getLoansByCustomerId(req.params.customerId);

    return res.json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch loans",
      error: err?.response?.data || err.message,
    });
  }
};

/* ===============================
   REPAYMENT SCHEDULE
================================ */
exports.getRepaymentSchedule = async (req, res) => {
  try {
    const result =
      await LoanService.getRepaymentSchedule(
        req.params.loanAccountNumber
      );

    return res.json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch repayment schedule",
      error: err?.response?.data || err.message,
    });
  }
};

exports.getLoanRepaymentScheduleByLoanId = async (req, res) => {
  try {
    const { loanId } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        loan_id,
        loan_account_number,
        schedule_ref_id,
        due_date,
        principal,
        interest,
        fee,
        total,
        payment_status,
        paid_at,
        created_at
      FROM loan_repayment_schedules
      WHERE loan_id = $1
      ORDER BY due_date ASC
      `,
      [loanId]
    );

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("GET REPAYMENT SCHEDULE BY LOAN ID ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch repayment schedule by loan id",
      error: err.message,
    });
  }
};


/* ===============================
   LOAN ACCOUNT BALANCE
================================ */
exports.getLoanBalance = async (req, res) => {
  try {
    const result =
      await LoanService.getLoanBalance(
     req.params.loanAccountNumber
      );

    return res.json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch loan balance",
      error: err?.response?.data || err.message,
    });
  }
};



/* ===============================
   LOAN ACCOUNT STATEMENT
================================ */
exports.getLoanStatement = async (req, res) => {
  try {
    const { accountNumber, fromDate, toDate } = req.query; // ✅ FIXED

    const result =
      await LoanService.getLoanStatement(
        accountNumber,
        fromDate,
        toDate
      );

    return res.json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch loan statement",
      error: err?.response?.data || err.message,
    });
  }
};

/* ===============================
   REPAY LOAN
================================ */
exports.repayLoan = async (req, res) => {
  try {
    const result = await LoanService.repayLoan(req.body);

    return res.json({
      success: true,
      message: "Loan repayment successful",
      data: result.data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Loan repayment failed",
      error: err?.response?.data || err.message,
    });
  }
};

/* ===============================
   GET PENDING LOAN APPROVALS
================================ */
exports.getPendingLoanApprovals = async (req, res) => {

  try {

const result =
  await LoanService.getPendingLoanApprovals(req.user.role_id);

// normalize data
const loans = result?.data ?? result ?? [];

for (let loan of loans) {
  try {
    const applicationPayload = loan.application_payload || {};

    const accountNumber =
      applicationPayload.field_account_number ||
      applicationPayload.salary_account_number ||
      loan.account_number ||
      loan.salary_account_number;

    if (accountNumber) {
      const payslip = await prisma.payslipCustomer.findFirst({
        where: {
          account_number: String(accountNumber).replace(/\D/g, ""),
        },
        orderBy: {
          upload_month: "desc",
        },
      });

      loan.payslip = payslip
        ? {
            ippis: payslip.ippis_number,
            net_pay: payslip.net_pay,
          }
        : null;
    } else {
      loan.payslip = null;
    }
  } catch (err) {
    console.error("Payslip fetch error:", err);
    loan.payslip = null;
  }
}

return res.json({
  success: true,
  data: loans,
});    

  } catch (err) {

    console.error("APPROVAL FETCH ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pending loan approvals",
      error: err.message,
    });

  }

};




/* ===============================
   REJECT LOAN
================================ */
exports.rejectLoan = async (req, res) => {
  try {
    const { loanId } = req.params;

const { reason } = req.body;
    // Optional: keep debug if needed
    console.log("FILES RECEIVED:", req.files);
    console.log("BODY:", req.body);

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reason is required",
      });
    }

    const approverId = req.user.id;
    const io = req.app.get("io");

    /* ===============================
       1️⃣ REJECT VIA SERVICE
    =============================== */
    await LoanService.rejectLoan({
      loanId,
      approverId,
      reason,
      files: req.files || [],
    });

    /* ===============================
       2️⃣ FETCH FULL LOAN + RM INFO
    =============================== */
    const rmRes = await pool.query(
      `
 SELECT
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.push_subscription,
  l.loan_code,
  l.product_code,
  COALESCE(la.approved_amount,(ans.answers->>'loanAmount')::numeric) AS amount,
COALESCE(la.approved_tenor,(ans.answers->>'tenor')::int * 30) AS tenor_days,
la.approved_interest_rate AS interest_rate,
   
 
  l.status,
  CONCAT(ls.first_name,' ',ls.last_name) AS customer_name
FROM loans l
JOIN users u ON u.id = l.crm_staff_id
JOIN loan_sessions ls ON ls.id = l.session_id
LEFT JOIN loan_answers ans ON ans.loan_id = l.id
LEFT JOIN loan_approvals la ON la.loan_id = l.id
WHERE l.id = $1      `,
      [loanId]
    );

    /* ===============================
       3️⃣ SEND NOTIFICATION
    =============================== */
  if (rmRes.rows.length) {
  const rm = rmRes.rows[0];
  const webpush = req.app.get("webpush");   // ✅ ADD THIS

  try {
  await notifyLoanUpdate({
    io,
    webpush,                                 // ✅ ADD THIS
    pushSubscription: rm.push_subscription,  // ✅ ADD THIS
    userId: rm.id,
    email: rm.email,
    staffName: rm.first_name,

    loanCode: rm.loan_code,
    customerName: rm.customer_name,
    loanType: rm.product_code,
    amount: rm.amount,
    tenor: rm.tenor_days,
    interestRate: rm.interest_rate,
    monthlyRepayment: rm.monthly_repayment,
    stage: result?.level || null,

    status: "REJECTED",
    message: reason,

    updatedBy:
      `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim()
      || "System"
  });
} catch (e) {
  console.error("Notification failed:", e);
}
}

    /* ===============================
       4️⃣ RESPONSE
    =============================== */
    return res.json({
      success: true,
      message: "Loan rejected successfully",
    });

  } catch (err) {
    console.error("REJECT LOAN ERROR:", err);

    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};





/* ===============================
   APPROVE LOAN (ADMIN)
================================ */

exports.approveLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const approverId = req.user.id;

    const {
      approved_amount,
      approved_tenor,
      approved_interest_rate
    } = req.body;
    const io = req.app.get("io");

    /* ===============================
       1️⃣ APPROVE VIA SERVICE
    =============================== */
console.log("APPROVAL BODY:", req.body);
const approvedAmount =
  Number(req.body.approved_amount) ||
  Number(req.body.amount) ||
  0;

console.log("✅ FINAL APPROVED AMOUNT:", approvedAmount);

const result = await LoanService.approveLoan({
  loanId,
  approverId,
  comment: req.body.comment || null,
  approved_amount: approvedAmount,
  approved_tenor: Number(
    req.body.approved_tenor_days ?? req.body.approved_tenor
  ),
  approved_interest_rate: Number(req.body.approved_interest_rate)
});

    /* ===============================
       2️⃣ FETCH FULL LOAN + RM INFO
    =============================== */
    const rmRes = await pool.query(
      `
      SELECT
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.push_subscription,
  l.loan_code,
  l.product_code,
  COALESCE(la.approved_amount,(ans.answers->>'loanAmount')::numeric) AS amount,
COALESCE(la.approved_tenor,(ans.answers->>'tenor')::int * 30) AS tenor_days,
la.approved_interest_rate AS interest_rate,
  
  
  
  l.status,
  CONCAT(ls.first_name,' ',ls.last_name) AS customer_name
FROM loans l
JOIN users u ON u.id = l.crm_staff_id
JOIN loan_sessions ls ON ls.id = l.session_id
LEFT JOIN loan_answers ans ON ans.loan_id = l.id
LEFT JOIN loan_approvals la ON la.loan_id = l.id
WHERE l.id = $1      `,
      [loanId]
    );

    /* ===============================
       3️⃣ SEND NOTIFICATION
    =============================== */
   /* ===============================
   3️⃣ SEND NOTIFICATION
================================ */
if (rmRes.rows.length) {
  const rm = rmRes.rows[0];
  const webpush = req.app.get("webpush");

 try {
  await notifyLoanUpdate({
    io,
    webpush,
    pushSubscription: rm.push_subscription, // now valid
    userId: rm.id,
    email: rm.email,
    staffName: rm.first_name,

    loanCode: rm.loan_code,
    customerName: rm.customer_name,
    loanType: rm.product_code,
    amount: rm.amount,
    tenor: rm.tenor_days,
    interestRate: rm.interest_rate,
    
    stage: result?.level || null,
    status: result.finalStatus || rm.status || "APPROVED",

    message:
      result.message ||
      "The loan has been successfully approved and moved to the next stage.",

    updatedBy:
      `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim()
      || "System"
  });
} catch (e) {
  console.error("Notification failed:", e);
}
}

    /* ===============================
       4️⃣ RESPONSE
    =============================== */
    return res.json(result);

  } catch (err) {
    console.error("APPROVE LOAN ERROR:", err);

    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===============================
   RETURN LOAN
================================ */
exports.returnLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { reason } = req.body;

    if (!reason?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Reason is required",
      });
    }

    const approverId = req.user.id;
    const io = req.app.get("io");

    /* ===============================
       1️⃣ RETURN VIA SERVICE
    =============================== */
    await LoanService.returnLoan({
      loanId,
      approverId,
      reason,
      files: req.files || [],
    });

    /* ===============================
       2️⃣ FETCH FULL LOAN + RM INFO
    =============================== */
    const rmRes = await pool.query(
      `
SELECT
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.push_subscription,
  l.loan_code,
  l.product_code,

  COALESCE(la.approved_amount,(ans.answers->>'loanAmount')::numeric) AS amount,
  COALESCE(la.approved_tenor,(ans.answers->>'tenor')::int * 30) AS tenor_days,
  la.approved_interest_rate AS interest_rate,

   
  l.status,

  CONCAT(ls.first_name,' ',ls.last_name) AS customer_name

FROM loans l
JOIN users u ON u.id = l.crm_staff_id
JOIN loan_sessions ls ON ls.id = l.session_id
LEFT JOIN loan_answers ans ON ans.loan_id = l.id
LEFT JOIN loan_approvals la ON la.loan_id = l.id

WHERE l.id = $1
      `,
      [loanId]
);
    /* ===============================
       3️⃣ SEND NOTIFICATION
    =============================== */
   if (rmRes.rows.length) {
  const rm = rmRes.rows[0];
  const webpush = req.app.get("webpush");   // ✅ ADD THIS

  try {
  await notifyLoanUpdate({
    io,
    webpush,                                 // ✅ ADD THIS
    pushSubscription: rm.push_subscription,  // ✅ ADD THIS
    userId: rm.id,
    email: rm.email,
    staffName: rm.first_name,

    loanCode: rm.loan_code,
    customerName: rm.customer_name,
    loanType: rm.product_code,
    amount: rm.amount,
tenor: rm.tenor_days,
    interestRate: rm.interest_rate,
    monthlyRepayment: rm.monthly_repayment,
    stage: result?.level || null,

    status: "RETURNED",
    message: reason,

    updatedBy:
      `${req.user.first_name || ""} ${req.user.last_name || ""}`.trim()
      || "System"
  });
} catch (e) {
  console.error("Notification failed:", e);
}

}
    /* ===============================
       4️⃣ RESPONSE
    =============================== */
    return res.json({
      success: true,
      message: "Loan returned for correction",
    });

  } catch (err) {
    console.error("RETURN LOAN ERROR:", err);

    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===============================
   PREVIEW CORE LOAN PAYLOAD
================================ */
exports.previewCoreLoanPayload = async (req, res) => {
  try {
    const { loanId } = req.params;

    const payload =
      await LoanService.previewCoreLoanPayload(loanId);

    return res.json({
      success: true,
      data: payload,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

exports.createLoanInCore = async (req, res) => {
  try {
    const { loanId } = req.params;

    const result =
      await LoanService.createLoanInCoreBanking(loanId);

    return res.json({
      success: true,
      message: "Loan created successfully in core banking",
      data: result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Core banking loan creation failed",
      error: err.message,
    });
  }
};

/* ===============================
   FULL LOAN LIFECYCLE (APPROVE + CORE + DISBURSE + TRANSFER)
================================ */
exports.processLoanLifecycle = async (req, res) => {
  try {
    const { loanId } = req.params;
    const approverId = req.user.id;

    // 🔥 GET EDITABLE PRODUCT VALUES FROM FRONTEND
    
const {
  approved_amount,
  interest_rate,
  tenor,
  moratorium,
  computation_mode,
  ippis,
  economic_sector
} = req.body;

    // Optional: basic validation
    if (interest_rate && Number(interest_rate) < 0) {
      throw new Error("Invalid interest rate");
    }

    

const overrides = {};

if (approved_amount !== undefined)
  overrides.approved_amount = Number(approved_amount);

if (interest_rate !== undefined)
  overrides.interest_rate = Number(interest_rate);

if (tenor !== undefined)
  overrides.tenor = Number(tenor);

if (moratorium !== undefined)
  overrides.moratorium = Number(moratorium);

if (computation_mode !== undefined)
  overrides.computation_mode = computation_mode;

if (ippis !== undefined)
  overrides.ippis = ippis;

if (economic_sector !== undefined)
  overrides.economic_sector = Number(economic_sector);

console.log("PROCESS LOAN BODY >>>", req.body);
console.log("PROCESS LOAN OVERRIDES >>>", overrides);

    // 🔥 PASS overrides TO SERVICE
    const result =
      await LoanService.processLoanLifecycle(
        loanId,
        approverId,
        overrides
      );

    return res.json(result);

  } catch (err) {
    console.error("PROCESS LIFECYCLE ERROR:", err);

    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};




// loanController.js (or wherever you handle loan-related actions)


exports.validateSalaryAccount = async (req, res) => {
  try {
    const { loanId } = req.params;

    const result = await LoanService.validateSalaryAccount(loanId);

    return res.json(result);

  } catch (err) {

    // 🔥 FULL ERROR LOG
    console.error("❌ Salary Validation Error:", {
      message: err.message,
      stack: err.stack,
      response: err.response?.data || null,
      loanId: req.params.loanId
    });

    return res.status(400).json({
      success: false,
      message: err.message || "Salary validation failed"
    });
  }
};


/* ===============================
   GET SINGLE LOAN BY ID
================================ */
/* ===============================
   GET SINGLE LOAN BY ID
================================ */
exports.getLoanById = async (req, res) => {
  try {
    const { loanId } = req.params;

    // 🔒 Prevent invalid UUID values like "operational"
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(loanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID format"
      });
    }
    const result = await pool.query(
      `
      SELECT 
        l.*,
        la.answers AS application_payload,

        -- ================= SESSION DATA =================
        ls.first_name,
        ls.last_name,
        ls.bvn,
        ls.bvn_nin,
        ls.date_of_birth,
        ls.core_customer_id,
        ls.verification_payload,

        -- ================= PRODUCT NAME =================
        ss.loan_settings->'productMeta'->(l.product_code)::text->>'name'
          AS product_name,

        -- ================= APPROVAL HISTORY =================
        COALESCE(ah.approval_history, '[]') AS approval_history

      FROM loans l
      LEFT JOIN loan_answers la ON la.loan_id = l.id
      LEFT JOIN loan_sessions ls ON ls.id = l.session_id
      LEFT JOIN system_settings ss ON TRUE

      LEFT JOIN (
        SELECT 
          la.loan_id,
          json_agg(
            json_build_object(
  'approver_id', la.approver_id,
  'approver_name', CONCAT(
    INITCAP(u.first_name),
    ' ',
    INITCAP(u.last_name)
  ),
  'approval_level', la.approval_level,
  'approval_status', la.approval_status,
  'approval_reason', la.approval_reason,
  'approved_amount', la.approved_amount,
  'approved_tenor_days', la.approved_tenor,
  'approved_interest_rate', la.approved_interest_rate,
  'created_at', la.created_at,
  'files', COALESCE((
    SELECT json_agg(
      json_build_object(
        'file_name', laf.file_name,
        'file_path', laf.file_path
      )
    )
    FROM loan_approval_files laf
    WHERE laf.approval_id = la.id
  ), '[]'::json)
)
            ORDER BY la.approval_level ASC
          ) AS approval_history
        FROM loan_approvals la
        LEFT JOIN users u ON u.id = la.approver_id
        GROUP BY la.loan_id
      ) ah ON ah.loan_id = l.id

      WHERE l.id = $1
      `,
      [loanId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    const loan = result.rows[0];

    // 🔥 Normalize verification payload
    const verification =
      typeof loan.verification_payload === "string"
        ? JSON.parse(loan.verification_payload)
        : loan.verification_payload || {};

    return res.json({
      success: true,
      data: {
        ...loan,
        verification_payload: verification
      },
    });

  } catch (err) {
    console.error("GET LOAN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch loan",
    });
  }
};





/* ===============================
   CHECK CORE CUSTOMER BY LOAN ID
================================ */
exports.checkCoreCustomerByLoanId = async (req, res) => {
  try {
    const { loanId } = req.params;

    const result =
      await LoanService.checkCoreCustomerByLoanId(loanId);

    return res.json({
      success: true,
      ...result, // keep frontend structure clean
    });

  } catch (err) {
    console.error("CORE CHECK ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};



exports.openAccountForCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;

    const result =
      await LoanService.createAccountForCustomer(customerId);

    return res.json({
      success: true,
      data: result,
    });

  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};


/* ===============================
   GET MY LOAN REQUESTS (RM)
================================ */
exports.getMyLoanRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await LoanService.getLoansByRmId(userId);

    return res.json(result);

  } catch (err) {
    console.error("MY REQUESTS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch loan requests",
    });
  }
};


/* ===============================
   GET LOAN TRANSFERS (FILTERABLE)
================================ */
exports.getLoanTransfers = async (req, res) => {
  try {
    const {
      status,
      manualFunding,
      fromDate,
      toDate
    } = req.query;

    const result =
      await LoanService.getLoanTransfers({
        status: status || null,
        manualFunding: manualFunding === "true",
        fromDate: fromDate || null,
        toDate: toDate || null
      });

    return res.json(result);

  } catch (err) {
    console.error("TRANSFER FETCH ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

exports.getOperationalLoans = async (req, res) => {
  try {

    const result = await pool.query(`
      
SELECT
  l.id,
  l.loan_code,
  l.product_code,
  l.status,
  l.disbursement_status,
l.transfer_status,
  l.created_at,

ls.first_name,
ls.last_name,
CONCAT(ls.first_name,' ',ls.last_name) AS customer_name,

  ls.bvn,

  -- 🔹 ACCOUNT OFFICER
  
CONCAT(u.first_name,' ',u.last_name) AS rm_name,
u.phone_number AS rm_phone,

  ls.face_verification_status,
  ls.face_match_score,
  ls.face_verified_at,
  ls.face_verification_payload AS face_payload,

  ans.answers AS application_payload,

  ls.verification_payload->'bvn' AS bvn_payload,
  ls.verification_payload->'nin' AS nin_payload,

  ss.loan_settings->'productMeta'->(l.product_code)::text->>'name'
    AS product_name

FROM loans l

LEFT JOIN loan_sessions ls
  ON ls.id = l.session_id

-- 🔹 ADD THIS JOIN
LEFT JOIN users u
  ON u.id = l.crm_staff_id

LEFT JOIN loan_answers ans
  ON ans.loan_id = l.id

LEFT JOIN system_settings ss
  ON TRUE
WHERE
  l.status IN ('APPROVED', 'DISBURSED')
  OR l.transfer_status IN ('PENDING', 'FAILED', 'COMPLETED')
ORDER BY
  CASE
    WHEN l.transfer_status = 'FAILED' THEN 1
    WHEN l.transfer_status = 'PENDING' THEN 2
    WHEN l.transfer_status = 'COMPLETED' THEN 3
    ELSE 4
  END,
  l.created_at DESC
    `);

    return res.json({
      success: true,
      data: result.rows
    });

  } catch (err) {

    console.error("OPERATIONS FETCH ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch operational loans"
    });

  }
};


exports.getActiveLoans = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        l.id,
        l.loan_code,
        l.product_code,
        l.status,
        l.disbursement_status,
        l.transfer_status,
        l.core_loan_account_number,
        l.settlement_account_number,
        l.created_at,

        CONCAT(ls.first_name, ' ', ls.last_name) AS customer_name,
        ls.first_name,
        ls.last_name,
        ls.bvn,

        CONCAT(u.first_name, ' ', u.last_name) AS rm_name,

        ans.answers AS application_payload,

        ss.loan_settings->'productMeta'->(l.product_code)::text->>'name'
          AS product_name

      FROM loans l
      LEFT JOIN loan_sessions ls ON ls.id = l.session_id
      LEFT JOIN users u ON u.id = l.crm_staff_id
      LEFT JOIN loan_answers ans ON ans.loan_id = l.id
      LEFT JOIN system_settings ss ON TRUE

      WHERE l.disbursement_status = 'COMPLETED'

      ORDER BY l.created_at DESC
    `);

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("ACTIVE LOANS FETCH ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch active loans",
    });
  }
};

/* ===============================
   TRANSFER LOAN (DISBURSEMENT)
================================ */
exports.transferLoan = async (req, res) => {
  const client = await pool.connect();
 const { loanId } = req.params;
  try {
   

    await client.query("BEGIN");

    /* ================= LOCK LOAN ================= */
    const loanRes = await client.query(
      `SELECT * FROM loans WHERE id = $1 FOR UPDATE`,
      [loanId]
    );

    if (!loanRes.rows.length) {
      throw new Error("Loan not found");
    }

    const loan = loanRes.rows[0];

    /* ================= STATUS CHECK ================= */
    
if (loan.transfer_status === "COMPLETED") {
  throw new Error("Loan already transferred");
}
if (loan.disbursement_status !== "COMPLETED") {
  throw new Error("Loan not yet disbursed");
}    

    /* ================= LOAD TRANSFER DATA ================= */
    const reload = await client.query(`
  SELECT
    l.settlement_account_number,
    l.salary_account_number,
    l.salary_account_name,
    l.loan_code,
    l.transfer_tracking_ref,
    ls.salary_bank_code
  FROM loans l
  LEFT JOIN loan_sessions ls
    ON ls.id = l.session_id
  WHERE l.id = $1
`, [loanId]);
    const data = reload.rows[0];

    if (!data.settlement_account_number || !data.salary_account_number) {
      throw new Error("Missing settlement or salary account");
    }

    /* ================= GET AMOUNT ================= */
 
console.log("🔥 TRANSFER DEBUG BODY:", req.body);



const transferAmount = Number(req.body.amount);

if (!Number.isFinite(transferAmount) || transferAmount <= 0) {
  throw new Error("Invalid transfer amount");
}

    /* ================= TRANSFER REF ================= */
    let transferRef = data.transfer_tracking_ref;

    if (!transferRef) {
      transferRef = Date.now().toString().slice(-12);

      await client.query(`
        UPDATE loans
        SET transfer_tracking_ref = $2
        WHERE id = $1
      `, [loanId, transferRef]);
    }

    /* ================= IDEMPOTENCY ================= */
    const existing = await client.query(`
      SELECT id FROM loan_financial_events
      WHERE loan_id = $1
      AND event_type = 'TRANSFER'
      AND reference = $2
      AND status = 'SUCCESS'
    `, [loanId, transferRef]);

    if (existing.rows.length) {
      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "Transfer already completed",
        transferReference: transferRef
      });
    }

    /* ================= INSERT EVENT ================= */
    await client.query(`
      INSERT INTO loan_financial_events
      (loan_id, event_type, reference, amount, status)
      VALUES ($1, 'TRANSFER', $2, $3, 'INITIATED')
    `, [loanId, transferRef, transferAmount]);



/* ================= CALL CORE ================= */
const coreBankingClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");


/* ================= NAME ENQUIRY FIRST ================= */

if (!data.salary_bank_code) {
  throw new Error("Salary bank code missing before transfer");
}

const nameEnquiryPayload = {
  BankCode: String(data.salary_bank_code).trim(),
  AccountNumber: String(data.salary_account_number || "").trim(),

  // try to force NIP instead of ISW
  Channel: "NIP",
  Gateway: "NIP",
  PaymentGateway: "NIP",

  Token: process.env.CORE_API_KEY
};

console.log("🔥 NAME ENQUIRY REQUEST PAYLOAD:");
console.log(JSON.stringify(nameEnquiryPayload, null, 2));

const nameEnquiry = await coreBankingClient.post(
  ENDPOINTS.TRANSFER.NAME_ENQUIRY,
  nameEnquiryPayload
);

const enquiryData = nameEnquiry?.data || {};


console.log("🔥 NAME ENQUIRY RESPONSE:", enquiryData);

const rawNipSessionId =
  enquiryData?.NIPSessionID ||
  enquiryData?.NIPSessionId ||
  enquiryData?.SessionID ||
  enquiryData?.sessionId ||
  enquiryData?.Message?.NIPSessionID ||
  enquiryData?.Message?.NIPSessionId ||
  enquiryData?.Message?.SessionID ||
  enquiryData?.Message?.sessionId ||
  null;


const nipSessionId =
  rawNipSessionId && String(rawNipSessionId).trim()
    ? String(rawNipSessionId).trim()
    : null;

const enquiryGateway = String(
  enquiryData?.DefaultGateWay ||
  enquiryData?.defaultGateway ||
  ""
).toUpperCase();

const useNipGateway = !!nipSessionId;

console.log("🔥 RESOLVED NIP SESSION ID:", nipSessionId);
console.log("🔥 NAME ENQUIRY GATEWAY:", enquiryGateway);


if (!nipSessionId) {
  console.log("🔥 FULL NAME ENQUIRY RESPONSE JSON:");
  console.log(JSON.stringify(enquiryData, null, 2));
  console.log("⚠️ No NIP session returned. Falling back without NIPSessionID.");
}

/* ================= INTERBANK TRANSFER ================= */


const transferPayload = {
  TransactionReference: transferRef,
  Payer: data.salary_account_name || "Loan Customer",
  PayerAccountNumber: data.settlement_account_number,
  ReceiverAccountNumber: data.salary_account_number,
  ReceiverBankCode: data.salary_bank_code,
  ReceiverName: data.salary_account_name,
  Amount: String(Math.round(transferAmount)),
  Narration: `Loan disbursement ${data.loan_code}`,
  ...(useNipGateway ? { NIPSessionID: nipSessionId } : {}),
  Token: process.env.CORE_API_KEY
};

console.log("🔥 FINAL TRANSFER PAYLOAD:");
console.log(JSON.stringify(transferPayload, null, 2));

const transferUrl = `${process.env.CORE_BASE_URL}${ENDPOINTS.TRANSFER.INTERBANK_TRANSFER}`;

console.log("🔥 DIRECT TRANSFER URL:", transferUrl);



let transfer;
let transferData = null;
let responseMessage = "";

for (let i = 0; i < 5; i++) {
  try {
    transfer = await axios.post(
      transferUrl,
      transferPayload,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );
  } catch (transferErr) {
    console.error("🔥 DIRECT TRANSFER AXIOS ERROR STATUS:", transferErr?.response?.status);
    console.error("🔥 DIRECT TRANSFER AXIOS ERROR DATA:", transferErr?.response?.data);
    console.error("🔥 DIRECT TRANSFER AXIOS ERROR MESSAGE:", transferErr?.message);

    transferData = transferErr?.response?.data || {};
    responseMessage = String(
      transferData?.ResponseMessage ||
      transferData?.Message ||
      transferErr?.message ||
      ""
    ).toLowerCase();

    const shouldWait =
      responseMessage.includes("currently been created") ||
      responseMessage.includes("please wait") ||
      responseMessage.includes("awaiting confirmation") ||
      responseMessage.includes("processing");

    if (!shouldWait) {
      throw new Error(
        transferErr?.response?.data?.ResponseMessage ||
        transferErr?.response?.data?.Message ||
        transferErr?.message ||
        "Interbank transfer request failed"
      );
    }

    console.log(`⏳ Transfer retry ${i + 1}/5 - core says wait`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    continue;
  }

  transferData = transfer?.data;

  console.log(`🔥 CORE TRANSFER RESPONSE ATTEMPT ${i + 1}:`, transferData);
  console.log("🔥 NIP SESSION ID USED:", nipSessionId);

  responseMessage = String(
    transferData?.ResponseMessage ||
    transferData?.Message ||
    transferData?.message ||
    ""
  ).toLowerCase();

  const success =
    transferData?.IsSuccessful === true ||
    transferData?.IsSuccessFul === true ||
    responseMessage.includes("successful");

  const pending =
    responseMessage.includes("awaiting confirmation") ||
    responseMessage.includes("processing") ||
    responseMessage.includes("pending") ||
    responseMessage.includes("currently been created") ||
    responseMessage.includes("please wait");

  if (success || pending) {
    break;
  }

  throw new Error(
    transferData?.ResponseMessage ||
    transferData?.Message ||
    transferData?.message ||
    "Transfer failed"
  );
}

const success =
  transferData?.IsSuccessful === true ||
  transferData?.IsSuccessFul === true ||
  responseMessage.includes("successful");

const pending =
  responseMessage.includes("awaiting confirmation") ||
  responseMessage.includes("processing") ||
  responseMessage.includes("pending") ||
  responseMessage.includes("currently been created") ||
  responseMessage.includes("please wait");

    /* ================= SUCCESS ================= */
    await client.query(`
  UPDATE loan_financial_events
  SET status = $2,
      core_response = $3
  WHERE loan_id = $1
  AND reference = $4
`, [
  loanId,
  success ? "SUCCESS" : "PENDING",
  JSON.stringify(transferData),
  transferRef
]);



await client.query(`
  UPDATE loans
  SET
    transfer_status = $2,
    destination_account_number = $3,
    destination_bank_code = $4,
    destination_account_name = $5,
    updated_at = NOW()
  WHERE id = $1
`, [
  loanId,
  success ? "COMPLETED" : "PENDING",
  data.salary_account_number,
  data.salary_bank_code,
  data.salary_account_name
]);


    await client.query("COMMIT");

    return res.json({
  success: true,
  pending,
  message: success
    ? "Transfer completed successfully"
    : "Awaiting confirmation status.",
  transferReference: transferRef,
  settlementAccount: data.settlement_account_number,
  destinationAccount: data.salary_account_number
});


} catch (err) {
  await client.query("ROLLBACK");

  console.error("TRANSFER ERROR:", err);

  // ✅ SET FAILED STATUS
  try {
    await pool.query(`
      UPDATE loans
      SET transfer_status = 'FAILED'
      WHERE id = $1
    `, [loanId]);
  } catch (e) {
    console.error("FAILED STATUS UPDATE ERROR:", e);
  }

  return res.status(400).json({
    success: false,
    message: err.message
  });
}  
 finally {
    client.release();
  }
};






exports.getTransferPreview = async (req, res) => {
  try {
    const { loanId } = req.params;

    /* ================= GET LOAN ================= */
    
const loanRes = await pool.query(
  `
  SELECT
    l.settlement_account_number,
    l.salary_account_number,
    l.salary_account_name,
    ls.salary_bank_code

  FROM loans l
  LEFT JOIN loan_sessions ls
    ON ls.id = l.session_id

  WHERE l.id = $1
  `,
  [loanId]
);
    if (!loanRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    const loan = loanRes.rows[0];

    

    /* ================= GET ACCOUNTS FROM CORE ================= */
    const coreData =
      await LoanService.checkCoreCustomerByLoanId(loanId);

    const accounts = coreData?.accounts || [];

    /* ================= MATCH EXACT ACCOUNT ================= */
    


// ✅ ALWAYS PICK CORRECT SETTLEMENT ACCOUNT (NOT LOAN)

// ✅ PRIORITY: match by settlement account number if possible


if (!loan.settlement_account_number) {
  return res.status(400).json({
    success: false,
    message: "Settlement account not saved for this loan",
  });
}

const settlementAccountNumber = String(
  loan.settlement_account_number
).trim();

const normalizeAcct = (value) =>
  String(value || "")
    .replace(/\s/g, "")
    .replace(/^0+/, "")
    .trim();

const savedSettlement = normalizeAcct(loan.settlement_account_number);

const acc = accounts.find((a) => {
  const candidates = [
    a.AccountNumber,
    a.accountNumber,
    a.NUBAN,
    a.nuban,
    a.AlternateAccountNumber,
    a.alternateAccountNumber,
  ].map(normalizeAcct);

  return candidates.includes(savedSettlement);
});

console.log("DB settlement raw:", loan.settlement_account_number);
console.log("DB settlement normalized:", savedSettlement);
console.log(
  "CORE account candidates:",
  accounts.map((a) => ({
    AccountNumber: a.AccountNumber,
    accountNumber: a.accountNumber,
    NUBAN: a.NUBAN,
    nuban: a.nuban,
  }))
);
console.log("MATCHED ACCOUNT:", acc);

console.log("ALL ACCOUNTS:", accounts);
console.log("DB SETTLEMENT ACCOUNT:", settlementAccountNumber);
console.log("SELECTED ACCOUNT:", acc);

if (!acc) {
  return res.status(400).json({
    success: false,
    message: "Saved settlement account not found in core account list",
  });
}


    /* ================= RETURN CLEAN RESPONSE ================= */
    return res.json({
  success: true,
  data: {
    settlementAccount: {
      accountNumber: loan.settlement_account_number,
     accountName:
  acc.AccountName ||
  acc.accountName ||
  "Settlement Account",

      availableBalance: Number(
        String(
          acc.AvailableBalance ||
          acc.availableBalance ||
          0
        ).replace(/,/g, "")
      ),

      ledgerBalance: Number(
        String(
          acc.LedgerBalance ||
          acc.ledgerBalance ||
          0
        ).replace(/,/g, "")
      ),

      withdrawableBalance: Number(
        String(
          acc.WithdrawableAmount ||
          acc.withdrawableAmount ||
          acc.withdrawableBalance ||
          0
        ).replace(/,/g, "")
      ),
    },

    // ✅ ADD THIS BLOCK (THIS IS WHAT YOU WERE MISSING)
    
salaryAccount: {
  accountNumber: loan.salary_account_number,
  accountName: loan.salary_account_name,
  bankCode: loan.salary_bank_code,
  bankName: BANK_MAP[loan.salary_bank_code] || "Unknown Bank"
}
  },
});
  } catch (err) {
    console.error("Transfer preview error:", err);

    return res.status(500).json({
      success: false,
      message:
        err.message || "Failed to fetch settlement account",
    });
  }
};
