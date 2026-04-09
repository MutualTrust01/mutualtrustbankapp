const express = require("express");
const router = express.Router();
const pool = require("../../db");
const auth = require("../../middleware/auth");

/**
 * =====================================================
 * GET ACCOUNT OFFICERS (OPS VIEW)
 * Shows HR-approved staff eligible for core banking
 * =====================================================
 */
router.get("/", auth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
SELECT
  id,
  first_name,
  last_name,
  email,
phone_number,
  department,
  core_account_officer_status,
  core_staff_code
FROM users
ORDER BY first_name, last_name


    `);

    res.json(rows);
  } catch (err) {
    console.error("Fetch account officers error:", err);
    res.status(500).json({
      message: "Failed to load account officers",
    });
  }
});



/**
 * =====================================================
 * MARK ACCOUNT OFFICER AS CREATED (OPS ACTION)
 * Ops confirms staff has been created on core system
 * =====================================================
 */
router.post(
  "/mark-created/:staffId",
  auth,
  async (req, res) => {
    const { staffId } = req.params;
    const opsUserId = req.user.id;

    try {
      const result = await pool.query(
        `
        UPDATE users
        SET
          core_account_officer_status = 'AWAITING_VERIFICATION',
          core_account_officer_marked_by = $2,
          core_account_officer_marked_at = NOW()
        WHERE id = $1
          AND core_account_officer_status = 'AWAITING_CREATION'
        RETURNING id
        `,
        [staffId, opsUserId]
      );

      if (!result.rowCount) {
        return res.status(400).json({
          message: "Staff not eligible or already processed",
        });
      }

      res.json({
        message: "Account Officer marked as created. Awaiting verification.",
      });
    } catch (err) {
      console.error("Mark created error:", err);
      res.status(500).json({
        message: "Failed to update status",
      });
    }
  }
);

/**
 * =====================================================
 * CORE VERIFICATION UPDATE (SYSTEM / CRON)
 * Called after BankOne / Core confirmation
 * =====================================================
 */
router.post("/verify/:staffId", async (req, res) => {
  const { staffId } = req.params;
  const { success } = req.body; // true | false

  try {
    await pool.query(
      `
      UPDATE users
      SET
        core_account_officer_status = $2,
        core_account_officer_verified_at = NOW()
      WHERE id = $1
      `,
      [staffId, success ? "CREATED" : "FAILED"]
    );

    res.json({
      message: "Core verification status updated",
    });
  } catch (err) {
    console.error("Core verification error:", err);
    res.status(500).json({
      message: "Failed to update verification status",
    });
  }
});

module.exports = router;
