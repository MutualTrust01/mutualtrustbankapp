const multer = require("multer");
const path = require("path");
const fs = require("fs");

const sanitize = (str = "") =>
  str.replace(/[^a-z0-9_-]/gi, "_").toLowerCase();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { staff_id } = req.body;

    if (!staff_id) {
      return cb(new Error("Missing staff_id"), null);
    }

    const uploadPath = path.join(
      process.cwd(),
      "uploads",
      "staff",
      `staff_${staff_id}`
    );

    fs.mkdirSync(uploadPath, { recursive: true });

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const { document_type } = req.body;

    if (!document_type) {
      return cb(new Error("Missing document_type"), null);
    }

    const ext = path.extname(file.originalname);
    const safeName = `${sanitize(document_type)}${ext}`;

    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype !== "application/pdf") {
    cb(new Error("Only PDF files are allowed"), false);
  } else {
    cb(null, true);
  }
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
