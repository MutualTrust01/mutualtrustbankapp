const express = require("express");
const axios = require("axios");

const router = express.Router();

const IS_SANDBOX =
  process.env.YOUVERIFY_BASE_URL?.includes("sandbox");

/**
 * =====================================================
 * UNIFIED BVN VERIFICATION
 * Works for SANDBOX + LIVE
 * POST /api/youverify/bvn
 * =====================================================
 */
router.post("/bvn", async (req, res) => {
  try {
    const {
      bvn,
      premium = false,
      retrieveNin = false,
      validations = null,
    } = req.body;

    if (!bvn) {
      return res.status(400).json({
        success: false,
        message: "BVN is required",
      });
    }

    /**
     * -----------------------------------------------
     * BUILD PAYLOAD SAFELY
     * -----------------------------------------------
     */
    const payload = {
      id: bvn,
      isSubjectConsent: true,
      metadata: {
        requestId: Date.now().toString(),
      },
    };

    // ✅ Premium BVN (LIVE ONLY)
    if (!IS_SANDBOX && premium === true) {
      payload.premiumBVN = true;
    }

    // ✅ BVN + NIN (LIVE ONLY)
    if (!IS_SANDBOX && retrieveNin === true) {
      payload.shouldRetrieveNin = true;
    }

    // ✅ Facial / Name / DOB validation (allowed on both)
    if (validations) {
      payload.validations = validations;
    }

    /**
     * -----------------------------------------------
     * HEADERS (AUTO SWITCH)
     * -----------------------------------------------
     */
    const headers = IS_SANDBOX
      ? {
          token: process.env.YOUVERIFY_API_KEY, // SANDBOX
        }
      : {
          Authorization: `Bearer ${process.env.YOUVERIFY_API_KEY}`, // LIVE
        };

    /**
     * -----------------------------------------------
     * CALL YOUVERIFY
     * -----------------------------------------------
     */
    const response = await axios.post(
      `${process.env.YOUVERIFY_BASE_URL}/v2/api/identity/ng/bvn`,
      payload,
      {
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 20000,
      }
    );

    return res.status(200).json({
      success: true,
      mode: IS_SANDBOX ? "sandbox" : "live",
      data: response.data,
    });

  } catch (err) {
    console.error(
      "❌ YouVerify BVN Error:",
      err.response?.status,
      err.response?.data || err.message
    );

    return res.status(err.response?.status || 500).json({
      success: false,
      error: err.response?.data || "BVN verification failed",
    });
  }
});

module.exports = router;
