const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const requireAuth = require("../../middleware/auth");

const {
  uploadPayslip,
} = require("../controllers/payslipUploadController");

const {
  getPayslipByIppis,
} = require("../controllers/payslipQueryController");

const {
  generatePayslipPdf,
} = require("../controllers/payslipPdfController");

/* ===============================
   ENSURE UPLOAD DIR EXISTS
================================ */
const uploadDir = path.join(__dirname, "../../uploads/payslips");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* ===============================
   MULTER CONFIG
================================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `payslip_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB (safer for Excel)
  fileFilter: (req, file, cb) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.originalname)) {
      return cb(
        new Error("Only Excel (.xlsx, .xls) or CSV files are allowed")
      );
    }
    cb(null, true);
  },
});

/* ===============================
   HELPERS
================================ */
const isValidIppis = (ippis) => /^[A-Za-z0-9]+$/.test(ippis);

/* ===============================
   UPLOAD PAYSLIP (ADMIN ONLY)
   POST /api/payslip/upload
================================ */
router.post(
  "/upload",
  requireAuth,
  upload.single("file"),
  uploadPayslip
);

/* ===============================
   QUERY PAYSLIP (JSON)
   GET /api/payslip/:ippis
================================ */
router.get("/:ippis", async (req, res, next) => {
  try {
    const { ippis } = req.params;

    if (!ippis || !isValidIppis(ippis)) {
      return res.status(400).json({ message: "Invalid IPPIS number" });
    }

    return getPayslipByIppis(req, res);
  } catch (err) {
    next(err);
  }
});

/* ===============================
   GENERATE PAYSLIP PDF
   GET /api/payslip/:ippis/pdf
================================ */
router.get("/:ippis/pdf", async (req, res, next) => {
  try {
    const { ippis } = req.params;

    if (!ippis || !isValidIppis(ippis)) {
      return res.status(400).json({ message: "Invalid IPPIS number" });
    }

    return generatePayslipPdf(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
