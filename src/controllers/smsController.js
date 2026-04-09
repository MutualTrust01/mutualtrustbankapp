const path = require("path");

// ✅ GUARANTEED path resolution
const smsService = require(
  path.join(__dirname, "../core/sms.service.js")
);

/* ===============================
   SEND SMS API
================================ */
exports.sendSms = async (req, res) => {
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: "messages array is required",
      });
    }

    /*
      Expected message format:
      [
        {
          AccountNumber: "1234567890",
          To: "080xxxxxxxx",
          AccountId: 0,
          Body: "Your message",
          ReferenceNo: "REF123"
        }
      ]
    */

    const result = await smsService.sendBulkSms(messages);

    if (!result || result.Status !== true) {
      return res.status(500).json({
        success: false,
        message: result?.ErrorMessage || "SMS sending failed",
      });
    }

    return res.json({
      success: true,
      message: "SMS sent successfully",
      data: result,
    });

  } catch (error) {
    console.error("❌ SMS Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to send SMS",
    });
  }
};
