const pool = require("../../db");
const LoanService = require("../core/loan.service");
const { sendStyledMail } = require("../../mailer");
/**
 * ==========================================
 * GET RELATIONSHIP MANAGER (PUBLIC)
 * Used to validate RM from URL
 * ==========================================
 */
exports.getPublicRelationshipManager = async (req, res) => {
  try {
    const { id } = req.params;

    // Guard: numeric ID only
    if (!id || isNaN(Number(id))) {
      return res.status(404).json({
        success: false,
        message: "Relationship manager not found",
      });
    }

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        r.name AS designation
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE
        u.id = $1
        AND u.can_access_hrm_crm = TRUE
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Relationship manager not found",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("RM fetch error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch relationship manager",
    });
  }
};

/**
 * ==========================================
 * PUBLIC LOAN APPLICATION
 * ==========================================
 */
exports.createPublicLoan = async (req, res) => {
  try {
     const { loanSessionId, crmStaffId } = req.body;

    /* ================= BASIC VALIDATION ================= */
    if (!loanSessionId) {
      return res.status(400).json({
        success: false,
        message: "loanSessionId is required",
      });
    }

    /* ================= SESSION CHECK ================= */
    const { rows } = await pool.query(
      `
SELECT
  bvn,
  face_verification_status,
  verification_status,
  identity_locked,
  expires_at
FROM loan_sessions
WHERE id = $1      
      `,
      [loanSessionId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Invalid loan session",
      });
    }

    const session = rows[0];



/* ================= AUTO VERIFY FROM CORE ================= */

try {
  if (session.bvn) {

    const coreCustomer = await LoanService.getCustomerByBVN(session.bvn);

    const customerId =
      coreCustomer?.data?.Message?.CustomerID ||
      coreCustomer?.data?.Message?.customerID ||
      null;

    if (customerId) {
      console.log("✅ Core customer found — auto-verifying session");

      await pool.query(
        `
        UPDATE loan_sessions
        SET verification_status = 'FULLY_VERIFIED',
            updated_at = NOW()
        WHERE id = $1
        `,
        [loanSessionId]
      );

      // update local variable too
      session.verification_status = "FULLY_VERIFIED";
    }
  }
} catch (err) {
  console.error("⚠ Core verification sync failed:", err.message);
}


/* ================= LOCAL BVN LOAN CHECK ================= */

try {

if (session.bvn) {

const localLoanCheck = await pool.query(
`
SELECT loan_code, status, disbursement_status
FROM loans
WHERE bvn = $1
AND status NOT IN ('REJECTED','RETURNED','CLOSED')
LIMIT 1
`,
[session.bvn]
);

if (localLoanCheck.rows.length) {

const loan = localLoanCheck.rows[0];

return res.status(409).json({
success: false,
code: "BVN_ACTIVE_LOAN",
message:
"You already have an existing loan application in the system.",
loanCode: loan.loan_code,
loanStatus: loan.status
});

}

}

} catch (error) {

console.error("Local BVN loan check failed:", error.message);

}


/* ================= CORE LOAN CHECK ================= */

try {

  if (session.bvn) {

    /* STEP 1 — GET CORE CUSTOMER */
    const coreCustomer =
      await LoanService.getCustomerByBVN(session.bvn);

    const customerId =
      coreCustomer?.data?.Message?.CustomerID ||
      coreCustomer?.data?.Message?.customerID ||
      null;

    if (customerId) {

      /* STEP 2 — GET CUSTOMER LOANS */
      const coreLoans =
        await LoanService.getLoansByCustomerId(customerId);

      const loans =
        coreLoans?.data?.Message?.Loans ||
        coreLoans?.data?.Loans ||
        [];

      if (Array.isArray(loans) && loans.length > 0) {

        /* STEP 3 — EXTRACT LOAN ACCOUNT */
        const loanAccount =
          loans.find(
            l =>
              l.LoanAccountNumber ||
              l.loanAccountNumber ||
              l.AccountNumber ||
              l.AccountNo ||
              l.Number ||
              l.NUBAN
          );

        const loanAccountNumber =
          loanAccount?.LoanAccountNumber ||
          loanAccount?.loanAccountNumber ||
          loanAccount?.AccountNumber ||
          loanAccount?.AccountNo ||
          loanAccount?.Number ||
          loanAccount?.NUBAN;

        if (loanAccountNumber) {

          /* STEP 4 — CHECK BALANCE */
          const balanceRes =
            await LoanService.getLoanBalance(loanAccountNumber);

          const loan =
            balanceRes?.data?.Message?.[0] ||
            balanceRes?.data?.Message ||
            balanceRes?.data;

const outstanding = Number(loan?.LedgerBalance || 0);          

          if (outstanding > 0) {

            return res.status(409).json({
              success: false,
              code: "ACTIVE_CORE_LOAN",
              message:
                "You currently have an active loan. Please repay your outstanding balance before applying for another loan.",
              loanAccountNumber,
              outstandingBalance: outstanding
            });

          }

        }

      }

    }

  }

} catch (error) {

  console.error("CORE loan check failed for BVN:", session.bvn, error.message);

}



/* ================= EXISTING LOAN CHECK ================= */


const activeLoan = await pool.query(
`
SELECT
  loan_code,
  status,
  disbursement_status
FROM loans
WHERE session_id = $1
AND status NOT IN ('REJECTED','RETURNED')
LIMIT 1
`,
[loanSessionId]
);

if (activeLoan.rows.length) {

  const loan = activeLoan.rows[0];


let message = "You already have a loan in progress.";

if (loan.status === "UNDER_REVIEW" || loan.status === "PENDING") {
  message = "You already have a pending loan application under review.";
}

if (loan.status === "APPROVED") {
  message = "Your loan has already been approved and is awaiting disbursement.";
}

if (loan.disbursement_status === "DISBURSED") {
  message = "You currently have an active loan. Please repay your outstanding balance before applying for another loan.";
}

  
return res.status(409).json({
  success: false,
  code: "LOAN_ALREADY_EXISTS",
  message,
  loanStatus: loan.status,
  loanCode: loan.loan_code
});

}

    /* ================= SESSION EXPIRY ================= */
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        message: "Loan session expired. Please restart application.",
      });
    }

    /* ================= IDENTITY LOCK ================= */
    
