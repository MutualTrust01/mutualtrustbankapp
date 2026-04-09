const express = require("express");
const router = express.Router();

const {
  registerCustomerAndOpenAccount,
  openAdditionalAccount,
  registerExistingCustomer,
  getCustomers,
  getCustomerById
} = require("../src/controllers/openAccountController");

/* =========================
   APP ONBOARDING (PUBLIC)
========================= */

/**
 * 📱 MOBILE APP
 * Creates:
 *  - customer profile
 *  - primary account
 */
router.post("/register", registerCustomerAndOpenAccount);


/* =========================
   ADMIN / INTERNAL
========================= */

/**
 * 🏦 Open additional account for existing customer
 */
router.post("/open-account", openAdditionalAccount);

/**
 * 🏦 Sync Core Banking customer into local DB
 */
router.post("/register-existing", registerExistingCustomer);

/**
 * 🧑‍💼 Admin: fetch customers
 */
router.get("/customers", getCustomers);

/**
 * 🧑‍💼 Admin: fetch single customer
 */
router.get("/customers/:id", getCustomerById);

module.exports = router;
