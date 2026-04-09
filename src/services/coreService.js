// src/services/coreService.js

const CORE_MODE = process.env.CORE_MODE || "mock";

const mockCore = require("./mockCoreService");
const liveCore = require("./liveCoreService"); // real MyBankOne later

exports.checkCustomerByBVN = async (bvn) => {
  if (CORE_MODE === "mock") {
    return mockCore.checkCustomerByBVN(bvn);
  }

  return liveCore.checkCustomerByBVN(bvn);
};