if (session.verification_status !== "FULLY_VERIFIED") {
  return res.status(403).json({
    success: false,
    message: "Identity verification not complete",
  });
}

    /* ================= RM VALIDATION (IF PROVIDED) ================= */
    if (crmStaffId) {
        if (isNaN(Number(crmStaffId))) {
        return res.status(400).json({
          success: false,
          message: "Invalid relationship manager selected",
        });
      }

      const rmCheck = await pool.query(
        `
        SELECT id
        FROM users
        WHERE
          id = $1
          AND can_access_hrm_crm = TRUE
        `,
        [crmStaffId]
      );

      if (!rmCheck.rows.length) {
        return res.status(400).json({
          success: false,
          message: "Invalid relationship manager selected",
        });
      }
    }

    /* ================= PARSE DYNAMIC ================= */
    if (req.body.dynamic && typeof req.body.dynamic === "string") {
      try {
        req.body.dynamic = JSON.parse(req.body.dynamic);
      } catch (err) {
        console.error("Failed to parse dynamic payload:", err);
        return res.status(400).json({
          success: false,
          message: "Invalid dynamic payload format",
        });
      }
    }


/* ================= ENSURE BANK CODE FROM DYNAMIC ================= */


if (req.body.dynamic && typeof req.body.dynamic === "object") {
  const dynamic = req.body.dynamic;

  const bankCode =
    dynamic.field_bank_code ||
    dynamic.field_select_bank_code ||
    dynamic.bank_code ||
    req.body.bank_code ||
    null;

 const bankName =
  dynamic.field_bank_name ||
  dynamic.field_select_bank_name ||
  dynamic.bank_name ||
  req.body.bank_name ||
  req.body.dynamic?.field_bank_name ||
  "N/A";
 
  const accountNumber =
    dynamic.field_account_number ||
    dynamic.account_number ||
    req.body.account_number ||
    null;
const accountName =
  dynamic.field_account_name ||
  dynamic.account_name ||
  "N/A";

  if (bankName) {
    req.body.bank_name = bankName;
  }

  if (bankCode) {
    req.body.bank_code = bankCode;
  }

  if (accountNumber) {
    req.body.account_number = accountNumber;
  }

  if (!bankCode) {
    return res.status(400).json({
      success: false,
      message: "Bank code missing. Please select your bank again.",
    });
  }

  await pool.query(
    `
    UPDATE loan_sessions
    SET salary_bank_code = $1,
        updated_at = NOW()
    WHERE id = $2
    `,
    [bankCode, loanSessionId]
  );
}



