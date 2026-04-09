const express = require("express");
const router = express.Router();
const axios = require("axios");

const auth = require("../../middleware/auth"); // session auth

/**
 * INTERNAL → CORE CUSTOMER LOOKUP
 * --------------------------------
 * ✔ Session-authenticated
 * ✔ Injects coreAuth key server-side
 * ✔ Frontend never sees secrets
 */
router.get("/customer-lookup", auth, async (req, res) => {
  try {
    const { value } = req.query;

    if (!value) {
      return res.status(400).json({
        success: false,
        message: "Lookup value is required",
      });
    }

    const coreResponse = await axios.get(
      "http://localhost:5000/api/core/customer-lookup",
      {
        params: { value },
        headers: {
          "x-core-key": process.env.CORE_KEY, // 🔐 injected internally
        },
        timeout: 15000,
      }
    );

    return res.json(coreResponse.data);

  } catch (err) {
    console.error("❌ INTERNAL CORE PROXY ERROR");
    console.error(err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch customer from core banking",
    });
  }
});

module.exports = router;
