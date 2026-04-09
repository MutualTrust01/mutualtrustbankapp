const https = require("https");

const fetchBalanceFromCore = (accountNo) => {
  return new Promise((resolve, reject) => {
    const token = process.env.CORE_API_KEY;
    const bankId = process.env.CORE_BANK_ID || 2;

    const path = `/BankOneWebAPI/api/Account/GetAccountByAccountNumber/${bankId}?authtoken=${token}&accountNumber=${accountNo}&computewithdrawableBalance=true`;

    const options = {
      hostname: "staging.mybankone.com",
      port: 443,
      path,
      method: "GET",
      headers: { accept: "application/json" }
    };

    const req = https.request(options, res => {
      let body="";
      res.on("data", c => body += c);
      res.on("end", ()=> resolve(JSON.parse(body)));
    });

    req.on("error", reject);
    req.end();
  });
};

module.exports = { fetchBalanceFromCore };
