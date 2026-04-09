const axios = require("axios");

async function testLoanDetails() {
  try {
    console.log("⏳ Fetching loan details (PRODUCTION)...");

    const BASE_URL = "https://api.mybankone.com";
const authToken = "d5ed1ddd-5cf4-4a8b-8977-2d854bfd07e6";
const mfbCode = "100581";
const loanAccountNumber = "02540015040052136";
    // 🔍 Try with query auth (BankOne standard)
    console.log("🔹 Trying QUERY auth...");

    try {
      const res = await axios.get(
        `${BASE_URL}/BankOneWebAPI/api/Loan/GetLoanRepaymentSchedule/2`,
        {
         params: {
  authToken,
  mfbCode,
  loanAccountNumber,
},
          headers: {
            accept: "application/json",
          },
          timeout: 30000,
        }
      );

      console.log("✅ QUERY RESPONSE:");
      console.log(JSON.stringify(res.data, null, 2));
      return;

    } catch (err) {
      console.log("❌ Query auth failed");
      console.log(err.response?.data || err.message);
    }

    // 🔍 Try with header auth (fallback test)
    console.log("🔹 Trying HEADER auth...");

    const res2 = await axios.get(
      `${BASE_URL}/BankOneWebAPI/api/Loan/GetLoanRepaymentSchedule/2`,
      {
        params: {
          loanAccountNumber,
        },
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        timeout: 30000,
      }
    );

    console.log("✅ HEADER RESPONSE:");
    console.log(JSON.stringify(res2.data, null, 2));

  } catch (err) {
    console.error("❌ FINAL ERROR:");

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
  }
}

testLoanDetails();
