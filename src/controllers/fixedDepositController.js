
const fixedDepositLocalService = require("../services/fixedDepositLocal.service");
const fixedDepositService = require("../core/fixedDeposit.service");
const crypto = require("crypto");
const axios = require("axios");
const pool = require("../../db");

/* ===============================
   HELPERS
================================ */
const generateTrackingRef = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomInt(1000, 9999);
  return `FD-${date}-${rand}`;
};

const extractFdAccountNumber = (message = "") => {
  const match = message?.match(/\d{10,}/);
  return match ? match[0] : null;
};

const getFixedDepositSettingsFromSystem = async () => {
  const result = await pool.query(
    "SELECT fixed_deposit_settings FROM system_settings LIMIT 1"
  );

  if (!result.rows.length) return {};

  return result.rows[0]?.fixed_deposit_settings || {};
};

/* ===============================
   CREATE FIXED DEPOSIT
================================ */
exports.createFixedDeposit = async (req, res) => {
  try {
    const body = req.body;

    /* ===============================
       META (FRONTEND FLAGS)
    ================================ */
    const meta = body.__meta || {};
    const sendCertificate = Boolean(meta.sendCertificate ?? true);
    delete body.__meta;

    /* ===============================
       VALIDATION
    ================================ */
    const requiredFields = [
      "CustomerID",
      "ProductCode",
      "Amount",
      "Tenure",
      "LiquidationAccount",
      "InterestAccrualCommencementDate",
    ];

    const missing = requiredFields.filter(
      f => body[f] === undefined || body[f] === null || body[f] === ""
    );

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    /* ===============================
       TRACKING REF
    ================================ */
    const trackingRef =
      body.AccountOpeningTrackingRef || generateTrackingRef();

    /* ===============================
       CORE BANKING PAYLOAD
    ================================ */
    const payload = {
      IsDiscountDeposit: Boolean(body.IsDiscountDeposit ?? false),
      InterestRate: Number(body.InterestRate || 0),
      Amount: String(body.Amount),
      Narration: body.Narration || "Fixed deposit opening",
      Tenure: Number(body.Tenure),
      CustomerID: String(body.CustomerID),
      ProductCode: String(body.ProductCode),
      LiquidationAccount: String(body.LiquidationAccount),

      ApplyInterestMonthly: Boolean(body.ApplyInterestMonthly ?? false),
      ApplyInterestRollover: Boolean(body.ApplyInterestRollover ?? true),
      ShouldRollover: Boolean(body.ShouldRollover ?? true),

      AccountOpeningTrackingRef: trackingRef,
      InterestAccrualCommencementDate:
        body.InterestAccrualCommencementDate,
    };

    /* ===============================
       CREATE FD IN CORE (IMMEDIATE)
    ================================ */
    const result =
      await fixedDepositService.createFixedDeposit(payload);

    if (!result || result.IsSuccessful !== true) {
      return res.status(400).json({
        success: false,
        message:
          result?.Message ||
          "Fixed deposit creation failed at core banking",
        data: result || null,
      });
    }

    const fdAccountNumber =
      extractFdAccountNumber(result.Message);

/* ===============================
   LOAD FD SETTINGS FROM SYSTEM SETTINGS
================================ */
const fdSettings = await getFixedDepositSettingsFromSystem();

const productConfig =
  fdSettings?.productApprovals?.[String(body.ProductCode)] || {};

const approvalRule = productConfig?.certificate?.approval || null;

const certificateApprovalRequired =
  productConfig?.certificate?.approval?.enabled === true &&
  Number(productConfig?.certificate?.approval?.approvers || 0) > 0;    

    /* ===============================
       INSERT LOCAL FD RECORD
    ================================ */
    let localFdId = null;

try {
  localFdId =
    await fixedDepositLocalService.createLocalFD({
      trackingRef,
      fdAccountNumber,
      customerId: body.CustomerID,
      productCode: body.ProductCode,
      amount: Number(body.Amount),
      tenure: Number(body.Tenure),
      interestRate: body.InterestRate
        ? Number(body.InterestRate)
        : null,
      liquidationAccount: body.LiquidationAccount,
      shouldRollover: body.ShouldRollover,
      createdBy: req.user?.id || null,
      certificateStatus: certificateApprovalRequired
        ? "PENDING_APPROVAL"
        : "APPROVED",
      sendCertificate,
    });

  if (certificateApprovalRequired && approvalRule?.flow?.length) {
  await fixedDepositLocalService.createApprovalFlow(
    localFdId,
    approvalRule.flow
  );
}
if (body.requestId) {
  await pool.query(
    `
    UPDATE fixed_deposit_requests
    SET
      status = 'BOOKED',
      fd_account_number = COALESCE($1, fd_account_number),
      booking_response = $2,
      updated_at = NOW()
    WHERE id = $3
    `,
    [fdAccountNumber, JSON.stringify(result), body.requestId]
  );
}

} catch (dbErr) {
  console.error("⚠️ LOCAL FD SAVE FAILED", {
    trackingRef,
    fdAccountNumber,
    error: dbErr.message,
  });
}


    /* ===============================
       RESPONSE
    ================================ */
    return res.status(201).json({
      success: true,
      message: certificateApprovalRequired
        ? "Fixed deposit created. Certificate pending approval."
        : "Fixed deposit and certificate created successfully.",
     data: {
  localFdId,              // 🔥 ADD THIS
  trackingRef,
  fdAccountNumber,
  certificateStatus: certificateApprovalRequired
    ? "PENDING_APPROVAL"
    : "APPROVED",
    localRecordSaved: Boolean(localFdId),
},

    });

  } catch (error) {
    console.error("❌ Fixed Deposit Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while creating fixed deposit",
    });
  }
};







