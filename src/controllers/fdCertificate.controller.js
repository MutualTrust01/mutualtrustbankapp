const {
  createRequest,
} = require("../services/fdCertificate.service");

exports.createCertificateRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fdAccount, type, amount, sendMail } = req.body;

    if (!fdAccount || !type) {
      return res.status(400).json({
        success: false,
        message: "fdAccount and type are required",
      });
    }

    const result = await createRequest({
      fdAccount,
      type,
      amount,
      sendMail,
      userId,
    });

    res.json({
      success: true,
      message: result.message,
      data: result.request,
    });
  } catch (err) {
    console.error("FD certificate request error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Request failed",
    });
  }
};
