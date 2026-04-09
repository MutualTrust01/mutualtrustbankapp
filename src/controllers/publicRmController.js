const pool = require("../../db");

/**
 * ============================================
 * GET RELATIONSHIP MANAGER BY STAFF CODE
 * (Public – Loan Application)
 * ============================================
 */
exports.getPublicRelationshipManager = async (req, res) => {
  const { staffId } = req.params;

  try {
    const { rows } = await pool.query(
      `
SELECT
  id,
  first_name,
  last_name,
  designation,
  email,
  phone_number
      FROM users
      WHERE id = $1
        AND staff_role IN ('RELATIONSHIP_MANAGER', 'LOAN_OFFICER')
        AND status = 'ACTIVE'
      `,
      [staffId]
    );

    if (!rows.length) {
      return res.status(404).json({
        message: "Relationship manager not found",
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("Public RM lookup error:", err);
    res.status(500).json({
      message: "Failed to resolve relationship manager",
    });
  }
};
