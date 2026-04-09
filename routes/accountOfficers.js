const express = require("express");
const router = express.Router();

// 🔐 Auth middlewares
const coreAuth = require("../middleware/coreAuth"); // x-core-key (Postman / Core)
const auth = require("../middleware/auth");         // JWT (Frontend)

const {
  fetchAccountOfficers,
  fetchAccountOfficerByStaffCode,
} = require("../src/controllers/accountOfficerController");

/* ===============================
   ACCOUNT OFFICERS – ADMIN (FRONTEND)
   JWT protected
================================ */

// ✅ MUST COME FIRST
router.get("/admin/all", auth, fetchAccountOfficers);
router.get("/admin/:staffCode", auth, fetchAccountOfficerByStaffCode);

/* ===============================
   ACCOUNT OFFICERS – INTERNAL (CORE)
   x-core-key protected
================================ */

// ⚠️ MUST COME AFTER /admin/*
router.get("/", coreAuth, fetchAccountOfficers);
router.get("/:staffCode", coreAuth, fetchAccountOfficerByStaffCode);

module.exports = router;
