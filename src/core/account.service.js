const https = require("https");
const ENDPOINTS = require("../utils/coreEndpoints");

const CORE_HOST = "staging.mybankone.com";
const TOKEN = process.env.CORE_API_KEY;

/* ===============================
   LOW-LEVEL CORE CALL (GET)
================================ */
function callCore(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CORE_HOST,
      port: 443,
      method: "GET",
      path,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => (data += chunk));

      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          console.error("❌ Core raw response:", data);
          reject(new Error("Invalid JSON from core banking"));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

/* ===============================
   NORMALIZE ACCOUNT (CORE)
================================ */
function normalizeAccount(acc) {
  if (!acc) return null;

  return {
    raw: acc,

    // 🔑 CORE STRUCTURE
    accountNumber: acc.AccountNumber || null, // internal core acct no
    nuban: acc.NUBAN || null,                 // display NUBAN
    accountName: acc.CustomerName || null,
    status: acc.AccountStatus || null,
    type: acc.AccountType || null,
    branch: acc.Branch || null,
    dateCreated: acc.DateCreated || null,
  };
}

/* ===============================
   GET CUSTOMER BIO (CORE)
================================ */
async function getCustomerFromCore(customerId) {
  const path =
    `/BankOneWebAPI/api/Customer/GetByCustomerID/2` +
    `?authToken=${TOKEN}&CustomerID=${customerId}`;

  const res = await callCore(path);

  if (!res || !res.CustomerID) return null;

  return {
    id: res.CustomerID,
    firstName: res.FirstName || null,
    lastName: res.LastName || null,
    name: `${res.FirstName || ""} ${res.LastName || ""}`.trim(),
    phone: res.PhoneNumber || null,
    email: res.Email || null,
    bvn: res.BVN || null,
    nin: res.NIN || null,
    type: res.CustomerType || null,
  };
}

/* ===============================
   GET ACCOUNTS BY CUSTOMER ID
================================ */
async function getAccountsByCustomerId(customerId) {
  const path =
    `${ENDPOINTS.ACCOUNT.GET_BY_CUSTOMER_ID}` +
    `?authToken=${TOKEN}&CustomerID=${customerId}`;

  const res = await callCore(path);

  if (!Array.isArray(res)) return [];
  return res.map(normalizeAccount);
}

/* ===============================
   ACCOUNT ENQUIRY (OPTIONAL)
================================ */
async function accountEnquiry(accountNumber) {
  const path =
    `/BankOneWebAPI/api/Account/AccountEnquiry/2` +
    `?authToken=${TOKEN}&accountNumber=${accountNumber}`;

  const res = await callCore(path);
  return normalizeAccount(res);
}

/* ===============================
   ✅ BALANCE ENQUIRY (CORRECT)
================================ */
async function balanceEnquiry(accountNumber) {
  const path =
    `/BankOneWebAPI/api/Account/GetAccountByAccountNumber/2` +
    `?authToken=${TOKEN}` +
    `&accountNumber=${accountNumber}` +
    `&computewithdrawableBalance=true`; // 🔥 MUST BE TRUE

  const res = await callCore(path);

  const clean = (v) =>
    v === undefined || v === null
      ? "0.00"
      : String(v).replace(/,/g, "");

  return {
    raw: res,
    availableBalance: clean(res.AvailableBalance),
    ledgerBalance: clean(res.LedgerBalance),
    withdrawableBalance: clean(res.WithdrawableBalance),
    accountType: res.AccountType || null,
  };
}

/* ===============================
   GET TRANSACTIONS
================================ */
async function getTransactions(accountNumber, fromDate, toDate) {
  let path =
    `${ENDPOINTS.ACCOUNT.GET_TRANSACTIONS}` +
    `?authToken=${TOKEN}&accountNumber=${accountNumber}&numberOfItems=200`;

  if (fromDate) path += `&fromDate=${fromDate}`;
  if (toDate) path += `&toDate=${toDate}`;

  return await callCore(path);
}

/* ===============================
   EXPORTS
================================ */
module.exports = {
  // customer
  getCustomerFromCore,

  // accounts
  getAccountsByCustomerId,
  accountEnquiry,
  balanceEnquiry,

  // transactions
  getTransactions,
};
