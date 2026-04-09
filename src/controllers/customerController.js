const pool = require("../../db");
const { balanceEnquiry } = require("../core/account.service");

/* =====================================================
   GET ALL CUSTOMERS (DB ONLY – FAST LIST VIEW)
===================================================== */
exports.getCustomers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.customer_id AS id,
        CONCAT(c.first_name,' ',c.last_name) AS name,
        c.username,
        c.phone AS "phoneNumber",
        c.email,
        c.bvn,
        c.nin,
        c.created_at AS "createdOn",
        c.status,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'accountId', a.account_number,
              'type', a.account_type,
              'status', a.status
            )
          ) FILTER (WHERE a.account_number IS NOT NULL),
          '[]'
        ) AS accounts
      FROM customers c
      LEFT JOIN accounts a ON a.customer_id = c.customer_id
      GROUP BY
        c.customer_id,
        c.first_name,
        c.last_name,
        c.username,
        c.phone,
        c.email,
        c.bvn,
        c.nin,
        c.created_at,
        c.status
      ORDER BY c.created_at DESC;
    `);

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error("❌ getCustomers:", err);
    res.status(500).json({ success: false, message: "Failed to fetch customers" });
  }
};

/* =====================================================
   GET SINGLE CUSTOMER (DB ONLY)
===================================================== */
exports.getCustomerProfile = async (req, res) => {
  const { id } = req.params;

  try {
    const customerRes = await pool.query(`
      SELECT 
        customer_id AS id,
        CONCAT(first_name,' ',last_name) AS name,
        phone AS "phoneNumber",
        email,
        bvn,
        nin,
        created_at AS "createdOn",
        status
      FROM customers
      WHERE customer_id = $1
    `, [id]);

    if (!customerRes.rows.length) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    const accountsRes = await pool.query(`
      SELECT 
        account_number AS "accountId",
        account_type AS type,
        status
      FROM accounts
      WHERE customer_id = $1
    `, [id]);

    res.json({
      success: true,
      data: {
        ...customerRes.rows[0],
        accounts: accountsRes.rows,
      },
    });

  } catch (err) {
    console.error("❌ getCustomerProfile:", err);
    res.status(500).json({ success: false, message: "Failed to fetch customer profile" });
  }
};

/* =====================================================
   GET CUSTOMER CORE PROFILE (CORE IS SOURCE OF TRUTH)
===================================================== */
exports.getCustomerCoreProfile = async (req, res) => {
  const { id } = req.params;

  try {
    /* ============================
       1️⃣ CUSTOMER (LOCAL META)
    ============================ */
    const customerRes = await pool.query(`
      SELECT 
        customer_id,
        CONCAT(first_name,' ',last_name) AS name,
        phone,
        email,
        bvn,
        nin
      FROM customers
      WHERE customer_id = $1
    `, [id]);

    if (!customerRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Customer not found in local database",
      });
    }

    const customer = customerRes.rows[0];

    /* ============================
       2️⃣ ACCOUNTS (CORE REFERENCES)
    ============================ */
    const accountsRes = await pool.query(`
      SELECT
        account_number,
        core_account_number,
        nuban,
        account_type,
        status
      FROM accounts
      WHERE customer_id = $1
    `, [id]);

    if (!accountsRes.rows.length) {
      return res.status(404).json({
        success: false,
        message: "No accounts linked to this customer",
      });
    }

    /* ============================
       3️⃣ BALANCE FROM CORE ONLY
    ============================ */
    const accounts = await Promise.all(
      accountsRes.rows.map(async (acc) => {

        // 🔒 CORE ACCOUNT NUMBER IS MANDATORY
        if (!acc.core_account_number) {
          return {
            accountNumber: acc.account_number,
            nuban: acc.nuban,
            error: "No core_account_number from core banking",
          };
        }

        try {
          const bal = await balanceEnquiry(acc.core_account_number);

          return {
            accountNumber: acc.account_number,
            nuban: acc.nuban,
            coreAccountNumber: acc.core_account_number,
            accountType: bal.AccountType || acc.account_type,
            availableBalance: bal.AvailableBalance,
            ledgerBalance: bal.LedgerBalance,
            withdrawableBalance: bal.WithdrawableBalance,
            status: acc.status,
          };

        } catch (err) {
          console.error(
            `❌ Balance enquiry failed for ${acc.core_account_number}`,
            err.message
          );

          return {
            accountNumber: acc.account_number,
            error: "Failed to fetch balance from core",
          };
        }
      })
    );

    /* ============================
       4️⃣ RESPONSE
    ============================ */
    res.json({
      success: true,
      source: "core-banking",
      data: {
        id: customer.customer_id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        bvn: customer.bvn,
        nin: customer.nin,
        accounts,
      },
    });

  } catch (err) {
    console.error("❌ getCustomerCoreProfile:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch customer core profile",
    });
  }
};

/* =====================================================
   UPDATE CUSTOMER (DB ONLY)
===================================================== */
exports.updateCustomer = async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  try {
    await pool.query(`
      UPDATE customers SET 
        first_name = $1,
        last_name  = $2,
        phone      = $3,
        email      = $4,
        username   = $5,
        bvn        = $6,
        nin        = $7
      WHERE customer_id = $8
    `, [
      data.first_name,
      data.last_name,
      data.phone,
      data.email,
      data.username,
      data.bvn,
      data.nin,
      id,
    ]);

    res.json({ success: true, message: "Customer updated successfully" });

  } catch (err) {
    console.error("❌ updateCustomer:", err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};