/* ===============================
   GET FD BY LIQUIDATION ACCOUNT
================================ */
exports.getByLiquidationAccount = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    const result =
      await fixedDepositService.getByLiquidationAccount(accountNumber);

    const records =
      Array.isArray(result)
        ? result
        : result?.FixedDepositAccounts || [];
        
return res.json({
  success: true,
  data: records, // 🔥 RETURN RAW BANKONE DATA
});


  } catch (error) {
    console.error("❌ FD QUERY ERROR:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ===============================
   GET FD BY PHONE NUMBER
================================ */
exports.getByPhoneNumber = async (req, res) => {
  try {
    let { phoneNumber } = req.params;

    if (/^0\d{10}$/.test(phoneNumber)) {
      phoneNumber = "234" + phoneNumber.slice(1);
    }

    const result =
      await fixedDepositService.getByPhoneNumber(phoneNumber);

    const records =
      Array.isArray(result)
        ? result
        : result?.FixedDepositAccounts || [];

   return res.json({
  success: true,
  data: records, // 🔥 RETURN RAW BANKONE DATA
});


  } catch (error) {
    console.error("❌ FD PHONE QUERY ERROR:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/* ===============================
   TOP-UP FIXED DEPOSIT
================================ */
exports.topUpFixedDeposit = async (req, res) => {
  try {
    const body = req.body;

    const requiredFields = [
      "FixedDepositAccountNumber",
      "SourceAccountNumber",
      "Amount",
    ];

    const missing = requiredFields.filter(f => !body[f]);

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    const payload = {
      FixedDepositAccountNumber: String(body.FixedDepositAccountNumber),
      SourceAccountNumber: String(body.SourceAccountNumber),
      Amount: Number(body.Amount),
      Narration: body.Narration || "Fixed deposit top-up",
      InstrumentNo: body.InstrumentNo || "TOPUP",
    };

    const result =
      await fixedDepositService.topUpFixedDeposit(payload);

    if (!result || result.IsSuccessful !== true) {
      return res.status(400).json({
        success: false,
        message:
          result?.Message || "Fixed deposit top-up failed",
        data: result || null,
      });
    }

    return res.json({
      success: true,
      message: "Fixed deposit top-up successful",
      data: result,
    });

  } catch (error) {
    console.error("❌ FD TOP-UP ERROR:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during FD top-up",
    });
  }
};



/* ===============================
   GET FD LIQUIDATION ACCOUNT BALANCE
================================ */
exports.getFixedDepositBalance = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: "Account number is required",
      });
    }

    const response = await axios.get(
      "https://staging.mybankone.com/BankOneWebAPI/api/Account/GetAccountByAccountNumber/2",
      {
        params: {
          authtoken: process.env.BANKONE_AUTH_TOKEN,
          accountNumber,
          computewithdrawableBalance: false,
        },
        headers: {
          accept: "application/json",
        },
      }
    );

    const data = response.data || {};

    return res.json({
      success: true,
      data: {
        accountNumber,
        availableBalance: data.AvailableBalance || "0.00",
        ledgerBalance: data.LedgerBalance || "0.00",
        withdrawableBalance: data.WithdrawableBalance || "0.00",
        accountType: data.AccountType || "",
      },
    });
  } catch (error) {
    console.error(
      "❌ Fixed Deposit Balance Error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch account balance",
      error: error.response?.data || error.message,
    });
  }
};



