const LoanService = require("./src/core/loan.service");

(async () => {
  try {
const sessionId = "6c0319c8-a21e-452d-bb96-13dd88051e36";
    const productCode = "202";
    const crmStaffId = 001;

    const result = await LoanService.createCustomerAndAccountFromSession(
      sessionId,
      productCode,
      crmStaffId
    );

    console.log("SUCCESS:", result);
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err.message);
    console.error("CORE ERROR:", err.response?.data || null);
    process.exit(1);
  }
})();
