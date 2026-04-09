const router = require("express").Router();

/* 🔐 AUTH MIDDLEWARE */
const auth = require("../../middleware/auth");

/* 🎯 CONTROLLERS */
const {
  getTransactions,
  saveTransactions
} = require("../controllers/transactionController");

/* ======================================================
   GET TRANSACTIONS
   → Try CBA first
   → Fallback to Postgres if CBA is down
====================================================== */
router.get(
  "/transactions/:accountNo",
  auth, // ✅ NOW DEFINED
  getTransactions
);

/* ======================================================
   POST - SAVE TRANSACTIONS (manual / optional)
====================================================== */
router.post("/save", auth, async (req, res) => {
  try {
    const { transactions } = req.body;

    if (!Array.isArray(transactions)) {
      return res.status(400).json({
        success: false,
        message: "transactions array is required"
      });
    }

    const result = await saveTransactions(transactions);

    res.json({
      success: true,
      ...result
    });

  } catch (e) {
    console.error("❌ Save Transactions Error:", e.message);
    res.status(500).json({
      success: false,
      error: e.message
    });
  }
});

module.exports = router;
