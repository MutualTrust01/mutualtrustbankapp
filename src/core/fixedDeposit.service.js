const coreClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");

/* =====================================================
   CREATE FIXED DEPOSIT (BANKONE / QORE)
   Endpoint:
   POST /BankOneWebAPI/api/FixedDeposit/CreateFixedDepositAcct/2
===================================================== */
async function createFixedDeposit(payload) {
  if (!payload) {
    throw new Error("Fixed deposit payload is required");
  }

  const res = await coreClient.post(
    ENDPOINTS.FIXED_DEPOSIT.CREATE,
    payload
  );

  return res.data;
}

/* =====================================================
   GET FIXED DEPOSIT BY LIQUIDATION ACCOUNT (BANKONE)
   Endpoint:
   GET /BankOneWebAPI/api/FixedDeposit/GetFixedDepositAccountByLiquidationAccount/2
===================================================== */
async function getByLiquidationAccount(accountNumber) {
  if (!accountNumber) {
    throw new Error("accountNumber is required");
  }

  const res = await coreClient.get(
    ENDPOINTS.FIXED_DEPOSIT.GET_BY_LIQUIDATION_ACCOUNT,
    {
      params: {
  AccountNumber: accountNumber,
},

    }
  );

  return res.data;
}


/* =====================================================
   GET FIXED DEPOSIT BY PHONE NUMBER
   Endpoint:
   GET /BankOneWebAPI/api/FixedDeposit/GetFixedDepositAccountByPhoneNumber/2
===================================================== */
async function getByPhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    throw new Error("phoneNumber is required");
  }

  const res = await coreClient.get(
    ENDPOINTS.FIXED_DEPOSIT.GET_BY_PHONE_NUMBER,
    {
      params: {
        phoneNumber, // exact casing per BankOne
      },
    }
  );

  return res.data;
}


/* =====================================================
   TOP-UP FIXED DEPOSIT
   Endpoint:
   POST /BankOneWebAPI/api/FixedDeposit/TopUpFixedDepositAccount/2
===================================================== */
async function topUpFixedDeposit(payload) {
  if (!payload) {
    throw new Error("Top-up payload is required");
  }

  const res = await coreClient.post(
    ENDPOINTS.FIXED_DEPOSIT.TOP_UP,
    payload
  );

  return res.data;
}

async function getFixedDepositDetails(fdAccountNumber) {
  const res = await coreClient.get(
    ENDPOINTS.FIXED_DEPOSIT.GET_DETAILS,
    {
      params: {
        FixedDepositAccountNumber: fdAccountNumber,
      },
    }
  );

  return res.data;
}

module.exports = {
  createFixedDeposit,
  getByLiquidationAccount,
  getByPhoneNumber,
   topUpFixedDeposit, 
   getFixedDepositDetails,
};
