const pool = require("../../db");

/**
 * Fetch onboarding configuration from system_settings
 * This controls account opening behaviour (product code, rules, etc.)
 */
module.exports = async function getOnboardingConfig() {
  try {
    const result = await pool.query(`
      SELECT onboarding_config
      FROM system_settings
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    // Safe fallback if table is empty or config is missing
    return result.rows[0]?.onboarding_config || {
      default_product_code: "SB001",
      allow_multiple_accounts: false,
      require_documents: false
    };

  } catch (error) {
    console.error("Failed to load onboarding config:", error.message);

    // Never block onboarding because of settings failure
    return {
      default_product_code: "SB001",
      allow_multiple_accounts: false,
      require_documents: false
    };
  }
};
