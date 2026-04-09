const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const pool = require("../../db");

const { io } = require("../../server");

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const secret = process.env.PAYSTACK_SECRET_KEY;

      const computedSignature = crypto
        .createHmac("sha512", secret)
        .update(req.body)
        .digest("hex");

      if (computedSignature !== req.headers["x-paystack-signature"]) {
        console.warn("⚠ Invalid Paystack signature");
        return res.sendStatus(401);
      }

      const event = JSON.parse(req.body.toString());
      const data = event.data;

      console.log("📩 EVENT:", event.event);

      /* ================= NOTIFICATION HELPER ================= */
      const createAndEmitNotification = async ({
        type,
        title,
        message,
        eventType,
        loanId = null,
      }) => {
        const result = await pool.query(
          `
          INSERT INTO notifications
          (type, title, message, event_type, loan_id, is_read, created_at)
          VALUES ($1, $2, $3, $4, $5, false, NOW())
          RETURNING *
          `,
          [type, title, message, eventType, loanId]
        );

        io.of("/notifications").emit("new_notification", result.rows[0]);
      };

      /* ================= 1. MANDATE ACTIVATION ================= */
      if (event.event === "direct_debit.authorization.active") {
        await pool.query("BEGIN");

        try {
          const email = data.customer.email;
          const authCode = data.authorization.authorization_code;

          const mandateRes = await pool.query(
            `
            SELECT id, loan_id
            FROM direct_debit_mandates
            WHERE customer_email = $1
              AND status = 'PENDING'
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [email]
          );

          const mandate = mandateRes.rows[0];

          if (!mandate) {
            await pool.query("COMMIT");
            return res.sendStatus(200);
          }

          await pool.query(
            `
            UPDATE direct_debit_mandates
            SET status = 'ACTIVE',
                authorization_code = $1,
                updated_at = NOW()
            WHERE id = $2
            `,
            [authCode, mandate.id]
          );

          await pool.query(
            `
            UPDATE loans
            SET direct_debit_status = 'ACTIVE',
                updated_at = NOW()
            WHERE id = $1
            `,
            [mandate.loan_id]
          );

          await pool.query("COMMIT");

          console.log("✅ Mandate activated");

await createAndEmitNotification({
  type: "MANDATE_ACTIVATED",
  title: "Mandate Activated",
  message: `Mandate activated for ${email}`,
  eventType: event.event,
  loanId: mandate.loan_id,
});

        } catch (err) {
          await pool.query("ROLLBACK");
          console.error("❌ Mandate activation failed:", err);
        }

        return res.sendStatus(200);
      }

      /* ================= 2. PAYMENT SUCCESS ================= */
      if (event.event === "charge.success") {
        const reference = data.reference;
        const amount = Number(data.amount) / 100;
        const email = data.customer?.email;

        console.log("💰 Payment received:", reference, amount);

        await pool.query("BEGIN");

        try {
          // 🔥 Save authorization (important)
          if (data.authorization?.authorization_code) {
            await pool.query(
              `
              UPDATE direct_debit_mandates
              SET authorization_code = $1
              WHERE customer_email = $2
              `,
              [data.authorization.authorization_code, email]
            );
          }

          const mandateRes = await pool.query(
            `
            SELECT loan_id
            FROM direct_debit_mandates
            WHERE customer_email = $1
              AND status = 'ACTIVE'
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [email]
          );

          const mandate = mandateRes.rows[0];

          if (!mandate?.loan_id) {
            await pool.query("COMMIT");
            return res.sendStatus(200);
          }

          // 🔥 Insert pending repayment
          await pool.query(
            `
            INSERT INTO pending_repayments
            (loan_id, amount, reference, status, created_at)
            VALUES ($1, $2, $3, 'PENDING', NOW())
            ON CONFLICT (reference) DO NOTHING
            `,
            [mandate.loan_id, amount, reference]
          );

          console.log("📌 Saved pending:", reference);

          await createAndEmitNotification({
            type: "PENDING_REPAYMENT",
            title: "Repayment Awaiting Approval",
            message: `₦${amount} received for loan ${mandate.loan_id}`,
            eventType: event.event,
            loanId: mandate.loan_id,
          });

          await pool.query("COMMIT");

        } catch (err) {
          await pool.query("ROLLBACK");
          console.error("❌ Save failed:", err);
        }

        return res.sendStatus(200);
      }

      /* ================= 3. PAYMENT FAILED ================= */
      if (event.event === "charge.failed") {
        console.warn("❌ Payment failed:", data.reference);

        await createAndEmitNotification({
          type: "FAILED_REPAYMENT",
          title: "Debit Failed",
          message: `Failed debit for ${data.customer?.email}`,
          eventType: event.event,
        });

        return res.sendStatus(200);
      }

      return res.sendStatus(200);

    } catch (err) {
      console.error("❌ Webhook fatal error:", err);
      return res.sendStatus(200);
    }
  }
);

module.exports = router;
