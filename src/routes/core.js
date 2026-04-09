const express = require("express");
const router = express.Router();
const coreController = require("../controllers/coreController");

/* ======================================
   🔐 CORE BANKING APIs
====================================== */

/* ---------- GENERIC CORE GATEWAY ---------- */
/**
 * This route can call ALL BankOne endpoints
 * Used for Postman testing & advanced frontend calls
 */
router.post("/", coreController.callCore);


/* ---------- CUSTOMER ROUTES (FRIENDLY) ---------- */

// ✅ SMART LOOKUP (MUST COME FIRST)
router.get("/customers/lookup/:value", coreController.lookupCustomer);

// Specific lookups
router.get("/customers/phone/:phone", coreController.getCustomerByPhone);
router.get(
  "/customers/account/:accountNumber",
  coreController.getCustomerByAccountNumber
);
router.get("/customers/bvn/:bvn", coreController.getCustomerByBVN);

// Generic LAST
router.get("/customers/:customerId", coreController.getCustomerById);

// Create customer
router.post("/customers", coreController.createCustomer);


/* ---------- PRODUCT ROUTES ---------- */

router.get(
  "/products/:productCode",
  coreController.getProductByCode
);


module.exports = router;
