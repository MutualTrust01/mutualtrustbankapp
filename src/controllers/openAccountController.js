const { corePost } = require("../utils/coreBankingService");
const pool = require("../../db");
const getOnboardingConfig = require("../utils/getOnboardingConfig");

/* ====================================================
   1️⃣ REGISTER CUSTOMER + OPEN PRIMARY ACCOUNT
   (APP & INTERNET BANKING)
==================================================== */
exports.registerCustomerAndOpenAccount = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      first_name,
      last_name,
      phone,
      email,
      bvn,
      nin
    } = req.body;

    if (!first_name || !last_name || !phone || !bvn) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    await client.query("BEGIN");

    /* ---------- 🔥 LOAD ONBOARDING CONFIG ---------- */
    const onboarding = await getOnboardingConfig();

    // 🔒 HARD DEFAULT (NO CLIENT OVERRIDE)
    const PRODUCT_CODE = onboarding.defaultProductCode || "200";

    /* ---------- 1️⃣ CREATE CUSTOMER IN CORE ---------- */
    const coreCustomer = await corePost("/Customer/CreateCustomerQuick", {      FirstName: first_name,
      LastName: last_name,
      PhoneNumber: phone,
      Email: email,
      BVN: bvn
    });

    const customerId =
      coreCustomer?.CustomerID ||
      coreCustomer?.data?.CustomerID;

    if (!customerId) {
      throw new Error("Customer ID not returned from core");
    }

    /* ---------- 2️⃣ BLOCK MULTIPLE ACCOUNTS ---------- */
    const existingAccount = await client.query(
      `SELECT 1 FROM accounts WHERE customer_id=$1 LIMIT 1`,
      [customerId]
    );

    if (existingAccount.rowCount > 0) {
      throw new Error("Customer already has an account");
    }

    /* ---------- 3️⃣ SAVE CUSTOMER LOCALLY ---------- */
    await client.query(
      `INSERT INTO customers
       (customer_id, first_name, last_name, phone, email, bvn, nin, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Active')
       ON CONFLICT (customer_id) DO NOTHING`,
      [customerId, first_name, last_name, phone, email, bvn, nin]
    );

    /* ---------- 4️⃣ OPEN ACCOUNT IN CORE ---------- */
    const coreAccount = await corePost("/Account/CreateAccountQuick", {
      TransactionTrackingRef: "TRX" + Date.now(),
      AccountOpeningTrackingRef: "ACC" + Date.now(),
      CustomerID: customerId,
      ProductCode: PRODUCT_CODE,
      BVN: bvn,
      PhoneNumber: phone,
      Email: email,
      OfficerCode: onboarding.officerCode || undefined
    });

    const accountNumber =
      coreAccount?.AccountNumber ||
      coreAccount?.data?.AccountNumber;

    if (!accountNumber) {
      throw new Error("Account number not returned from core");
    }

    /* ---------- 5️⃣ SAVE ACCOUNT LOCALLY ---------- */
    await client.query(
      `INSERT INTO accounts
       (customer_id, account_number, account_type, status)
       VALUES ($1,$2,$3,'Active')`,
      [customerId, accountNumber, PRODUCT_CODE]
    );

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: "Account opened successfully",
      customerId,
      primaryAccount: accountNumber
    });

  } catch (err) {
    await client.query("ROLLBACK");

    return res.status(400).json({
      success: false,
      message: err.message
    });
  } finally {
    client.release();
  }
};

/* ====================================================
   2️⃣ OPEN ADDITIONAL ACCOUNT (❌ HARD BLOCKED)
==================================================== */
exports.openAdditionalAccount = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Multiple account opening is disabled by system policy"
  });
};

/* ====================================================
   3️⃣ REGISTER EXISTING CORE CUSTOMER (ADMIN SYNC)
==================================================== */
exports.registerExistingCustomer = async (req, res) => {
  try {
    const {
      customerId,
      first_name,
      last_name,
      phone,
      email,
      bvn,
      accountNumber
    } = req.body;

    if (!customerId || !accountNumber) {
      return res.status(400).json({
        success: false,
        message: "customerId & accountNumber required"
      });
    }

    await pool.query(
      `INSERT INTO customers
       (customer_id, first_name, last_name, phone, email, bvn, status)
       VALUES ($1,$2,$3,$4,$5,$6,'Active')
       ON CONFLICT (customer_id) DO NOTHING`,
      [customerId, first_name, last_name, phone, email, bvn]
    );

    // 🔒 FORCE PRODUCT CODE = 200
    await pool.query(
      `INSERT INTO accounts
       (customer_id, account_number, account_type, status)
       VALUES ($1,$2,'200','Active')
       ON CONFLICT (account_number) DO NOTHING`,
      [customerId, accountNumber]
    );

    res.json({
      success: true,
      message: "Customer synced successfully"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

/* ====================================================
   4️⃣ GET ALL CUSTOMERS (ADMIN UI)
==================================================== */
exports.getCustomers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.customer_id,
        c.first_name,
        c.last_name,
        c.phone,
        c.email,
        c.bvn,
        c.nin,
        c.created_at,
        c.status,
        a.account_number
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT account_number
        FROM accounts
        WHERE customer_id = c.customer_id
        ORDER BY created_at ASC
        LIMIT 1
      ) a ON true
      ORDER BY c.created_at DESC
    `);

    const customers = result.rows.map(c => ({
      id: c.customer_id,
      username: c.email,
      name: `${c.first_name} ${c.last_name}`,
      phoneNumber: c.phone,
      email: c.email,
      bvn: c.bvn,
      nin: c.nin,
      createdOn: c.created_at,
      status: c.status,
      accounts: c.account_number ? [{ accountId: c.account_number }] : []
    }));

    res.json(customers);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ====================================================
   5️⃣ GET SINGLE CUSTOMER
==================================================== */
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await pool.query(
      `SELECT * FROM customers WHERE customer_id=$1`,
      [id]
    );

    if (!customer.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    const accounts = await pool.query(
      `SELECT * FROM accounts WHERE customer_id=$1`,
      [id]
    );

    res.json({
      ...customer.rows[0],
      accounts: accounts.rows
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
