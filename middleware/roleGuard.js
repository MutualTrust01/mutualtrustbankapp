/**
 * Universal Role & Permission Guard
 *
 * Handles:
 *  - "Super Admin"
 *  - "SUPER_ADMIN"
 *  - "SUPER ADMIN"
 *  - "super admin"
 *
 * Also supports flag-based permissions.
 */

const normalize = (value) => {
  if (!value) return null;

  return value
    .toUpperCase()
    .replace(/\s+/g, "_")   // spaces → underscores
    .replace(/[^A-Z_]/g, ""); // remove weird chars
};

module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: user not authenticated",
        });
      }

      const {
        role_name,
        can_access_admin,
        can_access_hrm_crm,
      } = req.user;

      const normalizedUserRole = normalize(role_name);
      const normalizedAllowed = allowedRoles.map(normalize);

      /**
       * ===============================
       * 1️⃣ ROLE NAME MATCH
       * ===============================
       */
      if (
        normalizedUserRole &&
        normalizedAllowed.includes(normalizedUserRole)
      ) {
        return next();
      }

      /**
       * ===============================
       * 2️⃣ FLAG-BASED FALLBACK
       * ===============================
       */

      if (
        normalizedAllowed.includes("SUPER_ADMIN") &&
        can_access_admin === true
      ) {
        return next();
      }

      if (
        normalizedAllowed.includes("HR_ADMIN") &&
        can_access_hrm_crm === true
      ) {
        return next();
      }

      /**
       * ===============================
       * ❌ ACCESS DENIED
       * ===============================
       */
      console.warn("RoleGuard blocked:", {
        userId: req.user.id,
        role_name,
        normalizedUserRole,
        allowed: normalizedAllowed,
      });

      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient privileges",
      });

    } catch (error) {
      console.error("RoleGuard error:", error);

      return res.status(500).json({
        success: false,
        message: "Internal authorization error",
      });
    }
  };
};
