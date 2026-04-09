const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const pool = require("../../db");

const { uploadPayslip } = require("../controllers/payslipController");
const {
  getPayslipByIppis,
} = require("../controllers/payslipQueryController");

// ✅ Puppeteer PDF controller
const {
  generatePayslipPdf,
} = require("../controllers/payslipPdfController");

// 🔐 Auth middleware
const requireAuth = require("../../middleware/auth");

/* ================= UPLOAD CONFIG ================= */

const uploadDir = path.join(__dirname, "../../uploads/payslips");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `payslip_${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB
  },
  fileFilter: (req, file, cb) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.originalname)) {
      return cb(new Error("Only Excel or CSV files allowed"));
    }
    cb(null, true);
  },
});

/* ================= ROUTES ================= */

/**
 * 🔐 ADMIN: Upload payslip file
 */
router.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  uploadPayslip
);

/**
 * 🔐 VERIFY: Get payslip by IPPIS (JSON)
 * Used by frontend verification page
 */
router.get("/:ippis", requireAuth, getPayslipByIppis);

/**
 * 🔐 PDF: Generate & download official payslip PDF
 */
router.get("/:ippis/pdf", requireAuth, generatePayslipPdf);



/* ===============================
   CHECK PAYSLIP ELIGIBILITY
================================ */

router.post("/check-eligibility", async (req, res) => {

  try {

    const accountNumber = String(req.body.accountNumber || "").trim();
const productCode = String(req.body.productCode || "").trim();

    if (!accountNumber || !productCode) {
      return res.json({
        success: false,
        message: "Missing account number or product code"
      });
    }

    /* GET LOAN SETTINGS */

    const settings = await pool.query(
      "SELECT loan_settings FROM system_settings LIMIT 1"
    );

    const loanSettings = settings.rows[0]?.loan_settings || {};

    const productConfig =
      loanSettings.productApprovals?.[productCode] || {};

    /* IF PRODUCT DOES NOT REQUIRE PAYSLIP CHECK */

    if (!productConfig.requirePayslipCheck) {
  return res.json({
    success: true,
    eligible: true
  });
}
    /* CHECK PAYSLIP TABLE */

    
const payslip = await pool.query(
`
SELECT
(data->>'6net_pay')::numeric AS net_pay
FROM payslip_records
WHERE data->>'acc_no' = $1
ORDER BY upload_month DESC
LIMIT 1
`,
[accountNumber]
);

    /* ACCOUNT NOT FOUND */

    if (!payslip.rows.length) {
      return res.json({
        success: false,
        message: "Salary account not found in payslip records"
      });
    }

    const netPay = Number(payslip.rows[0].net_pay || 0);

    /* GET MINIMUM NET PAY FROM SETTINGS */

    const minimumNetPay =
      Number(productConfig.minimumNetPay || 0);

    if (minimumNetPay > 0 && netPay < minimumNetPay) {

      return res.json({
        success: false,
     eligible: false,
  message:       
           "Customer net salary is below the minimum required for this loan product"
      });

    }

    return res.json({
  success: true,
  eligible: true,
  netPay
});

  } catch (err) {

    console.error("Payslip eligibility error:", err);

    res.status(500).json({
      success: false,
      message: "Eligibility check failed"
    });

  }

});


module.exports = router;
