const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "../uploads/profile_pictures");

// 🔥 Ensure folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp"
  ];

  const allowedExt = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = path.extname(file.originalname).toLowerCase();

  // ❌ Validate MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new Error("Invalid file type. Only JPG, PNG, and WEBP images are allowed."),
      false
    );
  }

  // ❌ Validate file extension
  if (!allowedExt.includes(ext)) {
    return cb(
      new Error("Invalid file extension. Only JPG, PNG, and WEBP images are allowed."),
      false
    );
  }

  // ✅ All good
  cb(null, true);
};


const upload = multer({
  storage,
  fileFilter,
  limits: {
  fileSize: 5 * 1024 * 1024 // 5MB
}
});

module.exports = upload;
