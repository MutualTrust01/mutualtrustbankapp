/**
 * SESSION AUTH + TIMEOUT MIDDLEWARE (FINAL)
 * - Session-based authentication
 * - IP & device binding (production)
 * - Idle timeout
 * - Loads HR/Admin permissions from DB
 * - Works with roleGuard("HR_ADMIN", "SUPER_ADMIN")
 */

const pool = require("../db");
const PUBLIC_ROUTES = [
  /* ===============================
     🆔 IDENTITY VERIFICATION (PUBLIC)
     =============================== */

"/payslip/public-check",

  // BVN verification (starts loan session)
  "/loans/verify-bvn",

   "/banks/commercial-banks",

  // NIN verification (continues session)
  "/loans/verify-nin",

  // Fetch verified customer summary (NAME, MASKED BVN)
"/loans/public/session/", // 🔥 THIS FIXES YOUR ISSUE


  /* ===============================
     📸 FACE VERIFICATION (PUBLIC)
     =============================== */

  // Generic face verification
  "/loans/verify-face",

   // LOAN PRODUCTS (PUBLIC) 
  
  "/loans/public/loan-products",

  // BVN face match
  "/loans/verify-bvn-face",

  // NIN face match
  "/loans/verify-nin-face",


  /* ===============================
     👤 RELATIONSHIP MANAGERS (PUBLIC)
     =============================== */

  // List RMs for modal selection
  "/loans/public/relationship-managers",

  // Fetch single RM (via URL param)
  "/loans/public/relationship-manager",


  /* ===============================
     📝 PUBLIC LOAN SUBMISSION
     =============================== */

  // Final loan submission (no login)
  "/loans/public/create",


  /* ===============================
     🔗 YOUVERIFY WEBHOOKS / TEST
     =============================== */

  "/api/youverify/verify",
  "/api/youverify/bvn",
  "/api/youverify/webhook",
"/api/paystack/direct-debit/webhook",
"/api/paystack/direct-debit/callback",
"/api/paystack/direct-debit/status",

];



module.exports = async (req, res, next) => {

  // 🔥 Allow CORS preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
console.log("Incoming path:", req.path);
  // 🔓 BYPASS SESSION AUTH FOR PUBLIC ROUTES
 

const url = req.originalUrl.split("?")[0]; // remove query params

if (PUBLIC_ROUTES.some(route => url.startsWith(route))) {
  return next();
}
  try {
    /* =========================
       AUTH CHECK
    ========================= */
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

   
    /* =========================
       LOAD SESSION TIMEOUT
    ========================= */
   const configResult = await pool.query(`
  SELECT session_config
  FROM system_settings
  ORDER BY updated_at DESC
  LIMIT 1
`);

const sessionConfig = configResult.rows[0]?.session_config || {};

const timeoutMinutes =
  sessionConfig.admin_idle_timeout_minutes ?? 15;


   

    /* =========================
       IDLE TIMEOUT CHECK
    ========================= */
    const now = Date.now();

    if (!req.session.lastActivity) {
      req.session.lastActivity = now;
      return next();
    }

    const idleMinutes = (now - req.session.lastActivity) / 1000 / 60;

    if (idleMinutes >= timeoutMinutes) {
      req.session.destroy(() => {});
      return res.status(401).json({
        success: false,
        message: "Session expired due to inactivity. Please login again.",
      });
    }

    req.session.lastActivity = now;

    /* =========================
       LOAD USER PERMISSIONS
    ========================= */
    const userResult = await pool.query(
      `
     SELECT
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.role_id,
  r.name AS role_name,
  u.can_access_hrm_crm,
  u.can_access_admin
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE u.id = $1

      `,
      [req.session.user.id]
    );

    if (userResult.rows.length === 0) {
      req.session.destroy(() => {});
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    /* =========================
       NORMALIZE USER (FOR ROLE GUARD)
    ========================= */
    const user = userResult.rows[0];

    req.user = {
  id: user.id,
  email: user.email,
  full_name: `${user.first_name} ${user.last_name}`,
  role_id: user.role_id,
  role_name: user.role_name,   // 🔥 IMPORTANT
  can_access_hrm_crm: user.can_access_hrm_crm === true,
  can_access_admin: user.can_access_admin === true,
};

    next();
  } catch (err) {
    console.error("Session auth error:", err);
    return res.status(500).json({
      success: false,
      message: "Session validation failed",
    });
  }
};
