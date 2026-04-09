const customerService = require("../core/customer.service");
const coreClient = require("../utils/coreBankingClient");
const CORE_ENDPOINTS = require("../utils/coreEndpoints");

/* ===============================
   🔐 ALLOWED CORE ACTIONS
   (Frontend / Mobile / Internet Banking)
================================ */
const ALLOWED = {
  ACCOUNT: [
    "BALANCE_ENQUIRY",
    "ACCOUNT_ENQUIRY",
    "GET_TRANSACTIONS",
    "ACCOUNT_SUMMARY",
    "GET_BY_CUSTOMER_ID",
  ],

  TRANSFER: [
    "NAME_ENQUIRY",
    "INTERBANK_TRANSFER",
  ],

  CARDS: [
    "CARD_REQUEST",
    "GET_CUSTOMER_CARDS",
    "FREEZE_CARD",
    "UNFREEZE_CARD",
  ],

  OVERDRAFT: [
    "CREATE_OVERDRAFT",
    "GET_OVERDRAFT",
    "GET_OVERDRAFT_OUTSTANDING",
  ],

  BILLS_PAYMENT: [
    "GET_BILLERS",
    "GET_BILLERS_CATEGORY",
    "GET_PAYMENT_ITEMS",
    "INITIATE_BILLS_PAYMENT",
  ],

  STANDING_ORDER: [
    "CREATE_STANDING_ORDER",
    "GET_STANDING_ORDERS_BY_DEBIT_ACCOUNT",
    "CANCEL_STANDING_ORDER",
  ],

  LOAN: [
    "CREATE_APPLICATION",
    "GET_BY_CUSTOMER_ID",
    "GET_PRODUCTS",  
    "GET_PRODUCT_BY_CODE",
  ],
};

/* ===============================
   CREATE CUSTOMER
================================ */
exports.createCustomer = async (req, res) => {
  try {
    const data = await customerService.createCustomer(req.body);

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Create customer error:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to create customer",
      error: err.response?.data || err.message,
    });
  }
};

/* ===============================
   GET CUSTOMER BY ID
================================ */
exports.getCustomerById = async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId is required",
      });
    }

    const data =
      await customerService.getCustomerByCustomerId(customerId);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Get customer by ID error:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer",
      error: err.response?.data || err.message,
    });
  }
};

/* ===============================
   GET CUSTOMER BY PHONE
================================ */
exports.getCustomerByPhone = async (req, res) => {
  try {
    const { phone } = req.params;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const data = await customerService.getCustomerByPhone(phone);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Get customer by phone error:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer by phone",
      error: err.response?.data || err.message,
    });
  }
};

/* ===============================
   GET CUSTOMER BY ACCOUNT NUMBER
================================ */
exports.getCustomerByAccountNumber = async (req, res) => {
  try {
    const { accountNumber } = req.params;

    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: "accountNumber is required",
      });
    }

    const data =
      await customerService.getCustomerByAccountNumber(accountNumber);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Get customer by account error:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer by account number",
      error: err.response?.data || err.message,
    });
  }
};

/* ===============================
   GET CUSTOMER BY BVN
================================ */
exports.getCustomerByBVN = async (req, res) => {
  try {
    const { bvn } = req.params;

    if (!bvn) {
      return res.status(400).json({
        success: false,
        message: "BVN is required",
      });
    }

    const data = await customerService.getCustomerByBVN(bvn);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("Get customer by BVN error:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer by BVN",
      error: err.response?.data || err.message,
    });
  }
};

/* ===============================
   SMART CUSTOMER LOOKUP
================================ */
exports.lookupCustomer = async (req, res) => {
  try {
    const { value } = req.params;

    if (!value) {
      return res.status(400).json({
        success: false,
        message: "Lookup value is required",
      });
    }

    const data = await customerService.lookupCustomer(value);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const lookupValue = String(value).trim();
    const rawAccounts = data.raw?.Accounts || [];

    if (/^\d{10,}$/.test(lookupValue)) {
      data.raw.Accounts = rawAccounts.filter(
        acc => String(acc.AccountNumber) === lookupValue
      );
    }

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(
      "Customer lookup error:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to lookup customer",
      error: err.response?.data || err.message,
    });
  }
};

/* ===============================
   GENERIC CORE CALL (SECURED)
================================ */
exports.callCore = async (req, res) => {
  try {
    const {
      module,
      action,
      method = "POST",
      payload = {},
      params = {},
    } = req.body;

    if (!module || !action) {
      return res.status(400).json({
        success: false,
        message: "module and action are required",
      });
    }

    const allowedMethods = ["GET", "POST", "PUT"];
    if (!allowedMethods.includes(method.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid HTTP method",
      });
    }

    /* 🔐 SECURITY GATE */
    if (!ALLOWED[module] || !ALLOWED[module].includes(action)) {
      return res.status(403).json({
        success: false,
        message: `Action ${module}.${action} is not allowed`,
      });
    }

    const group = CORE_ENDPOINTS[module];
    if (!group || !group[action]) {
      return res.status(400).json({
        success: false,
        message: `Invalid core action: ${module}.${action}`,
      });
    }

    let endpoint = group[action];

    if (endpoint.includes("{Token}")) {
      endpoint = endpoint.replace(
        "{Token}",
        process.env.CORE_API_KEY
      );
    }

    console.log(`🚀 CORE CALL → ${module}.${action}`);

    const response = await coreClient.request({
      url: endpoint,
      method: method.toLowerCase(),
      data: payload,
      params: typeof params === "object" ? params : {},
    });

    return res.json({
      success: true,
      data: response.data,
    });
  } catch (err) {
    console.error(
      "Generic core call error:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      success: false,
      message: "Core banking request failed",
      error: err.response?.data || err.message,
    });
  }
};



/* ===============================
   GET PRODUCT BY CODE (CORE)
================================ */
exports.getProductByCode = async (req, res) => {
  try {
    const { productCode } = req.params;

    if (!productCode) {
      return res.status(400).json({
        success: false,
        message: "productCode is required",
      });
    }

    const endpoint = CORE_ENDPOINTS.PRODUCTS.GET_BY_CODE;

    const response = await coreClient.request({
      url: endpoint,
      method: "get", // ✅ MUST BE GET
      params: {
        authToken: process.env.CORE_API_KEY, // ✅ lowercase (as per docs)
        productCode: productCode,            // ✅ lowercase (as per docs)
        __skipMfbCode: true,                 // 🔥 prevents interceptor from adding mfbCode
      },
    });

    console.log("FULL CORE RESPONSE:", response.data);

    return res.json({
      success: true,
      data: response.data,
    });

  } catch (err) {
    console.error(
      "Get product by code error:",
      err.response?.data || err.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch product from core",
      error: err.response?.data || err.message,
    });
  }
};


