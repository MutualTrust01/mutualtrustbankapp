const express = require("express");
const router = express.Router();

const {
  getCustomers,
  getCustomerProfile,
  getCustomerCoreProfile,
  updateCustomer,
} = require("../controllers/customerController");

/* ==========================
   GET ALL CUSTOMERS (DB)
========================== */
router.get("/", getCustomers);

/* ==========================
   CORE / MOBILE PROFILE
   (CORE BANKING DATA)
========================== */
router.get("/:id/core-profile", getCustomerCoreProfile);

/* ==========================
   BASIC CUSTOMER PROFILE (DB)
========================== */
router.get("/:id", getCustomerProfile);

/* ==========================
   UPDATE CUSTOMER
========================== */
router.put("/:id", updateCustomer);

module.exports = router;
