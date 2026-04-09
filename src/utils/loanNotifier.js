const { sendStyledMail } = require("../../mailer");
const pool = require("../../db");

async function notifyLoanUpdate({
  io,
  webpush,            // 🔥 NEW (from app.get("webpush"))
  pushSubscription,   // 🔥 NEW (from users.push_subscription)
  userId,
  email,
  staffName,
  loanCode,
  customerName,
  loanType,
  amount,
  tenor,
  interestRate,
  monthlyRepayment,
  stage,
  status,
  message,
  updatedBy = "System",
}) {
  try {
    /* =======================================================
       1️⃣ SOCKET (Real-time inside CRM)
    ======================================================= */
    if (io && userId) {
      io.to(`user_${userId}`).emit("loanNotification", {
        loanCode,
        status,
        message,
      });
    }

    /* =======================================================
       2️⃣ EMAIL (Formal Notification)
    ======================================================= */
    if (email) {
      const now = new Date().toLocaleString();

      const formatMoney = (val) =>
        val ? `₦${Number(val).toLocaleString()}` : "N/A";

      const body = `
        <p>Dear <strong>${staffName || "Team Member"}</strong>,</p>

        <p>
          The following loan application has been updated in the system.
          Please review the details below:
        </p>

        <h3 style="margin-top:20px;">Loan Details</h3>

        <table style="border-collapse:collapse;width:100%;margin-top:10px;">
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Loan Code</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${loanCode}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Customer Name</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${customerName}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Loan Type</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${loanType || "N/A"}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Loan Amount</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${formatMoney(amount)}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Tenor</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${tenor || "N/A"} months</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Interest Rate</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${interestRate || "N/A"}%</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Monthly Repayment</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${formatMoney(monthlyRepayment)}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Current Stage</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${stage || "N/A"}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Status</strong></td>
            <td style="padding:8px;border:1px solid #ddd;"><strong>${status}</strong></td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Updated By</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${updatedBy}</td>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #ddd;"><strong>Date</strong></td>
            <td style="padding:8px;border:1px solid #ddd;">${now}</td>
          </tr>
        </table>

        ${
          message
            ? `<p style="margin-top:20px;"><strong>Additional Note:</strong><br/>${message}</p>`
            : ""
        }

        <p style="margin-top:25px;">
          Please log in to the Loan Management Portal to take necessary action.
        </p>

        <p style="margin-top:30px;">
          Regards,<br/>
          <strong>Loan Operations System</strong><br/>
          Mutual Trust Microfinance Bank
        </p>
      `;

      await sendStyledMail({
        to: email,
        subject: `Loan Update – ${loanCode}`,
        title: "Loan Application Update",
        body,
      });
    }

    /* =======================================================
       3️⃣ WEB PUSH (Top-of-Screen like PalmPay)
    ======================================================= */
    if (webpush && pushSubscription) {
      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify({
            title: "Loan Update",
            body: `Loan ${loanCode} updated to ${status}`,
            icon: "/logo192.png",
          })
        );
      } catch (pushErr) {
        console.error("Push notification error:", pushErr.message);
      }
    }

    /* =======================================================
       4️⃣ DATABASE LOG (Persistent Notification)
    ======================================================= */
    if (userId) {
      await pool.query(
        `
        INSERT INTO notifications
        (user_id, type, message, reference_id, is_read, created_at)
        VALUES ($1, 'LOAN_UPDATE', $2, $3, FALSE, NOW())
        `,
        [
          userId,
          `Loan ${loanCode} updated to ${status}`,
          loanCode,
        ]
      );
    }

  } catch (err) {
    console.error("❌ Loan notification error:", err.message);
  }
}

module.exports = { notifyLoanUpdate };