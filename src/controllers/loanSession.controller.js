const pool = require("../../db");

/**
 * =====================================================
 * GET LOAN SESSION SUMMARY
 * PUBLIC
 * =====================================================
 */
exports.getLoanSession = async (req, res) => {
  try {
    const { loanSessionId } = req.params;

    if (!loanSessionId) {
      return res.status(400).json({
        success: false,
        code: "SESSION_ID_REQUIRED",
        message: "Loan session ID is required",
      });
    }

    const { rows } = await pool.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        bvn,
        expires_at,
        verification_status,
        verification_payload->>'mobile' AS phone
      FROM loan_sessions
      WHERE id = $1
      `,
      [loanSessionId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        code: "SESSION_NOT_FOUND",
        message: "Loan session expired or not found",
      });
    }

    const session = rows[0];

    const isExpired =
      session.expires_at &&
      new Date(session.expires_at) < new Date();

    const canResume =
      !isExpired &&
      session.verification_status !== "FULLY_VERIFIED";

    const maskedBVN = session.bvn
      ? `**** **** ${String(session.bvn).slice(-4)}`
      : null;

    return res.status(200).json({
      success: true,

      canResume, // 🔑 THIS IS THE KEY

      customer: {
        fullName: `${session.first_name} ${session.last_name}`,
        phone: session.phone || null,
        maskedBVN,
      },

      verificationStatus: session.verification_status,
    });
  } catch (err) {
    console.error("❌ GET LOAN SESSION ERROR:", err);

    return res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to fetch loan session",
    });
  }
};
