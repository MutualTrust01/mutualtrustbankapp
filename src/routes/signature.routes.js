const express = require("express");
const router = express.Router();

const authMiddleware = require("../../middleware/auth");
const {
  saveSignature,
  getSignature,
} = require("../controllers/signature.controller");

// POST /api/signature
router.post("/", authMiddleware, saveSignature);

// GET /api/signature
router.get("/", authMiddleware, getSignature);

module.exports = router;
