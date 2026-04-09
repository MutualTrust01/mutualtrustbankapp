// src/services/mockCoreService.js

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

exports.checkCustomerByBVN = async (bvn) => {
  await sleep(600);

  if (bvn === "11111111111") {
    return {
      exists: true,
      duplicate: true,
    };
  }

  if (bvn === "22222222222") {
    return {
      exists: false,
    };
  }

  return {
    exists: true,
    customer: {
      CustomerId: "CUST-001",
      FullName: "John Doe",
      BVN: bvn,
    },
    accounts: [
      {
        AccountNumber: "0123456789",
        AccountType: "Savings",
        Status: "ACTIVE",
      },
      {
        AccountNumber: "0987654321",
        AccountType: "Current",
        Status: "DORMANT",
      },
    ],
  };
};
