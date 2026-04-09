const https = require("https");
const pool = require("../../db");   // make sure this points correctly to db.js

// ========================= 1) FETCH FROM CORE ========================= //
const fetchFromCore = (accountNo, fromDate, toDate) => {
  return new Promise((resolve, reject) => {
    const token = process.env.CORE_API_KEY;
    const bankId = process.env.CORE_BANK_ID;

    let path = `/BankOneWebAPI/api/Account/GetTransactions/${bankId}?authtoken=${token}&accountNumber=${accountNo}&numberOfItems=200`;

    if (fromDate) path += `&fromDate=${fromDate}`;
    if (toDate) path += `&toDate=${toDate}`;

    console.log("🌍 Calling CoreBank URL:", path);

    const options = {
      hostname: "staging.mybankone.com",
      port: 443,
      path,
      method: "GET",
      headers: { Accept: "application/json" }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) { reject(err); }
      });
    });

    req.on("error", reject);
    req.end();
  });
};


// ========================= 2) FORMAT FOR DATABASE ========================= //
function formatTransactions(raw, accountNo) {
  const data = Array.isArray(raw?.Message) 
  ? raw.Message 
  : (Array.isArray(raw?.data?.Message) ? raw.data.Message : []);


  return data.map(t => ({
    ref: t.ReferenceID || t.TransactionReference || null,
    account: accountNo,
    date: t.CurrentDate?.split("T")[0],
    debit: t.Debit ? Number(String(t.Debit).replace(/,/g,"")) : 0,
    credit: t.Credit ? Number(String(t.Credit).replace(/,/g,"")) : 0,
    balanceAfter: t.BalanceInNaira
      ? Number(String(t.BalanceInNaira).replace(/,/g,""))
      : null,
    narration: t.Narration || t.Particulars,
    teller: t.TellerID,
    valueDate: t.TransactionDate?.split("T")[0],
    source: "CORE"
  }));
}


// ========================= 3) SAVE TO POSTGRES (no duplicate) ========================= //
async function saveTransactions(list) {
  const query = `
    INSERT INTO transactions (
      transaction_ref, account_number, txn_date, value_date,
      debit, credit, balance_after, narration, teller, source
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (transaction_ref) DO UPDATE SET
      debit = EXCLUDED.debit,
      credit = EXCLUDED.credit,
      balance_after = EXCLUDED.balance_after,
      narration = EXCLUDED.narration,
      teller = EXCLUDED.teller,
      source = EXCLUDED.source,
      updated_at = NOW();
  `;

  let count = 0;

  for (let t of list) {
    try {
      await pool.query(query, [
        t.ref, t.account, t.date, t.valueDate,
        t.debit, t.credit, t.balanceAfter,
        t.narration, t.teller, t.source
      ]);
      count++;
    } catch (err) {
      console.log("⚠ duplicate skipped:", err.message);
    }
  }

  return { saved: count, message: "Transactions stored" };
}


// ========================= 4) CRON SYNC FUNCTION ========================= //
async function syncAccountTransactions(accountNo) {
  console.log(`🔄 Syncing account ${accountNo} from cron...`);

  const raw = await fetchFromCore(accountNo);
  const formatted = formatTransactions(raw, accountNo);

  if (!formatted || formatted.length === 0) {
      console.log("⚠ No new transactions from core");
      return;
  }

  const query = `
      INSERT INTO transactions (
        transaction_ref, account_number, txn_date, value_date,
        debit, credit, balance_after, narration, teller, source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (transaction_ref) DO NOTHING; -- prevents duplicates
  `;

  for (let t of formatted) {
    try {
      await pool.query(query, [
        t.ref, t.account, t.date, t.valueDate,
        t.debit, t.credit, t.balanceAfter,
        t.narration, t.teller, t.source
      ]);
    } catch(e) { console.log("⚠ Skipped duplicate:", e.message); }
  }

  console.log(`✔ Sync Completed for account ${accountNo}`);
}



// ========================= 5) API CONTROLLER (CBA → DB FALLBACK) ========================= //
async function getTransactions(req, res) {
  const { accountNo } = req.params;
  const { fromDate, toDate } = req.query;

  if (!accountNo) {
    return res.status(400).json({
      success: false,
      message: "accountNo is required"
    });
  }

  /* =====================================================
     1️⃣ TRY CBA FIRST (REAL-TIME)
  ===================================================== */
  try {
    console.log("🔁 Fetching LIVE transactions from CBA...");

    const raw = await fetchFromCore(accountNo, fromDate, toDate);
    const formatted = formatTransactions(raw, accountNo);

    if (formatted && formatted.length > 0) {
      // OPTIONAL: save live result immediately
      saveTransactions(formatted).catch(() => {});

      return res.json({
        success: true,
        source: "CBA",
        data: formatted
      });
    }

    throw new Error("Empty CBA response");

  } catch (cbaError) {
    console.error("⚠ CBA failed, falling back to DB:", cbaError.message);
  }

  /* =====================================================
     2️⃣ FALLBACK → POSTGRES
  ===================================================== */
  try {
    console.log("🗄 Fetching transactions from Postgres...");

    const result = await pool.query(
      `
      SELECT
        transaction_ref AS ref,
        account_number AS account,
        txn_date AS date,
        value_date,
        debit,
        credit,
        balance_after AS "balanceAfter",
        narration,
        teller,
        source
      FROM transactions
      WHERE account_number = $1
      ORDER BY txn_date DESC
      LIMIT 200
      `,
      [accountNo]
    );

    return res.json({
      success: true,
      source: "DB",
      data: result.rows
    });

  } catch (dbError) {
    console.error("❌ DB fallback failed:", dbError.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch transactions from CBA or DB"
    });
  }
}

module.exports = { 
  fetchFromCore, 
  saveTransactions, 
  formatTransactions, 
  syncAccountTransactions,
  getTransactions          // 🔥 ADD THIS
};

