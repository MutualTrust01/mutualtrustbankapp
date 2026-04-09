const axios = require("axios");

async function getAccountDetails(accountNumber) {
  try {
    const res = await axios.post(
      "https://api.mybankone.com/thirdpartyapiservice/apiservice/Account/AccountEnquiry",
      {
        AccountNo: accountNumber,
        AuthenticationCode: process.env.CORE_API_KEY,
      },
      {
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
      }
    );

    console.log("✅ AccountEnquiry Response:", res.data);

    return res.data;
  } catch (err) {
    console.error(
      "❌ AccountEnquiry error:",
      err.response?.data || err.message
    );
    throw err;
  }
}

module.exports = {
  getAccountDetails,
};
