// backend/src/controllers/profile.controller.js

const signatureService = require("../services/signature.service");

/**
 * ===============================
 * SAVE / UPDATE SIGNATURE
 * ===============================
 */
exports.uploadSignature = async (req, res) => {
  try {
    const userId = req.user.id; // 🔑 MUST exist
    const { signature } = req.body;

    if (!signature) {
      return res.status(400).json({ message: "Signature required" });
    }

    const savedSignature = await signatureService.saveSignature({
      userId,
      base64: signature,
    });

    return res.json({
      success: true,
      signature: savedSignature,
    });
  } catch (err) {
    console.error("Signature upload error:", err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * ===============================
 * GET SIGNATURE (ON REFRESH)
 * ===============================
 */
exports.getSignature = async (req, res) => {
  try {
    const userId = req.user.id; // 🔑 SAME USER ID

    const signature = await signatureService.getSignature(userId);

    return res.json({
      signature: signature || null,
    });
  } catch (err) {
    console.error("Get signature error:", err);
    return res.status(500).json({ signature: null });
  }
};
