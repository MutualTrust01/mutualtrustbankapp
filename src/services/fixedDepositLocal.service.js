const db = require("../../db");



/* ===============================
   CREATE LOCAL FD RECORD
================================ */
exports.createLocalFD = async ({
  trackingRef,
  fdAccountNumber,
  customerId,
  productCode,
  amount,
  tenure,
  interestRate,
  liquidationAccount,
  shouldRollover,
  createdBy,
  sendCertificate,
  certificateStatus,
  approvalLevelRequired,
  currentApprovalStep,
}) => {
  const [result] = await db.query(
    `INSERT INTO fixed_deposits (
      tracking_ref,
      fd_account_number,
      customer_id,
      product_code,
      amount,
      tenure,
      interest_rate,
      liquidation_account,
      should_rollover,
      certificate_status,
      send_certificate,
      approval_level_required,
      current_approval_step,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trackingRef,
      fdAccountNumber,
      customerId,
      productCode,
      amount,
      tenure,
      interestRate,
      liquidationAccount,
      shouldRollover ? 1 : 0,
      certificateStatus,
      sendCertificate ? 1 : 0,
      approvalLevelRequired,
      currentApprovalStep,
      createdBy,
    ]
  );

  return result.insertId;
};

/* ===============================
   CREATE APPROVAL FLOW
================================ */
exports.createApprovalFlow = async (fixedDepositId, approvers = []) => {
  if (!Array.isArray(approvers) || approvers.length === 0) return;

  for (let i = 0; i < approvers.length; i++) {
    await db.query(
      `INSERT INTO fixed_deposit_approvals (
        fixed_deposit_id,
        approver_user_id,
        step_order,
        status
      ) VALUES (?, ?, ?, ?)`,
      [
        fixedDepositId,
        approvers[i],
        i + 1,
        "PENDING",
      ]
    );
  }
};