/* ===============================
   CREATE FD REQUEST (APPROVAL FLOW)
================================ */
exports.createFDRequest = async (req, res) => {
  try {
    const {
      customerName,
      customerId,
      phoneNumber,
      lookupValue,
      accountNumber,
      amount,
      product,
      rate,
      tenor,
      tenorUnit,
      bookingDate,
      maturityDate,
      interestInstruction,
      liquidationInstruction,
      } = req.body;


const fdSettings = await getFixedDepositSettingsFromSystem();

const productCode = String(product || "");

const approvalConfig =
  fdSettings?.productApprovals?.[productCode]?.approval || {};

const approvalEnabled =
  approvalConfig?.enabled === true &&
  Array.isArray(approvalConfig?.flow) &&
  approvalConfig.flow.filter(Boolean).length > 0;

const requestStatus = approvalEnabled ? "PENDING" : "APPROVED";

    const query = `
      INSERT INTO fixed_deposit_requests (
        customer_name,
        customer_id,
        phone_number,
        lookup_value,
        account_number,
        amount,
        product,
        rate,
        tenor,
        tenor_unit,
        booking_date,
        maturity_date,
        interest_instruction,
        liquidation_instruction,
        status,
        created_at
      )
      VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()
)
      RETURNING *;
    `;

 const values = [
  customerName,
  customerId,
  phoneNumber,
  lookupValue,
  accountNumber,
  amount,
  product,
  rate,
  tenor,
  tenorUnit,
  bookingDate,
  maturityDate,
  interestInstruction,
  liquidationInstruction,
  requestStatus,
];

    const result = await pool.query(query, values);

if (approvalEnabled) {
  const requestId = result.rows[0]?.id;

  const flowUsers = approvalConfig.flow.filter(Boolean);

  for (let i = 0; i < flowUsers.length; i++) {
    await pool.query(
      `
      INSERT INTO fixed_deposit_request_approvals (
        request_id,
        approver_user_id,
        step_order,
        status
      )
      VALUES ($1, $2, $3, 'PENDING')
      `,
      [requestId, flowUsers[i], i + 1]
    );
  }
}

    return res.status(201).json({
      success: true,
      message: approvalEnabled
  ? "FD request submitted for approval"
  : "FD request approved successfully",
      data: result.rows[0],
    });

  } catch (error) {
    console.error("❌ FD REQUEST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save FD request",
    });
  }
};