/* ================= PAYSLIP ELIGIBILITY CHECK (CONFIG DRIVEN) ================= */

/* GET LOAN SETTINGS */
const settingsRes = await pool.query(
  `SELECT loan_settings FROM system_settings LIMIT 1`
);

const loanSettings = settingsRes.rows[0]?.loan_settings || {};

/* DETECT PRODUCT CODE */
const productCode = req.body.product_code;

/* GET PRODUCT CONFIG */
const productConfig =
  loanSettings.productApprovals?.[productCode] || {};

/* CHECK IF PAYSLIP IS REQUIRED */
const requirePayslip =
  productConfig.requirePayslip === true;

if (requirePayslip) {

  const accountNumber =
    req.body.dynamic?.field_account_number ||
    req.body.dynamic?.account_number ||
    null;

  if (!accountNumber) {
    return res.status(400).json({
      success: false,
      message: "Account number is required for eligibility verification"
    });
  }

  const payrollCheck = await pool.query(
  `
  SELECT account_number
  FROM payslip_customers
  WHERE account_number = $1
  LIMIT 1
  `,
  [accountNumber]
  );

  if (!payrollCheck.rows.length) {
    return res.status(403).json({
      success: false,
      code: "NOT_ELIGIBLE",
      message:
        "You are not eligible for this loan product. Your salary account was not found in the bank payroll system."
    });
  }

}


console.log("📦 Dynamic payload:", req.body.dynamic);
console.log("🏦 Bank code received:", req.body.bank_code);
console.log("🏦 Bank name received:", req.body.bank_name);

    /* ================= CREATE LOAN ================= */
    const result = await LoanService.createLoanApplication(req.body);




