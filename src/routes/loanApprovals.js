const express = require("express");
const router = express.Router();
const pool = require("../../db");

/* =========================
   FETCH FULLY APPROVED LOANS (READY FOR PROCESSING)
========================= */
router.get("/processing", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        /* ================= LOAN ================= */
        l.id,
        l.loan_code,
        l.status,
        l.created_at,
        l.crm_staff_id,

        /* ================= ACCOUNT OFFICER ================= */
        (u.first_name || ' ' || u.last_name) AS rm_name,

        /* ================= CUSTOMER ================= */
        (ls.first_name || ' ' || ls.last_name) AS customer_name,
        ls.verification_payload->>'email' AS customer_email,
        ls.first_name,
        ls.last_name,
        ls.date_of_birth,
        ls.bvn,
        ls.nin,

        /* ================= PRODUCT & AMOUNT ================= */
        la.answers->>'productCode' AS product_code,
        (la.answers->>'field_loan_amount')::numeric AS loan_amount,

        /* ================= APPLICATION PAYLOAD ================= */
        la.answers AS application_payload,

        /* ================= BVN ================= */
        ls.verification_status AS bvn_status,
        ls.bvn_verified_at,
        ls.verification_payload AS bvn_payload,

        /* ================= NIN ================= */
        ls.nin_verified_at,
        ls.verification_payload->'nin' AS nin_payload,

        /* ================= FACE VERIFICATION ================= */
        ls.face_verification_status,
        ls.face_verified_at,
        ls.face_match_score,
        ls.face_verification_payload AS face_payload

      FROM loans l
      JOIN loan_sessions ls ON ls.id = l.session_id
      LEFT JOIN loan_answers la ON la.loan_id = l.id
      LEFT JOIN users u ON u.id = l.crm_staff_id

      WHERE l.status = 'FINAL_APPROVED'
      ORDER BY l.created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows,
    });

  } catch (err) {
    console.error("FETCH FULLY APPROVED LOANS ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Unable to fetch fully approved loans",
    });
  }
});

module.exports = router;