/* ===============================
   GET FD REQUESTS
================================ */
exports.getFDRequests = async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT
        r.id,
        r.customer_name,
        r.customer_id,
        r.phone_number,
        r.lookup_value,
        r.account_number,
        r.amount,
        r.product,
        r.rate,
        r.tenor,
        r.tenor_unit,
        r.booking_date,
        r.maturity_date,
        r.interest_instruction,
        r.liquidation_instruction,
        r.status,
        r.fd_account_number,
        r.booking_response,
        r.created_at
      FROM fixed_deposit_requests r
      LEFT JOIN fixed_deposit_request_approvals fra
        ON fra.request_id = r.id
      WHERE
        r.status = 'APPROVED'
        OR (
          r.status = 'PENDING'
          AND fra.approver_user_id = $1
          AND fra.status = 'PENDING'
          AND fra.step_order = (
            SELECT MIN(step_order)
            FROM fixed_deposit_request_approvals
            WHERE request_id = r.id
              AND status = 'PENDING'
          )
        )
      ORDER BY r.created_at DESC
    `;

    const result = await pool.query(query, [req.user.id]);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("❌ GET FD REQUESTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load fixed deposit requests",
    });
  }
};

/* ===============================
   MARK FD REQUEST AS BOOKED
================================ */
exports.markFDRequestAsBooked = async (req, res) => {
  try {
    const { id } = req.params;
    const { fdAccountNumber = null, bookingResponse = null } = req.body || {};

    const query = `
      UPDATE fixed_deposit_requests
      SET
        status = 'BOOKED',
        fd_account_number = COALESCE($1, fd_account_number),
        booking_response = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *;
    `;

    const values = [
      fdAccountNumber,
      bookingResponse ? JSON.stringify(bookingResponse) : null,
      id,
    ];

    const result = await pool.query(query, values);

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "FD request not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "FD request marked as booked",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("❌ MARK FD REQUEST AS BOOKED ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update fixed deposit request",
    });
  }
};



exports.getBookedInvestments = async (req, res) => {
  try {
    const query = `
      SELECT
        id,
        customer_name,
        customer_id,
        phone_number,
        lookup_value,
        account_number,
        amount,
        product,
        rate,
        tenor,
        tenor_unit,
        booking_date,
        maturity_date,
        interest_instruction,
        liquidation_instruction,
        status,
        fd_account_number,
        booking_response,
        created_at
      FROM fixed_deposit_requests
      WHERE status = 'BOOKED'
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("❌ GET BOOKED INVESTMENTS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load booked investments",
    });
  }
};




/* ===============================
   GET PENDING CERTIFICATE APPROVALS
================================ */
exports.getPendingCertificateApprovals = async (req, res) => {
  try {
    const query = `
      SELECT
        fda.id AS approval_id,
        fda.fixed_deposit_id,
        fda.approver_user_id,
        fda.step_order,
        fda.status AS approval_status,
        fda.comment,  -- ✅ ADDED
        fd.tracking_ref,
        fd.fd_account_number,
        fd.customer_id,
        fd.product_code,
        fd.amount,
        fd.tenure,
        fd.interest_rate,
        fd.liquidation_account,
        fd.certificate_status,
        fd.current_approval_step,
        fd.approval_level_required,
        fd.created_at
      FROM fixed_deposit_approvals fda
      JOIN fixed_deposits fd
        ON fd.id = fda.fixed_deposit_id
      WHERE fda.approver_user_id = $1
        AND fda.status = 'PENDING'
        AND fd.certificate_status = 'PENDING_APPROVAL'
      ORDER BY fd.created_at DESC, fda.step_order ASC
    `;

    const result = await pool.query(query, [req.user.id]);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("❌ GET PENDING CERTIFICATE APPROVALS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load pending certificate approvals",
    });
  }
};

