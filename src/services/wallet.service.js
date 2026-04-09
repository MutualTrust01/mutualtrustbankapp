const pool = require("../../db");

/* =========================
   GET OR CREATE WALLET
========================= */
async function getOrCreateWallet(userId) {
  const existing = await pool.query(
    "SELECT * FROM wallets WHERE user_id = $1",
    [userId]
  );

  if (existing.rows.length) {
    return existing.rows[0];
  }

  const created = await pool.query(
    "INSERT INTO wallets (user_id) VALUES ($1) RETURNING *",
    [userId]
  );

  return created.rows[0];
}

/* =========================
   CREDIT WALLET
========================= */
async function creditWallet({ userId, amount, reference }) {
  // 🔒 Prevent double credit
  const exists = await pool.query(
    "SELECT 1 FROM wallet_transactions WHERE reference = $1",
    [reference]
  );

  if (exists.rows.length) {
    console.log("⚠ Duplicate transaction ignored:", reference);
    return;
  }

  const wallet = await getOrCreateWallet(userId);

  await pool.query("BEGIN");

  try {
    await pool.query(
      `
      UPDATE wallets
      SET balance = balance + $1,
          updated_at = NOW()
      WHERE user_id = $2
      `,
      [amount, userId]
    );

    await pool.query(
      `
      INSERT INTO wallet_transactions
      (user_id, reference, amount, type)
      VALUES ($1, $2, $3, 'credit')
      `,
      [userId, reference, amount]
    );

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

module.exports = {
  creditWallet,
};
