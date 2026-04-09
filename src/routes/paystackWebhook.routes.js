const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const {
  handleDirectDebitWebhook,
} = require("../controllers/paystackDirectDebit.controller");

module.exports = router;
