const pool = require("../../db");

exports.analyzePayrollEligibility = async (req, res) => {
  const { accountNumber } = req.params;

  if (!accountNumber || accountNumber.length !== 10) {
    return res.status(400).json({
      success: false,
      message: "Invalid account number"
    });
  }

  try {

    /* ===============================
       1️⃣ FETCH PAYROLL RECORD
    =============================== */

    const payroll = await pool.query(
      `
      SELECT
        account_number,
        full_name,
        net_pay,
        salary_bank_code,
        employer
      FROM payslip_customers
      WHERE account_number = $1
      LIMIT 1
      `,
      [accountNumber]
    );

    if (!payroll.rows.length) {
      return res.json({
        success: true,
        eligible: false,
        analysis: {
          accountNumber,
          status: "NOT_FOUND",
          message:
            "Account number not found in payroll system"
        }
      });
    }

    const customer = payroll.rows[0];

    /* ===============================
       2️⃣ FETCH SETTINGS
    =============================== */

    const settings = await pool.query(
      `
      SELECT minimum_netpay
      FROM settings
      LIMIT 1
      `
    );

    const minimumNetPay =
      Number(settings.rows[0]?.minimum_netpay || 0);

    const netPay = Number(customer.net_pay || 0);

    /* ===============================
       3️⃣ CALCULATE ELIGIBILITY
    =============================== */

    const difference = netPay - minimumNetPay;

    let status = "ELIGIBLE";
    let eligible = true;

    if (netPay < minimumNetPay) {
      status = "LOW_NET_PAY";
      eligible = false;
    }

    /* ===============================
       4️⃣ RESPONSE
    =============================== */

    return res.json({
      success: true,
      eligible,
      analysis: {
        accountNumber: customer.account_number,
        fullName: customer.full_name,
        netPay,
        minimumRequired: minimumNetPay,
        difference,
        employer: customer.employer || null,
        status
      }
    });

  } catch (err) {

    console.error("Payroll analysis error:", err);

    return res.status(500).json({
      success: false,
      message: "Payroll eligibility analysis failed"
    });

  }
};
