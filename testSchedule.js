const axios = require("axios");

async function test() {
  try {
    console.log("⏳ Fetching FULL loan data (PRODUCTION)...");

    const BASE_URL = "https://api.mybankone.com";

    const TOKEN = "d5ed1ddd-5cf4-4a8b-8977-2d854bfd07e6";
    const customerId = "052136"; // ⚠️ important

    const res = await axios.get(
      `${BASE_URL}/BankOneWebAPI/api/LoanAccount/LoanAccountBalance2/2`,
      {
        params: {
          authToken: TOKEN,
          customerIDInString: customerId,
        },
        headers: {
          accept: "application/json",
        },
        timeout: 30000,
      }
    );

    console.log("✅ FULL RESPONSE:");
    console.log(JSON.stringify(res.data, null, 2));

  } catch (err) {
    console.error("❌ ERROR:");

    if (err.response) {
      console.error("Status Code:", err.response.status);
      console.error(JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
  }
}

test();
