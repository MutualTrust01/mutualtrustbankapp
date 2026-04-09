// src/controllers/publicLoanProducts.controller.js
const pool = require("../../db");
const { getProducts } = require("./productController");

/**
 * =====================================================
 * PUBLIC – SAFE FOR CUSTOMERS
 * =====================================================
 * ✅ Products are filtered by allowedProducts
 * ✅ Amount, tenure, requirements come from SETTINGS
 * ✅ No approval flow / internal roles exposed
 * =====================================================
 */
exports.getPublicLoanProducts = async (req, res) => {
  try {
    /* =========================
       1️⃣ LOAD SYSTEM SETTINGS
    ========================= */
    const s = await pool.query(
      "SELECT loan_settings FROM system_settings LIMIT 1"
    );

    if (!s.rows.length) {
      return res.json({ success: true, data: [] });
    }

    // ✅ SOURCE OF TRUTH
    const loanSettings = s.rows[0].loan_settings || {};
    const allowedCodes = loanSettings.allowedProducts || [];
    const approvals = loanSettings.productApprovals || {};

    if (!allowedCodes.length) {
      return res.json({ success: true, data: [] });
    }

    /* =========================
       2️⃣ FETCH CORE PRODUCTS
       (CODE + NAME ONLY)
    ========================= */
    const coreProducts = await getProductsInternal();

    const productMap = {};
    coreProducts.forEach((p) => {
      productMap[String(p.ProductCode)] = p.ProductName;
    });

    /* =========================
       3️⃣ BUILD CUSTOMER-SAFE RESPONSE
       (INCLUDING DYNAMIC FORM FIELDS)
    ========================= */
    const safeProducts = allowedCodes
      .map((code) => {
        const cfg = approvals[code];
        if (!cfg) return null;

const core = coreProducts.find(
      (p) => String(p.ProductCode) === String(code)
    );    
    return {
          code,
          name: productMap[code] || code,

 interestRate: Number(core?.InterestRate || 0),
      tenure: Number(core?.Tenure || 0),

          // 💰 Amount range
          minAmount: Number(cfg.minAmount || 0),
          maxAmount: Number(cfg.maxAmount || 0),

          // ⏱ Tenure range (months)
          minTenure: Number(cfg.minTenure || 0),
          maxTenure: Number(cfg.maxTenure || 0),

          // 📄 Display-only requirements
          requirements: Array.isArray(cfg.requirements)
            ? cfg.requirements
            : [],

          // 🧩 🔥 DYNAMIC LOAN FORM FIELDS (THIS IS THE KEY UPDATE)
          fields: Array.isArray(cfg.fields)
            ? cfg.fields
            : [],
        };
      })
      .filter(Boolean);

    return res.json({
      success: true,
      data: safeProducts,
    });
  } catch (err) {
    console.error("Public loan products error:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to load loan products",
    });
  }
};


/* =====================================================
   INTERNAL CALL – REUSE CORE CONTROLLER
   (NO REQ / RES)
===================================================== */
const { fetchCoreLoanProducts } = require("../services/coreProduct.service");

const getProductsInternal = async () => {
  return await fetchCoreLoanProducts();
};

