const express = require("express");
const router = express.Router();
const {
  getPayslipByIppis,
} = require("../controllers/payslipQueryController");

const {
  generatePayslipPdf,
} = require("../controllers/payslipPdfController");

const payslipController = require("../controllers/payslipController");

console.log("Payslip Controller Loaded:", payslipController);

const multer = require("multer");
const path = require("path");
const { getProgress } = require("../utils/payslipProgress");

const upload = multer({
  dest: path.join(__dirname, "../../uploads")
});

/* 🔹 UPLOAD PAYSLIP */
router.post(
  "/upload",
  upload.single("file"),
  payslipController.uploadPayslip
);

/* 🔹 UPLOAD PROGRESS */
router.get("/progress/:uploadId", (req, res) => {

  const progress = getProgress(req.params.uploadId);

  if (!progress) {
    return res.status(404).json({
      success: false,
      message: "Upload progress not found"
    });
  }

  res.json(progress);

});
router.post(
  "/verify-loan-account",
  payslipController.verifyLoanAccount
);

/* 🔹 PUBLIC PAYROLL CHECK (Loan Application) */
router.get(
  "/public-check/:accountNumber",
  payslipController.publicPayrollEligibility
);

/* 🔹 NEW LOAN ELIGIBILITY CHECK */
router.post(
  "/check-eligibility",
  payslipController.checkLoanEligibility
);

/* 🔹 ADMIN PAYROLL ANALYSIS */
router.get(
  "/analyze/:accountNumber",
  payslipController.analyzePayrollEligibility
);

/* 🔹 ADMIN GET FULL PAYSLIP CUSTOMER */
router.get(
  "/admin/customer/:accountNumber",
  payslipController.getAdminPayslipCustomer
);

/* 🔥 SPECIFIC FIRST */
router.get("/:ippis/pdf", generatePayslipPdf);

/* 🔥 GENERIC LAST (VERY IMPORTANT) */
router.get("/:ippis", getPayslipByIppis);

module.exports = router;
