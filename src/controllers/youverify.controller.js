import axios from "axios";

/**
 * ==================================================
 * BVN BASIC / VALIDATION (DO NOT CHANGE – WORKING)
 * ==================================================
 */
export const verifyBVN = async (req, res) => {
  try {
    const { bvn } = req.body;

    if (!bvn) {
      return res.status(400).json({
        success: false,
        message: "BVN is required",
      });
    }

    const payload = {
      id: bvn,
      isSubjectConsent: true,
      metadata: {
        requestId: Date.now().toString(),
      },
      premiumBVN: false,
    };

    const response = await axios.post(
      `${process.env.YOUVERIFY_BASE_URL}/v2/api/identity/ng/bvn`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.YOUVERIFY_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30000,
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data.data,
    });
  } catch (error) {
    console.error(
      "❌ YouVerify BVN Error:",
      error.response?.status,
      error.response?.data || error.message
    );

    return res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message ||
        "BVN verification failed",
    });
  }
};

/**
 * ==================================================
 * BVN FULL (NEW – REQUIRED FOR FULL VERIFICATION)
 * ==================================================
 */
export const verifyBVNFull = async (req, res) => {
  try {
    const response = await axios.post(
      `${process.env.YOUVERIFY_BASE_URL}/v2/bvn/full`,
      req.body,
      {
        headers: {
          token: process.env.YOUVERIFY_API_KEY, // ✅ IMPORTANT
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30000,
      }
    );

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error(
      "❌ YouVerify BVN FULL Error:",
      error.response?.status,
      error.response?.data || error.message
    );

    return res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message ||
        "BVN FULL verification failed",
    });
  }
};
