const pool = require("../../db");
const { balanceEnquiry } = require("../core/account.service");

async function syncAccountBalance(account) {
  const bal = await balanceEnquiry(account.core_account_number);

  await pool.query(
    `
    UPDATE accounts
    SET
      available_balance = $1,
      ledger_balance = $2,
      withdrawable_balance = $3,
      last_core_sync = NOW()
    WHERE core_account_number = $4
    `,
    [
      bal.AvailableBalance,
      bal.LedgerBalance,
      bal.WithdrawableBalance,
      account.core_account_number,
    ]
  );
}

module.exports = { syncAccountBalance };
