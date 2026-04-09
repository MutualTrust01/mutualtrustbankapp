const axios = require("axios");

/* =====================================================
   IN-MEMORY CACHE
===================================================== */
let cachedLoanProducts = null;
let lastFetchTime = 0;

// 5 minutes cache duration
const CACHE_DURATION = 5 * 60 * 1000;

/* =====================================================
   INTERNAL: FETCH FROM CORE
===================================================== */
const fetchFromCore = async () => {
  try {
    const response = await axios.get(
      `${process.env.CORE_BASE_URL}/BankOneWebAPI/api/Product/Get/2`,
      {
        params: {
          authToken: process.env.CORE_API_KEY,
          mfbCode: process.env.MFB_CODE,
        },
        timeout: 15000,
      }
    );

    // 🔍 Normalize possible response structures
    const rawData =
      response.data?.Data ||
      response.data?.data ||
      response.data;

    if (!Array.isArray(rawData)) {
      console.warn("⚠️ Unexpected Core Product Response:", response.data);
      return [];
    }

    // ✅ Filter only Loan products
    const loanProducts = rawData.filter(
      (product) =>
        product.ProductDiscriminator === "Loan"
    );

    return loanProducts;

  } catch (error) {
    console.error("❌ Core Loan Product Fetch Failed");

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Response:", error.response.data);
    } else if (error.code === "ECONNABORTED") {
      console.error("Core request timeout");
    } else {
      console.error(error.message);
    }

    return [];
  }
};

/* =====================================================
   PUBLIC FUNCTION (WITH CACHE)
===================================================== */
exports.fetchCoreLoanProducts = async () => {
  const now = Date.now();

  // ✅ If cache exists and not expired → return cached
  if (
    cachedLoanProducts &&
    now - lastFetchTime < CACHE_DURATION
  ) {
    console.log("⚡ Returning Loan Products from cache");
    return cachedLoanProducts;
  }

  console.log("🔄 Fetching Loan Products from Core...");

  const products = await fetchFromCore();

  // ✅ Update cache only if we received data
  if (products.length > 0) {
    cachedLoanProducts = products;
    lastFetchTime = now;
  }

  return products;
};

/* =====================================================
   OPTIONAL: FETCH SINGLE PRODUCT BY CODE
===================================================== */
exports.getCoreLoanProductByCode = async (productCode) => {
  const products = await exports.fetchCoreLoanProducts();

  return (
    products.find(
      (product) =>
        String(product.ProductCode) ===
        String(productCode)
    ) || null
  );
};
