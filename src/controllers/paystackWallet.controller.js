const paystack = require("../services/paystack.service");

exports.getPaystackWalletTransactions = async (req, res) => {
  try {
    // ADMIN / STAFF VIEW (NO SESSION EMAIL)
    const result = await req.db.query(`
      SELECT
        id,
        user_id,
        reference,
        amount,
        status,
        source,
        created_at
      FROM wallet_transactions
      WHERE source = 'PAYSTACK'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    const rows = result.rows;

    // 🔄 Enrich each transaction from Paystack
    const enriched = await Promise.all(
      rows.map(async (tx) => {
        try {
          const ps = await paystack.get(
            `/transaction/verify/${tx.reference}`
          );

          const data = ps.data?.data;

          return {
            ...tx,
            email: data?.customer?.email || null,
            channel: data?.channel || null,
          };
        } catch (err) {
          // If Paystack fails, don't break list
          return {
            ...tx,
            email: null,
            channel: null,
          };
        }
      })
    );

    return res.json({
      success: true,
      data: enriched,
    });

  } catch (err) {
    console.error("Paystack wallet fetch error:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch Paystack wallet transactions",
    });
  }
};
