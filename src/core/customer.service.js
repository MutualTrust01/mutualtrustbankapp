
const coreClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");

/* ======================================================
   NORMALIZE CUSTOMER (NO ACCOUNTS HERE)
====================================================== */
function normalizeCustomer(data) {
  if (!data) return null;

  return {
    raw: data,
    customerId: data.customerID,
    firstName: data.OtherNames || "",
    lastName: data.LastName || "",
    fullName: `${data.LastName || ""} ${data.OtherNames || ""}`.trim(),
    phone: data.PhoneNumber || null,
    email: data.Email || null,
    gender: data.GenderString || null,
    address: data.Address || null,
    dateOfBirth: data.DateOfBirth || null,
    accounts: [], // populated separately
  };
}

/* ======================================================
   GET ALL ACCOUNTS BY CUSTOMER ID (SOURCE OF TRUTH)
====================================================== */
async function getAccountsByCustomerId(customerId) {
  const res = await coreClient.get(
    ENDPOINTS.ACCOUNT.GET_BY_CUSTOMER_ID,
    { params: { CustomerID: customerId } }
  );

  const accounts = Array.isArray(res.data?.Accounts)
    ? res.data.Accounts
    : [];

  return accounts.map(acc => ({
    accountNumber: acc.AccountNumber || acc.NUBAN,
    nuban: acc.NUBAN,
    balance: acc.AccountBalance,
    status: acc.AccountStatus,
    type: acc.AccountType,
  }));
}

/* ======================================================
   GET CUSTOMER BY CUSTOMER ID
====================================================== */
async function getCustomerByCustomerId(customerId) {
  const res = await coreClient.get(
    ENDPOINTS.CUSTOMER.GET_BY_ID,
    { params: { CustomerID: customerId } }
  );

  if (!res.data?.customerID) return null;

  const customer = normalizeCustomer(res.data);
  customer.accounts = await getAccountsByCustomerId(customerId);

  return customer;
}

/* ======================================================
   GET CUSTOMER BY PHONE NUMBER
====================================================== */
async function getCustomerByPhone(phone) {
  const res = await coreClient.get(
    ENDPOINTS.CUSTOMER.GET_BY_PHONE,
    {
      params: {
        phoneNumber: String(phone),
        authToken: process.env.CORE_API_KEY
      }
    }
  );

  if (!Array.isArray(res.data) || !res.data.length) return null;

  const customer = normalizeCustomer(res.data[0]);
  customer.accounts = await getAccountsByCustomerId(customer.customerId);

  return customer;
}

/* ======================================================
   GET CUSTOMER BY ACCOUNT NUMBER (NUBAN SAFE)
   🔥 THIS IS THE FIX
====================================================== */
async function getCustomerByNuban(nuban) {

  // Step 1: Resolve customer via account lookup
  const res = await coreClient.get(
    ENDPOINTS.CUSTOMER.GET_BY_ACCOUNT,
    { params: { AccountNumber: nuban } }
  );

  if (!res.data?.customerID) return null;

  const customerId = res.data.customerID;

  // Step 2: Fetch full customer + all accounts
  return getCustomerByCustomerId(customerId);
}

/* ======================================================
   SMART LOOKUP (USED BY FRONTEND)
====================================================== */
async function lookupCustomer(value) {
  const input = value.toString().trim();

  // 1️⃣ CUSTOMER ID (6 digits)
  if (/^\d{6}$/.test(input)) {
    return getCustomerByCustomerId(input);
  }

  // 2️⃣ PHONE NUMBER
  if (/^0\d{10}$/.test(input) || /^234\d{10}$/.test(input)) {
    return getCustomerByPhone(input);
  }

  // 3️⃣ ACCOUNT NUMBER / NUBAN (10 digits)
  if (/^\d{10}$/.test(input)) {
    return getCustomerByNuban(input);
  }

  return null;
}

/* ======================================================
   EXPORTS
====================================================== */
module.exports = {
  lookupCustomer,
  getCustomerByCustomerId,
  getCustomerByPhone,
  getCustomerByNuban,
};

