const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const BASE_UPLOAD_PATH = path.join(
  __dirname,
  "../uploads/loan-admin-approvals"
);

console.log("BASE_UPLOAD_PATH:", BASE_UPLOAD_PATH); 
// Ensure base directory exists
if (!fs.existsSync(BASE_UPLOAD_PATH)) {
  fs.mkdirSync(BASE_UPLOAD_PATH, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const loanId = req.params.loanId;

    if (!loanId) {
      return cb(new Error("Loan ID missing in request"));
    }

    const loanFolder = path.join(BASE_UPLOAD_PATH, loanId);

    if (!fs.existsSync(loanFolder)) {
      fs.mkdirSync(loanFolder, { recursive: true });
    }

    cb(null, loanFolder);
  },

  filename: function (req, file, cb) {
    const uploadId = uuidv4();
    const cleanName = file.originalname.replace(/\s/g, "_");

    file.uploadId = uploadId; // 🔥 attach identity to file

    cb(null, `${uploadId}-${cleanName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error("Only PDF, JPG, PNG allowed"));
  }

  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});
