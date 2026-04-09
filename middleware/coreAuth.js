/**
 * CORE BANKING SYSTEM AUTH
 * =================================
 * ✔ No session
 * ✔ No cookies
 * ✔ Machine-to-machine only
 * ✔ Backward compatible
 */
module.exports = function coreAuth(req, res, next) {
  /* ===============================
     ACCEPT ALL VALID SOURCES
  ================================ */
  const headerKey =
    req.headers["x-core-key"] ||
    req.headers["x-core-auth"] ||
    req.headers["authtoken"] ||          // 🔥 BankOne style
    req.headers["authorization"];        // optional future use

  const queryKey =
    req.query.core_key ||
    req.query.authToken;

  const providedKey = headerKey || queryKey;

  /* ===============================
     EXPECTED KEY (NO ENV CHANGE)
  ================================ */
  const ENV_KEY =
    process.env.CORE_API_KEY || process.env.CORE_KEY;

  console.log("🔑 CORE AUTH RECEIVED:", providedKey);
  console.log("🔐 CORE AUTH EXPECTED:", ENV_KEY);

  /* ===============================
     HARD FAIL IF SERVER MISCONFIGURED
  ================================ */
  if (!ENV_KEY) {
    return res.status(500).json({
      success: false,
      message: "CORE_API_KEY missing in server configuration",
    });
  }

  /* ===============================
     UNAUTHORIZED REQUEST
  ================================ */
  if (!providedKey || providedKey !== ENV_KEY) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized core access",
    });
  }

  /* ===============================
     AUTHORIZED CORE REQUEST
  ================================ */
  req.core = {
    system: true,
    source: "core-banking",
  };

  next();
};
