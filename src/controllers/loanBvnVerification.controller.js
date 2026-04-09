const axios = require("axios");
const pool = require("../../db");
const LoanService = require("../core/loan.service");
const coreBankingClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");

/* =========================
   HELPERS
========================= */
function resolveBVNError(err) {
  const status = err.response?.status;
  const providerMsg =
    err.response?.data?.message ||
    err.response?.data?.Message ||
    "";

  if (
    providerMsg.toLowerCase().includes("not found") ||
    providerMsg.toLowerCase().includes("invalid")
  ) {
    return {
      status: 400,
      message: "Invalid BVN. Please check and try again.",
    };
  }

  if (providerMsg.includes("Only Test IDs are allowed")) {
    return {
      status: 400,
      message: "Invalid BVN. Please check and try again.",
    };
  }

  if (status === 401 || status === 403) {
    return {
      status: 503,
      message: "BVN verification service is temporarily unavailable.",
    };
  }

  if (
    err.code === "ECONNABORTED" ||
    providerMsg.toLowerCase().includes("timeout")
  ) {
    return {
      status: 503,
      message: "Unable to verify BVN at the moment. Please try again later.",
    };
  }

  return {
    status: 500,
    message: "Unable to verify BVN at the moment. Please try again later.",
  };
}

/* =========================
   VERIFY BVN
========================= */
exports.verifyBVNForLoan = async (req, res) => {
  const requestTime = new Date().toISOString();

  try {

const {
  bvn: rawBvn,
  BVN,
  source,
  crmCode,
  device_name,
  device_type,
  browser_name,
  platform_name,
  user_agent,
} = req.body;

const bvn = rawBvn || BVN || null;


const ip_address =
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  req.socket?.remoteAddress ||
  req.ip ||
  null;
    const requiredProductCode = req.body.productCode || null;

    console.log("🧪 FINAL BVN VALUE:", bvn);

    /* =========================
       VALIDATE
    ========================= */
    if (!bvn || String(bvn).length !== 11) {
      return res.status(400).json({
        success: false,
        message: "Invalid BVN",
      });
    }

    
/* =========================
   BLOCK ACTIVE LOAN
========================= */
const existingLoan = await pool.query(
  `
  SELECT l.id
  FROM loans l
  JOIN loan_sessions s ON l.session_id = s.id
  WHERE s.bvn = $1
    AND (
      l.lifecycle_status NOT IN ('COMPLETED', 'REJECTED')
      AND l.status NOT IN ('REJECTED')
      AND l.disbursement_status NOT IN ('DISBURSED')
    )
  LIMIT 1
  `,
  [bvn]
);

// ✅ allow test BVN to submit multiple times
const TEST_BVNS = ["11111111111"]; // 👈 your test BVN
const currentBVN = String(bvn || "").trim();
const allowTestRepeat = TEST_BVNS.includes(currentBVN);

if (existingLoan.rows.length && !allowTestRepeat) {
  return res.status(409).json({
    success: false,
    message: "You already have a loan in progress",
  });
}
    /* =========================
       CORE LOOKUP FIRST
    ========================= */
    let coreCustomer = null;
    let hasRequiredProduct = false;

    try {
      const coreRes = await coreBankingClient.get(
        ENDPOINTS.CUSTOMER.GET_BY_BVN,
        {
          params: { BVN: bvn, __skipMfbCode: true },
        }
      );

      const coreData = coreRes?.data;

      if (coreData?.IsSuccessful && coreData.Message) {
        coreCustomer = {
  
customerId:
  coreData.Message.customerID ||
  coreData.Message.CustomerID ||
  coreData.Message.CustomerIDInString,
          firstName: coreData.Message.OtherNames,
          lastName: coreData.Message.LastName,
        };

// ✅ ADD THIS RIGHT BELOW coreCustomer assignment
if (!coreCustomer.firstName || !coreCustomer.lastName) {
  console.log("⚠️ CORE returned incomplete data, falling back...");
  coreCustomer = null;
}

        console.log("🏦 CORE CUSTOMER FOUND");

        if (requiredProductCode) {
  const accountsRes = await coreBankingClient.get(
    ENDPOINTS.ACCOUNT.GET_BY_CUSTOMER_ID,
    {
      params: { customerId: String(coreCustomer.customerId) },
    }
  );

  const rawAccounts = accountsRes?.data || {};

  let accounts = Array.isArray(rawAccounts?.Accounts)
    ? rawAccounts.Accounts
    : [];

  if (!accounts.length && Array.isArray(rawAccounts?.Message?.Accounts)) {
    accounts = rawAccounts.Message.Accounts;
  } else if (!accounts.length && Array.isArray(rawAccounts?.Message)) {
    accounts = rawAccounts.Message;
  }

  const seen = new Set();

  accounts = accounts.filter((acc) => {
    const key = String(
      acc.accountNumber ||
      acc.AccountNumber ||
      acc.NUBAN ||
      acc.nuban ||
      ""
    )
      .replace(/\s/g, "")
      .replace(/^0+/, "")
      .trim();

    if (!key || seen.has(key)) return false;

    seen.add(key);
    return true;
  });

  hasRequiredProduct = accounts.some(
    (acc) =>
      String(acc.productCode || acc.ProductCode) === String(requiredProductCode) &&
      String(acc.accountStatus || acc.AccountStatus).toUpperCase() === "ACTIVE"
  );
}
      }
    } catch (err) {
      console.warn("CORE failed");
    }

    /* =========================
       CORE FAST TRACK
    ========================= */
    if (coreCustomer) {
      const { rows } = await pool.query(
        `
        INSERT INTO loan_sessions
(
  bvn,
  first_name,
  last_name,
  core_customer_id,
  verification_status,
  bvn_verified_at,
  expires_at,
  device_name,
  device_type,
  browser_name,
  platform_name,
  user_agent,
  ip_address,
source
)
VALUES (
  $1,$2,$3,$4,
  'BVN_VERIFIED',
  NOW(),
  NOW() + INTERVAL '15 minutes',
 $5,$6,$7,$8,$9,$10,$11
)
        RETURNING id
        `,
[
  bvn,
  coreCustomer.firstName,
  coreCustomer.lastName,
  coreCustomer.customerId,
  device_name || null,
  device_type || null,
  browser_name || null,
  platform_name || null,
  user_agent || null,
  ip_address || null,
  "CORE",
]
      );


// 🔥 CHECK ACTIVE LOAN FROM CORE
let activeLoan = null;

try {
    


// 🔥 FIX: Ensure customerId is valid
const customerId = coreCustomer?.customerId;

console.log("🔥 CUSTOMER ID:", customerId);

if (!customerId) {
  console.log("❌ customerId is undefined — skipping loan check");
} else {
  const coreLoansResponse =
    await LoanService.getLoansByCustomerId(customerId);

  const loans =
    coreLoansResponse?.data?.Message ||
    coreLoansResponse?.data?.Loans ||
    [];

  console.log("🔥 BVN CORE LOANS:", JSON.stringify(loans, null, 2));

  activeLoan = loans.find(l => {
    const outstanding = Number(
      l.TotalOutstandingAmount ||
      l.OutstandingBalance ||
      0
    );

    return outstanding > 1;
  });
}
  
} catch (err) {
  console.log("⚠️ Failed to fetch core loans");
}

    
return res.json({
  success: true,
  source: "CORE",
  loanSessionId: rows[0].id,
  skipNIN: true,
  skipFace: true,
  isExistingCustomer: true,
  hasRequiredProduct,

 hasActiveLoan: !!activeLoan,
  activeLoanBalance: activeLoan?.TotalOutstandingAmount || 0,

  // ✅ ADD THIS
  customer: {
    firstName: coreCustomer.firstName,
    lastName: coreCustomer.lastName,
    fullName: `${coreCustomer.firstName || ""} ${coreCustomer.lastName || ""}`.trim(),
    maskedBVN: bvn.slice(0, 3) + "****" + bvn.slice(-3),
  }
});
    }

    /* =========================
       CACHE (3 MONTHS)
    ========================= */
    

const cached = await pool.query(
  `
  SELECT verification_payload
  FROM identity_verifications
  WHERE bvn = $1
  AND verified_at > NOW() - INTERVAL '3 months'
  LIMIT 1
  `,
  [bvn]
);

const completed = await pool.query(
  `
  SELECT id FROM loan_sessions 
  WHERE bvn=$1 
  AND verification_status='COMPLETED' 
  LIMIT 1
  `,
  [bvn]
);

const isFullyVerified = completed.rows.length > 0;

/* =========================
   USE CACHE ONLY IF FULLY VERIFIED
========================= */



if (cached.rows.length && isFullyVerified) {

  const payload = cached.rows[0].verification_payload;
  const raw = typeof payload === "string" ? JSON.parse(payload) : payload;

  const firstName = raw.firstName || raw.FirstName || null;
  const lastName = raw.lastName || raw.LastName || null;


if (!firstName || !lastName) {
  return res.status(400).json({
    success: false,
    message: "Invalid BVN. Cached data is incomplete."
  });
}

  
const { rows } = await pool.query(
  `
  INSERT INTO loan_sessions
  (
    bvn,
    first_name,
    last_name,
    verification_status,
    bvn_verified_at,
    expires_at,
    device_name,
    device_type,
    browser_name,
    platform_name,
    user_agent,
    ip_address,
source
  )
  VALUES (
    $1,$2,$3,
    'BVN_VERIFIED',
    NOW(),
    NOW() + INTERVAL '15 minutes',
     $4,$5,$6,$7,$8,$9,$10
  )
  RETURNING id
  `,
[
  bvn,
  firstName,
  lastName,
  device_name || null,
  device_type || null,
  browser_name || null,
  platform_name || null,
  user_agent || null,
  ip_address || null,
  "CACHE",
]  

);


// 🔥 CHECK ACTIVE LOAN (CACHE FLOW)

let activeLoan = null;

try {
  // STEP 1: Get customerId from core using BVN
  let customerId = null;

  const coreRes = await coreBankingClient.get(
    ENDPOINTS.CUSTOMER.GET_BY_BVN,
    {
      params: { BVN: bvn, __skipMfbCode: true },
    }
  );

  customerId = coreRes?.data?.Message?.CustomerID;

  // STEP 2: Fetch loans using customerId
  if (customerId) {
    const coreLoansResponse =
      await LoanService.getLoansByCustomerId(customerId);

    const loans =
      coreLoansResponse?.data?.Message ||
      coreLoansResponse?.data?.Loans ||
      [];

    activeLoan = loans.find(l => {
      const outstanding = Number(
        l.TotalOutstandingAmount ||
        l.OutstandingBalance ||
        0
      );

      return outstanding > 1;
    });
  }

} catch (err) {
  console.log("⚠️ Failed to fetch core loans (CACHE)");
}
  
return res.json({
  success: true,
  source: "CACHE",

  hasActiveLoan: !!activeLoan,
  activeLoanBalance: activeLoan?.TotalOutstandingAmount || 0,
  loanSessionId: rows[0].id,
  skipNIN: true,
  skipFace: true,

  customer: {
    firstName,
    lastName,
    fullName: `${firstName || ""} ${lastName || ""}`.trim(),
    maskedBVN: bvn.slice(0, 3) + "****" + bvn.slice(-3),
  }
});
}

    /* =========================
       YOUVERIFY
    ========================= */
    let result;

    try {
      const resVerify = await axios.post(
        `${process.env.YOUVERIFY_BASE_URL}/v2/api/identity/ng/bvn`,
        {
          id: bvn,
          isSubjectConsent: true,
        },
        {
          headers: { token: process.env.YOUVERIFY_API_KEY },
        }
      );

      result = resVerify.data;
    } catch (err) {
      const resolved = resolveBVNError(err);
      return res.status(resolved.status).json(resolved);
    }

    const raw = result.data || {};

    const firstName = raw.firstName || raw.FirstName || null;
    const lastName = raw.lastName || raw.LastName || null;


console.log("YOUVERIFY RESPONSE:", raw);

if (!firstName || !lastName) {
  return res.status(400).json({
    success: false,
    message: "Invalid BVN. No customer data returned from provider."
  });
}

    await pool.query(
      `
      INSERT INTO identity_verifications (bvn, verification_payload, verified_at)
      VALUES ($1,$2,NOW())
      ON CONFLICT (bvn)
      DO UPDATE SET verification_payload = EXCLUDED.verification_payload, verified_at = NOW()
      `,
      [bvn, JSON.stringify(raw)]
    );

    const { rows } = await pool.query(
  `
  INSERT INTO loan_sessions
(
  bvn,
  first_name,
  last_name,
  verification_status,
  bvn_verified_at,
  expires_at,
  device_name,
  device_type,
  browser_name,
  platform_name,
  user_agent,
  ip_address,
  source
)
VALUES (
  $1,$2,$3,
  'BVN_VERIFIED',
  NOW(),
  NOW() + INTERVAL '15 minutes',
  $4,$5,$6,$7,$8,$9,$10
)
  RETURNING id
  `,
 [
  bvn,
  firstName,
  lastName,
  device_name || null,
  device_type || null,
  browser_name || null,
  platform_name || null,
  user_agent || null,
  ip_address || null,
  "YOUVERIFY",
]
);


    
return res.json({
  success: true,
  loanSessionId: rows[0].id,
  skipNIN: false,
  skipFace: false,

  customer: {
    firstName,
    lastName,
    fullName: `${firstName || ""} ${lastName || ""}`.trim(),
    maskedBVN: bvn.slice(0, 3) + "****" + bvn.slice(-3),
  }
});

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "BVN verification failed",
    });
  }
};

