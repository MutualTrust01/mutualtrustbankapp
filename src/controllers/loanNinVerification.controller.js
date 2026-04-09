const axios = require("axios");
const pool = require("../../db");


const coreBankingClient = require("../utils/coreBankingClient");
const ENDPOINTS = require("../utils/coreEndpoints");

/**
 * =====================================================
 * VERIFY NIN FOR LOAN
 * PUBLIC (NO AUTH)
 * POST /api/loans/verify-nin
 * =====================================================
 */

/* =====================================================
   🔐 VERIFICATION MODES
===================================================== */
const STRICT_IDENTITY_MATCH = false;
const ENABLE_DOB_MATCH = false;
const ENABLE_NAME_MATCH = false;

/* =====================================================
   HELPERS
===================================================== */
const normalizeName = (name = "") =>
  name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const getNameTokens = (name) =>
  normalizeName(name).split(" ").filter(Boolean);

const hasStrongNameMismatch = (a, b) => {
  const at = getNameTokens(a).filter((t) => t.length > 2);
  const bt = getNameTokens(b).filter((t) => t.length > 2);
  return at.filter((t) => bt.includes(t)).length === 0;
};

const normalizeDOB = (dob) => {
  if (!dob) return null;
  if (typeof dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dob)) return dob;
  if (dob instanceof Date && !isNaN(dob)) return dob.toISOString().slice(0, 10);
  return null;
};

const normalizeNIN = (v) =>
  v ? String(v).replace(/\D/g, "") : null;

/* =====================================================
   CONTROLLER
===================================================== */
exports.verifyNINForLoan = async (req, res) => {
  const requestTime = new Date()
    .toISOString()
    .replace("T", " ")
    .split(".")[0];

  try {
    const { nin, loanSessionId } = req.body;

    /* =========================
       BASIC VALIDATION
    ========================= */
    if (!nin) {
      return res.status(400).json({
        success: false,
        code: "NIN_REQUIRED",
        message: "NIN is required",
      });
    }

    if (!loanSessionId) {
      return res.status(400).json({
        success: false,
        code: "SESSION_REQUIRED",
        message: "Loan session is required to verify NIN",
      });
    }

    console.log(
      `[${requestTime}] 🔍 Verifying NIN → ${nin} (Session ${loanSessionId})`
    );

    /* =========================
       CALL YOUVERIFY (NIN)
    ========================= */
    const { data: result } = await axios.post(
      `${process.env.YOUVERIFY_BASE_URL}/v2/api/identity/ng/nin`,
      {
        id: nin,
        isSubjectConsent: true,
        metadata: { requestId: Date.now().toString() },
      },
      {
        headers: {
          token: process.env.YOUVERIFY_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 15000,
      }
    );

    if (!result?.success) {
      return res.status(result.statusCode || 400).json({
        success: false,
        code: "NIN_VERIFICATION_FAILED",
        message: result.message || "NIN verification failed",
      });
    }

    if (result?.data?.status === "not_found") {
      return res.status(400).json({
        success: false,
        code: "NIN_NOT_FOUND",
        message: "Invalid NIN. NIN not found.",
      });
    }

    const ninData = result.data;

    console.log(
      `[${requestTime}] ✅ NIN Verified → ${ninData.firstName} ${ninData.lastName}`
    );

    /* =========================
       FETCH SESSION (BVN VERIFIED)
    ========================= */
    const { rows } = await pool.query(
      `
      SELECT
        id,
        bvn_nin,
        first_name,
        last_name,
        date_of_birth::text AS date_of_birth
      FROM loan_sessions
      WHERE id = $1
        AND verification_status = 'BVN_VERIFIED'
      `,
      [loanSessionId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        code: "INVALID_SESSION",
        message: "Invalid or expired loan session",
      });
    }

    const session = rows[0];

    const inputNIN = normalizeNIN(nin);
    const bvnNIN = normalizeNIN(session.bvn_nin);

    /* =========================
       HARD BVN → NIN CHECK
    ========================= */
    if (bvnNIN && inputNIN !== bvnNIN) {
      return res.status(422).json({
        success: false,
        code: "NIN_MISMATCH_WITH_BVN",
        message:
          "The NIN entered does not match the NIN linked to this BVN.",
      });
    }

    /* =========================
       FALLBACK VALIDATIONS
    ========================= */
    if (!bvnNIN) {
      if (STRICT_IDENTITY_MATCH) {
        return res.status(422).json({
          success: false,
          code: "STRICT_MATCH_FAILED",
          message:
            "Unable to confirm identity strictly. Please contact support.",
        });
      }

      if (ENABLE_DOB_MATCH) {
        const bvnDOB = normalizeDOB(session.date_of_birth);
        const ninDOB = normalizeDOB(ninData.dateOfBirth);

        if (!bvnDOB || !ninDOB || bvnDOB !== ninDOB) {
          return res.status(422).json({
            success: false,
            code: "DOB_MISMATCH",
            message:
              "The date of birth from NIN does not match the BVN record.",
          });
        }
      }

      if (ENABLE_NAME_MATCH) {
        const bvnName = normalizeName(
          `${session.first_name} ${session.last_name}`
        );
        const ninName = normalizeName(
          `${ninData.firstName} ${ninData.lastName}`
        );

        if (hasStrongNameMismatch(bvnName, ninName)) {
          return res.status(422).json({
            success: false,
            code: "NAME_MISMATCH",
            message:
              "The NIN entered does not belong to the BVN holder.",
          });
        }
      }
    }

    /* =========================
       UPDATE SESSION
    ========================= */
    await pool.query(
      `
      UPDATE loan_sessions
      SET
        nin = $1,
        nin_verified_at = NOW(),
        verification_status = 'NIN_VERIFIED',
        verification_payload = jsonb_set(
          COALESCE(verification_payload, '{}'::jsonb),
          '{nin}',
          $2::jsonb
        ),
        updated_at = NOW()
      WHERE id = $3
      `,
      [inputNIN, JSON.stringify(ninData), loanSessionId]
    );

    /* =========================
       SUCCESS (SESSION ONLY)
    ========================= */
    return res.status(200).json({
      success: true,
      loanSessionId,
    });

  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] ❌ NIN verification error`,
      err.response?.data || err.message
    );

    return res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error. Please try again later.",
    });
  }
};