/* ===============================
   APPROVE CERTIFICATE APPROVAL
================================ */
exports.approveCertificateApproval = async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { comment = null } = req.body || {}; // ✅ NEW

    const approvalRes = await pool.query(
      `
      SELECT fda.*, fd.approval_level_required
      FROM fixed_deposit_approvals fda
      JOIN fixed_deposits fd
        ON fd.id = fda.fixed_deposit_id
      WHERE fda.id = $1
        AND fda.approver_user_id = $2
      `,
      [approvalId, req.user.id]
    );

    if (!approvalRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Approval record not found",
      });
    }

    const approval = approvalRes.rows[0];

    if (approval.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Already processed",
      });
    }

    // ✅ SAVE COMMENT HERE
    await pool.query(
      `
      UPDATE fixed_deposit_approvals
      SET
        status = 'APPROVED',
        comment = $1,
        approved_at = NOW()
      WHERE id = $2
      `,
      [comment, approvalId]
    );

    return res.json({
      success: true,
      message: "Approved successfully",
    });
  } catch (error) {
    console.error("❌ APPROVE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Approval failed",
    });
  }
};

/* ===============================
   REJECT CERTIFICATE APPROVAL
================================ */
exports.rejectCertificateApproval = async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { comment = null } = req.body || {}; // ✅ NEW

    await pool.query(
      `
      UPDATE fixed_deposit_approvals
      SET
        status = 'REJECTED',
        comment = $1,
        approved_at = NOW()
      WHERE id = $2
      `,
      [comment, approvalId]
    );

    return res.json({
      success: true,
      message: "Rejected successfully",
    });
  } catch (error) {
    console.error("❌ REJECT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Rejection failed",
    });
  }
};



exports.approveFDRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment = null } = req.body || {};

    const approvalRes = await pool.query(
      `
      SELECT *
      FROM fixed_deposit_request_approvals
      WHERE request_id = $1
        AND approver_user_id = $2
        AND status = 'PENDING'
      ORDER BY step_order ASC
      LIMIT 1
      `,
      [id, req.user.id]
    );

    if (!approvalRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: "No pending approval found for this user",
      });
    }

    const approval = approvalRes.rows[0];

    await pool.query(
      `
      UPDATE fixed_deposit_request_approvals
      SET
        status = 'APPROVED',
        comment = $1,
        approved_at = NOW()
      WHERE id = $2
      `,
      [comment, approval.id]
    );

    const nextPending = await pool.query(
      `
      SELECT id
      FROM fixed_deposit_request_approvals
      WHERE request_id = $1
        AND status = 'PENDING'
      ORDER BY step_order ASC
      LIMIT 1
      `,
      [id]
    );

    if (!nextPending.rows.length) {
      await pool.query(
        `
        UPDATE fixed_deposit_requests
        SET
          status = 'APPROVED',
          updated_at = NOW()
        WHERE id = $1
        `,
        [id]
      );
    }

    return res.json({
      success: true,
      message: !nextPending.rows.length
        ? "Request fully approved"
        : "Request approved and moved to next approver",
    });
  } catch (error) {
    console.error("❌ APPROVE FD REQUEST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to approve request",
    });
  }
};



exports.rejectFDRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment = null } = req.body || {};

    const approvalRes = await pool.query(
      `
      SELECT *
      FROM fixed_deposit_request_approvals
      WHERE request_id = $1
        AND approver_user_id = $2
        AND status = 'PENDING'
      ORDER BY step_order ASC
      LIMIT 1
      `,
      [id, req.user.id]
    );

    if (!approvalRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: "No pending approval found for this user",
      });
    }

    const approval = approvalRes.rows[0];

    await pool.query(
      `
      UPDATE fixed_deposit_request_approvals
      SET
        status = 'REJECTED',
        comment = $1,
        approved_at = NOW()
      WHERE id = $2
      `,
      [comment, approval.id]
    );

    await pool.query(
      `
      UPDATE fixed_deposit_requests
      SET
        status = 'REJECTED',
        updated_at = NOW()
      WHERE id = $1
      `,
      [id]
    );

    return res.json({
      success: true,
      message: "Request rejected successfully",
    });
  } catch (error) {
    console.error("❌ REJECT FD REQUEST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reject request",
    });
  }
};