/* =========================
   CORE LOOKUP
========================= */
exports.getCoreCustomerByBVN = async (req, res) => {
  try {
    const bvn = req.params.bvn;

    const coreRes = await coreBankingClient.get(
      ENDPOINTS.CUSTOMER.GET_BY_BVN,
      {
        params: { BVN: bvn }
      }
    );

    const data = coreRes?.data || {};

    // ✅ resolve customer id safely
    const customerId =
      data?.customerID ||
      data?.CustomerID ||
      data?.Message?.customerID ||
      data?.Message?.CustomerID ||
      data?.Message?.CustomerIDInString ||
      null;

    let accounts = [];
    let loans = [];

    /* =========================
       GET ACCOUNTS ONLY FROM
       GetAccountsByCustomerId
    ========================= */
    if (customerId) {
      const accountsRes = await coreBankingClient.get(
        ENDPOINTS.ACCOUNT.GET_BY_CUSTOMER_ID,
        {
          params: { customerId: String(customerId) }
        }
      );

      const rawAccounts = accountsRes?.data || {};

console.log("CORE CUSTOMER ID USED:", customerId);
console.log("RAW GET_BY_CUSTOMER_ID RESPONSE:", JSON.stringify(rawAccounts, null, 2));

      // ✅ this is the endpoint shape you want
      if (Array.isArray(rawAccounts?.Accounts)) {
        accounts = rawAccounts.Accounts;
      } else if (Array.isArray(rawAccounts?.Message?.Accounts)) {
        accounts = rawAccounts.Message.Accounts;
      } else if (Array.isArray(rawAccounts?.Message)) {
        accounts = rawAccounts.Message;
      }

      // ✅ dedupe by account number
      const seen = new Set();
console.log("ACCOUNTS BEFORE DEDUPE:", accounts);
      accounts = accounts.filter((acc) => {
        const key = String(
          acc.accountNumber ||
          acc.AccountNumber ||
          acc.NUBAN ||
          acc.nuban ||
          ""
        )
          .replace(/\s/g, "")
          .replace(/^0+/, "")
          .trim();

        if (!key || seen.has(key)) return false;

        seen.add(key);
        return true;
      });
console.log("ACCOUNTS AFTER DEDUPE:", accounts);
      console.log("📦 FINAL CUSTOMER ACCOUNTS:", accounts.length);
    }

    /* =========================
       FETCH CUSTOMER LOANS ONCE
    ========================= */
    try {
      if (customerId) {
        const loanRes = await LoanService.getLoansByCustomerId(customerId);

        loans =
          loanRes?.data?.Message?.Loans ||
          loanRes?.data?.Message ||
          loanRes?.data?.Loans ||
          [];
      }
    } catch (e) {
      console.log("⚠️ Failed to fetch loans");
    }

    /* =========================
       ENRICH ACCOUNTS
    ========================= */
    const cleanNumber = (val) => {
      if (val === null || val === undefined || val === "") return 0;
      return Number(String(val).replace(/,/g, "")) || 0;
    };

    for (const acc of accounts) {
      const accountNumber =
        acc.accountNumber ||
        acc.AccountNumber ||
        acc.NUBAN ||
        null;

      const accountType =
        acc.accountType ||
        acc.AccountType ||
        "";

      // ✅ normalize common fields first
      acc.accountNumber =
        acc.accountNumber ||
        acc.AccountNumber ||
        "";

      acc.accountStatus =
        acc.accountStatus ||
        acc.AccountStatus ||
        "";

      acc.accountType =
        acc.accountType ||
        acc.AccountType ||
        "";

      acc.accountName =
        acc.accountName ||
        acc.AccountName ||
        "";

      acc.productCode =
        acc.productCode ||
        acc.ProductCode ||
        null;

      acc.branch =
        acc.branch ||
        acc.Branch ||
        acc.branchCode ||
        "";

      acc.customerID =
        acc.customerID ||
        acc.CustomerID ||
        customerId ||
        "";

      acc.dateCreated =
        acc.dateCreated ||
        acc.DateCreated ||
        "";

      acc.lastActivityDate =
        acc.lastActivityDate ||
        acc.LastActivityDate ||
        "";

      acc.kycLevel =
        acc.kycLevel ||
        acc.KycLevel ||
        "";

      acc.accessLevel =
        acc.accessLevel ||
        acc.AccessLevel ||
        "";

      // 🏦 handle loan-like accounts
      if (String(accountType).toLowerCase().includes("loan")) {
        const matchingLoan = loans.find(
          (l) =>
            String(l.LoanAccountNo || l.loanAccountNumber || "") ===
            String(accountNumber || "")
        );

        const loanBalance =
          matchingLoan?.AccountBalance ??
          matchingLoan?.PrincipalOutstanding ??
          matchingLoan?.OutstandingBalance ??
          0;

        acc.availableBalance = cleanNumber(loanBalance);
        acc.ledgerBalance = cleanNumber(loanBalance);
        acc.withdrawableAmount = 0;

        acc.productCode = acc.productCode || "LOAN";
        acc.branch =
          acc.branch ||
          matchingLoan?.Branch ||
          "Head Office";

        acc.kycLevel =
          acc.kycLevel ||
          matchingLoan?.KYCLevel ||
          "N/A";

        continue;
      }

      // 🏦 enrich savings/current accounts with balance endpoint
      try {
        if (!accountNumber) continue;

        const details = await coreBankingClient.get(
          "/BankOneWebAPI/api/Account/GetAccountByAccountNumber/2",
          {
            params: { AccountNumber: accountNumber }
          }
        );

        const msg = details?.data?.Message || details?.data || {};

        acc.branch =
          acc.branch ||
          msg.Branch ||
          msg.BranchName ||
          "Head Office";

        acc.kycLevel =
          acc.kycLevel ||
          msg.KYCLevel ||
          "N/A";

        acc.availableBalance = cleanNumber(
          msg.AvailableBalance ||
          msg.WithdrawableBalance ||
          msg.AccountBalance ||
          msg.Balance ||
          acc.availableBalance
        );

        acc.ledgerBalance = cleanNumber(
          msg.LedgerBalance ||
          msg.BookBalance ||
          acc.availableBalance
        );

        acc.withdrawableAmount = cleanNumber(
          msg.WithdrawableBalance ||
          msg.AvailableBalance ||
          acc.availableBalance
        );
      } catch (err) {
        console.log(
          "❌ Balance fetch failed:",
          acc.accountNumber || acc.AccountNumber
        );

        acc.availableBalance = cleanNumber(acc.availableBalance);
        acc.ledgerBalance = cleanNumber(acc.ledgerBalance);
        acc.withdrawableAmount = cleanNumber(
          acc.withdrawableAmount || acc.withdrawableBalance
        );

        acc.productCode = acc.productCode || "-";
        acc.branch = acc.branch || "-";
        acc.kycLevel = acc.kycLevel || "-";
      }
    }

    // ✅ attach final accounts back to response payload
    if (data?.Message && typeof data.Message === "object") {
      data.Message.Accounts = accounts;
    } else {
      data.Accounts = accounts;
    }

    return res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error("❌ getCoreCustomerByBVN failed:", err?.message || err);
    return res.status(503).json({
      success: false,
      message: "Unable to fetch core customer"
    });
  }
};
