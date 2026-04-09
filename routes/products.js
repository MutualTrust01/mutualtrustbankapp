const express = require("express");
const router = express.Router();

// 🔐 Auth middlewares
const coreAuth = require("../middleware/coreAuth");
const auth = require("../middleware/auth");

const {
  getProducts,
  getProductByCode,
} = require("../src/controllers/productController");

/* ===============================
   PRODUCTS – ADMIN (FRONTEND)
================================ */

// ✅ Admin UI access (JWT)
router.get("/admin/all", auth, getProducts);
router.get("/admin/:productCode", auth, getProductByCode);

/* ===============================
   PRODUCTS – INTERNAL (CORE)
================================ */

// ✅ Core banking access (x-core-key)
router.get("/", coreAuth, getProducts);
router.get("/:productCode", coreAuth, getProductByCode);

module.exports = router;
