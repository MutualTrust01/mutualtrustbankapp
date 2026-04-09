const axios = require("axios");
const pool = require("../../db");

/* =========================
   CONFIG
========================= */
const MIN_FACE_CONFIDENCE = 80;
const MAX_FACE_ATTEMPTS = 15;

/* =========================
   IMAGE NORMALIZER
========================= */
const normalizeImage = (img) => {
  if (!img) return null;
  if (img.startsWith("http://") || img.startsWith("https://")) return img;
  if (img.startsWith("data:image")) return img;
  return `data:image/jpeg;base64,${img}`;
};

/* =========================
   UUID VALIDATOR
========================= */
const isUUID = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

/* =====================================================
   FACE VERIFICATION CONTROLLER
===================================================== */
exports.verifyFaceForLoan = async (req, res) => {
  try {
    const { loanSessionId, selfie } = req.body;

    /* ================= BASIC VALIDATION ================= */
    if (!loanSessionId || !selfie) {
      return res.status(400).json({
        success: false,
        code: "REQUIRED_FIELDS_MISSING",
        message: "Please capture a selfie to continue.",
      });
    }

    if (!isUUID(loanSessionId)) {
      return res.status(400).json({
        success: false,
        code: "INVALID_SESSION_ID",
        message: "Invalid verification session. Please restart the process.",
      });
    }

    /* ================= FETCH SESSION ================= */
    const { rows } = await pool.query(
      `
      SELECT
        verification_payload,
        COALESCE(face_attempt_count, 0) AS face_attempt_count,
        verification_status,
        expires_at
      FROM loan_sessions
      WHERE id = $1
        AND expires_at > NOW()
      `,
      [loanSessionId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        code: "SESSION_EXPIRED",
        message: "Your verification session has expired. Please restart.",
      });
    }

    const session = rows[0];

    /* ================= VERIFICATION ORDER ================= */
    if (session.verification_status !== "NIN_VERIFIED") {
      return res.status(409).json({
        success: false,
        code: "INVALID_VERIFICATION_ORDER",
        message:
          "Please complete BVN and NIN verification before face verification.",
      });
    }

    /* ================= GET ID IMAGE ================= */
    const payload = session.verification_payload;

   const idImage =
  payload?.nin?.image ||
  payload?.nin?.photo ||
  payload?.nin?.data?.image ||
  payload?.image ||
  payload?.photo ||
  payload?.faceImage ||
  payload?.data?.image ||
  payload?.data?.photo ||
  payload?.data?.faceImage ||
  null;

   
const isTestMode =
process.env.FACE_VERIFICATION_BYPASS === "true";


if (!idImage && !isTestMode) {
  return res.status(400).json({
    success: false,
    code: "ID_IMAGE_NOT_AVAILABLE",
    message:
      "We could not retrieve your ID photo. Please upload a clear passport photograph to continue.",
  });
}


    /* =========================
       🧪 TEST MODE FACE BYPASS
    ========================= */
    if (isTestMode)  {
      const facePayload = {
        bypassed: true,
        idImage: normalizeImage(idImage),
        selfie: normalizeImage(selfie),
        confidence: 100,
        verifiedAt: new Date().toISOString(),
      };

      await pool.query(
        `
        UPDATE loan_sessions
        SET
          face_verification_status = 'FACE_MATCHED',
          face_match_score = 100,
          face_verification_payload = $1,
          face_verified_at = NOW(),
          identity_locked = TRUE,
          identity_locked_at = NOW(),
          verification_status = 'FULLY_VERIFIED',
          face_attempt_count = 0,
          face_locked_until = NULL
        WHERE id = $2
        `,
        [facePayload, loanSessionId]
      );

      return res.json({
        success: true,
        code: "FACE_MATCHED",
        confidence: 100,
        bypassed: true,
      });
    }

    /* ================= FACE COMPARISON ================= */
    let comparison;
    try {
      const response = await axios.post(
        `${process.env.YOUVERIFY_BASE_URL}/v2/api/identity/compare-image`,
        {
          image1: normalizeImage(idImage),
          image2: normalizeImage(selfie),
          isSubjectConsent: true,
        },
        {
          headers: {
            token: process.env.YOUVERIFY_API_KEY,
            "Content-Type": "application/json",
          },
          timeout: 15000,
        }
      );

      comparison = response.data?.data?.imageComparison;
    } catch (err) {
      console.error("Face provider error:", err.response?.data || err.message);
      return res.status(503).json({
        success: false,
        code: "FACE_SERVICE_UNAVAILABLE",
        message:
          "Face verification is temporarily unavailable. Please try again shortly.",
      });
    }

    if (!comparison) {
      return res.status(503).json({
        success: false,
        code: "FACE_PROVIDER_ERROR",
        message:
          "We could not verify your face at the moment. Please try again.",
      });
    }

    const isMatch =
      comparison.match === true &&
      comparison.confidenceLevel >= MIN_FACE_CONFIDENCE;

    const facePayload = {
      comparison,
      idImage: normalizeImage(idImage),
      selfie: normalizeImage(selfie),
    };

    /* ================= SUCCESS ================= */
    if (isMatch) {
      await pool.query(
        `
        UPDATE loan_sessions
        SET
          face_verification_status = 'FACE_MATCHED',
          face_match_score = $1,
          face_verification_payload = $2,
          face_verified_at = NOW(),
          identity_locked = TRUE,
          identity_locked_at = NOW(),
          verification_status = 'FULLY_VERIFIED',
          face_attempt_count = 0,
          face_locked_until = NULL
        WHERE id = $3
        `,
        [comparison.confidenceLevel, facePayload, loanSessionId]
      );

      return res.json({
        success: true,
        code: "FACE_MATCHED",
        confidence: comparison.confidenceLevel,
      });
    }

    /* ================= FAILURE ================= */
    await pool.query(
      `
      UPDATE loan_sessions
      SET
        face_verification_status = 'FACE_MISMATCH',
        face_match_score = $1,
        face_verification_payload = $2,
        face_attempt_count = $3
      WHERE id = $4
      `,
      [
        comparison.confidenceLevel,
        facePayload,
        session.face_attempt_count + 1,
        loanSessionId,
      ]
    );

    return res.status(422).json({
      success: false,
      code: "FACE_MISMATCH",
      message:
        "Face verification failed. Please ensure good lighting and try again.",
      confidence: comparison.confidenceLevel,
    });
  } catch (error) {
    console.error("Face verification error:", error);
    return res.status(500).json({
      success: false,
      code: "FACE_VERIFICATION_FAILED",
      message:
        "We were unable to verify your face at the moment. Please try again later.",
    });
  }
};
