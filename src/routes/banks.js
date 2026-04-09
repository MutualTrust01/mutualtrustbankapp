const express = require("express");
const router = express.Router();
const axios = require("axios");
require("dotenv").config();

const BASE_URL = process.env.CORE_BASE_URL;
const TOKEN = process.env.CORE_API_KEY;

/* =========================================
   FETCH COMMERCIAL BANKS FROM CORE
========================================= */

async function fetchBanks() {

  const url = `${BASE_URL}/thirdpartyapiservice/apiservice/BillsPayment/GetCommercialBanks/${TOKEN}`;

  const response = await axios.get(url, {
    headers: {
      Accept: "application/json",
    },
    timeout: 30000,
  });

  const banks = Array.isArray(response.data)
    ? response.data
    : response.data?.Message || [];

  return banks;

}

/* =========================================
   GET /api/banks  (PUBLIC)
========================================= */

router.get("/", async (req, res) => {

  try {

    if (!BASE_URL || !TOKEN) {
      return res.status(500).json({
        success: false,
        message: "Core configuration missing",
      });
    }

    console.log("🌍 Fetching banks...");

    const banks = await fetchBanks();

    return res.json(banks);

  } catch (error) {

    console.error("❌ Bank fetch error:", error?.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message:
        error?.response?.data?.message ||
        error?.response?.data ||
        error.message ||
        "Failed to fetch banks",
    });

  }

});

/* =========================================
   GET /api/banks/commercial-banks
========================================= */

router.get("/commercial-banks", async (req, res) => {

  try {

    const banks = await fetchBanks();

    return res.json({
      success: true,
      data: banks
    });

  } catch (error) {

    console.error("❌ Bank fetch error:", error?.response?.data || error.message);

    return res.status(500).json({
      success: false,
      message:
        error?.response?.data?.message ||
        error?.response?.data ||
        error.message ||
        "Failed to fetch banks",
    });

  }

});

module.exports = router;
