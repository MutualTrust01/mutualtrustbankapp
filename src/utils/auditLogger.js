const pool = require("../../db");

module.exports = async function logAudit(
  req,
  actorId,
  action,
  status,
  description,
  targetId = null,
  targetType = null
) {
  try {
    const ip =
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      null;

    const userAgent = req.headers["user-agent"] || null;

    const actorType = actorId ? "admin_user" : "system";

    await pool.query(
      `
      INSERT INTO audit_logs
      (
        actor_id,
        actor_type,
        action,
        status,
        description,
        target_id,
        target_type,
        ip_address,
        user_agent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
      [
        actorId,
        actorType,
        action,
        status,
        description,
        targetId,
        targetType,
        ip,
        userAgent
      ]
    );
  } catch (err) {
    // ⚠️ NEVER BLOCK CORE FLOW
    console.error("⚠️ Audit log failed:", err.message);
  }
};