/* ================= EMAIL NOTIFICATIONS (FULL PROFESSIONAL SAFE VERSION) ================= */
try {

  /* ================= FETCH SESSION ================= */
  const sessionData = await pool.query(
    `SELECT * FROM loan_sessions WHERE id = $1`,
    [loanSessionId]
  );

  const sessionRow = sessionData.rows[0] || {};

  /* ================= PARSE VERIFICATION PAYLOAD SAFELY ================= */
  let verificationPayload = {};
  try {
    if (sessionRow.verification_payload) {
      verificationPayload =
        typeof sessionRow.verification_payload === "string"
          ? JSON.parse(sessionRow.verification_payload)
          : sessionRow.verification_payload;
    }
  } catch (e) {
    console.log("⚠ Could not parse verification payload");
    verificationPayload = {};
  }

  const dynamic = req.body?.dynamic || {};

  /* =========================================================
     CUSTOMER DETAILS
  ========================================================== */

  const fullName =
    `${sessionRow.first_name || verificationPayload?.bvn?.firstName || ""} ${
      sessionRow.last_name || verificationPayload?.bvn?.lastName || ""
    }`.trim() || "Customer";

  const phone =
    sessionRow.mobile ||
    sessionRow.phone ||
    verificationPayload?.bvn?.mobile ||
    verificationPayload?.bvn?.phoneNumber ||
    verificationPayload?.mobile ||
    verificationPayload?.phone ||
    "N/A";

  let bvn = "N/A";
  if (verificationPayload?.bvn) {
    bvn =
      verificationPayload.bvn.BankVerificationNumber ||
      verificationPayload.bvn.idNumber ||
      verificationPayload.bvn.nin ||
      sessionRow.bvn ||
      "N/A";
  }

  let nin = "N/A";
  if (verificationPayload?.nin) {
    nin =
      verificationPayload.nin.idNumber ||
      verificationPayload.nin.nin ||
      sessionRow.nin ||
      "N/A";
  }

  /* ================= DETECT CUSTOMER EMAIL ================= */

  let customerEmail = null;

  for (const key of Object.keys(dynamic)) {
    if (key.toLowerCase().includes("email") && dynamic[key]) {
      customerEmail = dynamic[key];
      break;
    }
  }

  if (!customerEmail) {
    for (const key of Object.keys(verificationPayload)) {
      if (
        key.toLowerCase().includes("email") &&
        verificationPayload[key]
      ) {
        customerEmail = verificationPayload[key];
        break;
      }
    }
  }

  /* =========================================================
     LOAN DETAILS
  ========================================================== */

  const amount =
    dynamic.field_amount ||
    dynamic.field_loan_amount ||
    dynamic.amount ||
    sessionRow.amount ||
    "N/A";


const tenureValue =
  dynamic.field_tenure_days ||
  dynamic.tenure_days ||
  dynamic.tenure ||
  "N/A";

const tenure =
  tenureValue === "N/A" ? "N/A" : `${tenureValue} days`;  

  const accountNumber =
    dynamic.field_account_number ||
    dynamic.account_number ||
    "N/A";

const accountName =
  dynamic.field_account_name ||
  dynamic.account_name ||
  "N/A";

const bankName =
  dynamic.field_bank_name ||
  dynamic.field_select_bank_name ||
  dynamic.bank_name ||
  req.body.bank_name ||
  req.body.dynamic?.field_bank_name ||
  "N/A";

  
const submissionTime = new Date().toLocaleString("en-NG", {
  timeZone: "Africa/Lagos",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

  const formattedAmount =
    !isNaN(Number(amount)) && amount !== "N/A"
      ? `₦${Number(amount).toLocaleString()}`
      : amount;

  const loanReference =
    result?.loanCode ||
    sessionRow.loan_code ||
    "N/A";

  /* =========================================================
     PROFESSIONAL TABLE STYLE
  ========================================================== */

  const tableStyle =
    "width:100%; border-collapse:collapse; margin-bottom:20px;";
  const thStyle =
    "text-align:left; padding:8px; background:#f4f6f9; border:1px solid #e5e7eb; font-size:13px;";
  const tdStyle =
    "padding:8px; border:1px solid #e5e7eb; font-size:13px;";

  /* =========================================================
     CUSTOMER EMAIL
  ========================================================== */

  if (customerEmail) {

    await sendStyledMail({
      to: customerEmail,
      subject: "Loan Application Successfully Submitted",
      title: "Loan Application Confirmation",
      body: `
        <p>Dear ${fullName},</p>

        <p>Your loan application has been successfully submitted with the details below:</p>

        <table style="${tableStyle}">
          <tr>
            <th style="${thStyle}" colspan="2">Loan Details</th>
          </tr>
          <tr>
            <td style="${tdStyle}"><b>Loan Reference</b></td>
            <td style="${tdStyle}">${loanReference}</td>
          </tr>
          <tr>
            <td style="${tdStyle}"><b>Amount</b></td>
            <td style="${tdStyle}">${formattedAmount}</td>
          </tr>
          <tr>
            <td style="${tdStyle}"><b>Tenure</b></td>
            <td style="${tdStyle}">${tenure}</td>
          </tr>


<tr>
  <td style="${tdStyle}"><b>Bank</b></td>
  <td style="${tdStyle}">${bankName}</td>
</tr>
<tr>
  <td style="${tdStyle}"><b>Account Number</b></td>
  <td style="${tdStyle}">${accountNumber}</td>
</tr>

<tr>
  <td style="${tdStyle}"><b>Account Name</b></td>
  <td style="${tdStyle}">${accountName}</td>
</tr>

        <tr>
            <td style="${tdStyle}"><b>Submission Date</b></td>
            <td style="${tdStyle}">${submissionTime}</td>
          </tr>
        </table>

        <p>
        You can log in to your dashboard to monitor the progress of your application.
        Updates will also be provided via email throughout the review process.
        </p>

        <p>Thank you for choosing Mutual Trust Microfinance Bank.</p>
      `,
    });

    console.log("📩 Customer email sent:", customerEmail);
  }

  /* =========================================================
     RM EMAIL (FULL DETAILS)
  ========================================================== */

  if (crmStaffId) {

    const rmData = await pool.query(
      `SELECT email, first_name, last_name FROM users WHERE id = $1`,
      [crmStaffId]
    );

    if (rmData.rows.length && rmData.rows[0].email) {

      const rmEmail = rmData.rows[0].email;
      const rmName =
        `${rmData.rows[0].first_name} ${rmData.rows[0].last_name}`.trim();

      await sendStyledMail({
        to: rmEmail,
        subject: "New Loan Application Submitted",
        title: "New Loan Application Alert",
        body: `
          <p>Dear ${rmName},</p>

          <p>A new loan application has been submitted with the following details:</p>

          <table style="${tableStyle}">
            <tr>
              <th style="${thStyle}" colspan="2">Customer Information</th>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>Full Name</b></td>
              <td style="${tdStyle}">${fullName}</td>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>Email</b></td>
              <td style="${tdStyle}">${customerEmail || "N/A"}</td>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>Phone Number</b></td>
              <td style="${tdStyle}">${phone}</td>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>BVN</b></td>
              <td style="${tdStyle}">${bvn}</td>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>NIN</b></td>
              <td style="${tdStyle}">${nin}</td>
            </tr>
          </table>

          <table style="${tableStyle}">
            <tr>
              <th style="${thStyle}" colspan="2">Loan Details</th>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>Loan Reference</b></td>
              <td style="${tdStyle}">${loanReference}</td>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>Amount</b></td>
              <td style="${tdStyle}">${formattedAmount}</td>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>Tenure</b></td>
              <td style="${tdStyle}">${tenure}</td>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>Bank</b></td>
              <td style="${tdStyle}">${bankName}</td>
            </tr>
            <tr>
              <td style="${tdStyle}"><b>Account Number</b></td>
              <td style="${tdStyle}">${accountNumber}</td>
            </tr>
<tr>
  <td style="${tdStyle}"><b>Account Name</b></td>
  <td style="${tdStyle}">${accountName}</td>
</tr>

            <tr>
              <td style="${tdStyle}"><b>Submitted At</b></td>
              <td style="${tdStyle}">${submissionTime}</td>
            </tr>
          </table>

          <p>
          You can log in to your dashboard to monitor and manage this application.
          Updates will also be communicated via email where necessary.
          </p>
        `,
      });

      console.log("📩 RM email sent:", rmEmail);
    }
  }

} catch (mailErr) {
  console.error("❌ Email notification error:", mailErr.message);
}


    /* ================= SAVE UPLOADED DOCUMENTS ================= */
  /* ================= SAVE UPLOADED DOCUMENTS ================= */
if (req.files && req.files.length > 0) {
  for (const file of req.files) {

    // Build correct relative path
    const relativePath = `uploads/loan_documents/${loanSessionId}/${file.filename}`;

    await pool.query(
      `
      INSERT INTO loan_session_documents
      (session_id, doc_type, file_path, uploaded_at)
      VALUES ($1, $2, $3, NOW())
      `,
      [
        loanSessionId,
        file.fieldname || "document",
        relativePath
      ]
    );
  }
}


    /* ================= LOCK SESSION ================= */
    await pool.query(
      `
      UPDATE loan_sessions
      SET
        face_verification_status = 'USED',
        updated_at = NOW()
      WHERE id = $1
      `,
      [loanSessionId]
    );

    return res.status(201).json({
      success: true,
      message: "Loan submitted successfully",
      loanId: result.loanId,
      loanCode: result.loanCode,
    });

  } catch (err) {
    console.error("Public loan error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to submit loan",
    });
  }
};





/**
 * ==========================================
 * LIST RELATIONSHIP MANAGERS (PUBLIC)
 * ==========================================
 */
exports.listPublicRelationshipManagers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        r.name AS designation
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.can_access_hrm_crm = TRUE
      ORDER BY u.first_name
    `);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("RM list error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load relationship managers",
    });
  }
};


/**
 * ==========================================
 * CHECK PAYROLL ELIGIBILITY (REAL-TIME)
 * ==========================================
 */
exports.checkPayrollEligibility = async (req, res) => {
  try {

    const { accountNumber } = req.params;

    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: "Account number is required"
      });
    }

    const result = await pool.query(
      `
      SELECT account_number
      FROM payslip_customers
      WHERE account_number = $1
      LIMIT 1
      `,
      [accountNumber]
    );

    if (!result.rows.length) {
      return res.json({
        success: true,
        eligible: false
      });
    }

    return res.json({
      success: true,
      eligible: true
    });

  } catch (err) {
    console.error("Payroll eligibility error:", err);
    return res.status(500).json({
      success: false,
      message: "Eligibility check failed"
    });
  }
};
