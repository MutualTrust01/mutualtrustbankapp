const signatureService = require("../services/signature.service");

/**
 * ===============================
 * SAVE SIGNATURE
 * ===============================
 * Saves a certificate-grade base64 PNG
 * POST /api/signature
 */
exports.saveSignature = async (req, res) => {
  try {
    // 🔐 Auth check (auth middleware should already set this)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { signature } = req.body;

    // 🧪 Validate payload
    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Signature is required",
      });
    }

    if (!signature.startsWith("data:image/png;base64,")) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature format",
      });
    }

    // 💾 Save using service
    await signatureService.saveSignature({
      userId,
      base64: signature,
    });

    return res.json({
      success: true,
      message: "Signature saved successfully",
    });
  } catch (err) {
    console.error("SAVE SIGNATURE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to save signature",
    });
  }
};

/**
 * ===============================
 * GET SAVED SIGNATURE
 * ===============================
 * GET /api/signature
 */
exports.getSignature = async (req, res) => {
  try {
    // 🔐 Auth check
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const signature = await signatureService.getSignature(userId);

    return res.json({
      success: true,
      signature: signature || null,
    });
  } catch (err) {
    console.error("GET SIGNATURE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to load signature",
    });
  }
};
