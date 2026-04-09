const multer = require("multer");
const path = require("path");
const fs = require("fs");

/* =====================================================
   LOAN FILE UPLOAD MIDDLEWARE
   Structure:
   uploads/
     └── loan_documents/
           └── {loanSessionId}/
                 ├── passport.pdf
                 ├── payslip.jpg
===================================================== */

const baseUploadDir = path.join(__dirname, "../uploads/loan_documents");

// Ensure base directory exists
if (!fs.existsSync(baseUploadDir)) {
  fs.mkdirSync(baseUploadDir, { recursive: true });
}

/* =====================================================
   STORAGE CONFIG
===================================================== */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const { loanSessionId } = req.body;

      if (!loanSessionId) {
        return cb(new Error("loanSessionId is required for file upload"));
      }

      // Create folder per loan session
      const sessionFolder = path.join(baseUploadDir, loanSessionId);

      if (!fs.existsSync(sessionFolder)) {
        fs.mkdirSync(sessionFolder, { recursive: true });
      }

      cb(null, sessionFolder);
    } catch (err) {
      cb(err);
    }
  },

  filename: (req, file, cb) => {
    try {
      const safeName = file.originalname
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9_.-]/g, "");

      cb(null, `${Date.now()}-${safeName}`);
    } catch (err) {
      cb(err);
    }
  },
});

/* =====================================================
   MULTER CONFIG
===================================================== */

const loanFilesUpload = multer({
  storage,

  limits: {
    fileSize: 50 * 1024 * 1024, // ✅ 50MB per file
    files: 10, // ✅ Max 10 files per request (optional)
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "application/pdf",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Unsupported file type. Only JPG, PNG, WEBP, and PDF are allowed."
        ),
        false
      );
    }

    cb(null, true);
  },
});

module.exports = loanFilesUpload;
