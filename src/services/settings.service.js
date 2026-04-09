const db = require("../../db");


/* ===============================
   GET FIXED DEPOSIT SETTINGS
================================ */
exports.getFixedDepositSettings = async () => {
  const [rows] = await db.query(
    `SELECT settings_json FROM settings LIMIT 1`
  );

  if (!rows.length) return null;

  const settings = rows[0].settings_json || {};

  return settings.fixedDeposit || null;
};

/* ===============================
   GET CERTIFICATE APPROVAL RULE
================================ */
exports.getCertificateApprovalRule = async (amount) => {
  const fdSettings = await exports.getFixedDepositSettings();

  if (!fdSettings?.certificate?.approval?.slabs) return null;

  const slabs = fdSettings.certificate.approval.slabs;

  return slabs.find(s =>
    amount >= s.minAmount &&
    (s.maxAmount === null || amount <= s.maxAmount)
  );
};

/* ===============================
   GET REGENERATION SETTINGS
================================ */
exports.getCertificateRegenerationSettings = async () => {
  const fdSettings = await exports.getFixedDepositSettings();
  return fdSettings?.certificate?.regeneration || null;
};
