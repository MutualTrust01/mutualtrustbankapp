const coreClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");

/* ===============================
   GET ALL ACCOUNT OFFICERS
================================ */
async function getAccountOfficers() {
  const res = await coreClient.get(
    ENDPOINTS.ACCOUNT_OFFICER.GET_ALL
  );
  return res.data;
}

/* ===============================
   GET ACCOUNT OFFICER BY STAFF CODE
================================ */
async function getAccountOfficerByStaffCode(staffCode) {
  const res = await coreClient.get(
    ENDPOINTS.ACCOUNT_OFFICER.GET_BY_STAFF_CODE,
    {
      params: {
        staffCode, // 👈 BankOne expects this
      },
    }
  );

  return res.data;
}

module.exports = {
  getAccountOfficers,
  getAccountOfficerByStaffCode,
};
