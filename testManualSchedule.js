const pool = require("./db");
const { calculateSchedule } = require("./src/utils/loanSchedule");

async function test() {
  try {
    const loanAccountNumber = "02540015040052136";

    // 🔍 Fetch loan from DB
    const result = await pool.query(`
      SELECT 
        la.answers,
        lap.approved_amount,
        lap.approved_tenor,
        lap.approved_interest_rate
      FROM loans l
      LEFT JOIN loan_answers la ON la.loan_id = l.id
      LEFT JOIN loan_approvals lap ON lap.loan_id = l.id
      WHERE l.core_loan_account_number = $1
      ORDER BY lap.approval_level DESC
      LIMIT 1
    `, [loanAccountNumber]);

    const row = result.rows[0];

    if (!row) {
      console.log("❌ Loan not found");
      return;
    }

    const answers =
      typeof row.answers === "string"
        ? JSON.parse(row.answers)
        : row.answers || {};

    // ✅ Extract real values
    const principal =
      row.approved_amount || answers.amount || 0;

    const tenure =
      row.approved_tenor || answers.tenure || 12;

    const rate =
      row.approved_interest_rate || answers.interest_rate || 24;

    console.log("📊 USING:");
    console.log({ principal, tenure, rate });

    // ✅ Calculate schedule
    const schedule = calculateSchedule({
      principal,
      annualRate: rate,
      tenureMonths: tenure
    });

    console.log("✅ REAL SCHEDULE:");
    console.log(schedule);

  } catch (err) {
    console.error("❌ ERROR:", err.message);
  }
}

test();
