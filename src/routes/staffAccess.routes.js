const express = require("express");
const router = express.Router();

const staffAccessController = require("../controllers/staffAccess.controller");
const authMiddleware = require("../../middleware/auth"); // adjust if needed

router.post(
  "/:id/grant-admin-access",
  authMiddleware,
  staffAccessController.grantAdminAccess
);

module.exports = router;
