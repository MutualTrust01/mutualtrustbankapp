const accountService = require("../core/account.service");

/* ===============================
   GET ACCOUNTS BY CUSTOMER ID
================================ */
exports.getAccountsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;

    const data = await accountService.getAccountsByCustomerId(customerId);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Get accounts error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch accounts",
    });
  }
};

/* ===============================
   ACCOUNT ENQUIRY
================================ */
exports.accountEnquiry = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    const data = await accountService.accountEnquiry(accountNumber);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Account enquiry error:", err.message);
    res.status(500).json({
      success: false,
      message: "Account enquiry failed",
    });
  }
};

/* ===============================
   BALANCE ENQUIRY
================================ */
exports.balanceEnquiry = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    const data = await accountService.balanceEnquiry(accountNumber);

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Balance enquiry error:", err.message);
    res.status(500).json({
      success: false,
      message: "Balance enquiry failed",
    });
  }
};

/* ===============================
   GET TRANSACTIONS
================================ */
exports.getTransactions = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    const { fromDate, toDate } = req.query;

    const data = await accountService.getTransactions(
      accountNumber,
      fromDate,
      toDate
    );

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Transactions error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
    });
  }
};
