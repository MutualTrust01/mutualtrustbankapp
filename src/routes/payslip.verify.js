const express = require("express");
const router = express.Router();

const {
  getPayslipByIppis,
} = require("../controllers/payslipQueryController");

const {
  generatePayslipPdf,
} = require("../controllers/payslipPdfController");

// 🔓 PUBLIC VERIFICATION (NO SESSION)
router.get("/:ippis", getPayslipByIppis);

// 🔒 PDF (can be protected later)
router.get("/:ippis/pdf", generatePayslipPdf);

module.exports = router;
