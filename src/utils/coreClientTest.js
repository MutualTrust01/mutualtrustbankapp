require("dotenv").config();
const coreClient = require("./coreBankingClient");

(async () => {
  try {
    const res = await coreClient.get(
      "/BankOneWebAPI/api/Customer/GetByCustomerID/2",
      { params: { CustomerID: "12345" } }
    );

    console.log("✅ CORE CLIENT OK:", res.data);
  } catch (err) {
    console.error("❌ CORE CLIENT FAILED");
  }
})();
