// backend/src/routes/profile.routes.js

const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth");
const profileController = require("../controllers/profile.controller");

/* ===============================
   SIGNATURE ROUTES
================================ */

// Save / update signature
router.post(
  "/profile/save-signature",
  authMiddleware,
  profileController.uploadSignature
);

// Get signature (IMPORTANT FOR REFRESH)
router.get(
  "/profile/signature",
  authMiddleware,
  profileController.getSignature
);

module.exports = router;
