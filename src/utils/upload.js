const multer = require("multer");
const path = require("path");

// Storage location
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/complaints");
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});

// File validation
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "application/pdf"
  ];

  if (!allowedTypes.includes(file.mimetype)) {
    cb(new Error("Invalid file type"), false);
  } else {
    cb(null, true);
  }
};

module.exports = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter
});
