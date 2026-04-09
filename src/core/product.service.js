const coreClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");

/* ===============================
   GET ALL PRODUCTS (BANKONE)
================================ */
async function getProducts() {
  try {
    const res = await coreClient.get(
      ENDPOINTS.PRODUCTS.GET_ALL
    );

    // BankOne returns array directly
    return Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    console.error(
      "❌ Product fetch failed:",
      error.response?.data || error.message
    );
    throw new Error("Failed to fetch products from core banking");
  }
}

/* ===============================
   GET PRODUCT BY CODE (BANKONE)
================================ */
async function getProductByCode(productCode) {
  if (!productCode) {
    throw new Error("productCode is required");
  }

  try {
    const res = await coreClient.get(
      ENDPOINTS.PRODUCTS.GET_BY_CODE,
      {
        params: { productCode },
      }
    );

    // BankOne returns a single object
    return res.data || null;
  } catch (error) {
    console.error(
      `❌ Product fetch failed for code ${productCode}:`,
      error.response?.data || error.message
    );
    throw new Error("Failed to fetch product from core banking");
  }
}

module.exports = {
  getProducts,
  getProductByCode,
};
