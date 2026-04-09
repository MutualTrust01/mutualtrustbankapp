const express = require("express");
const router = express.Router();
const pool = require("../db");
const { sendStyledMail } = require("../mailer");

const auth = require("../middleware/auth");

const { getProducts } = require("../src/controllers/productController");


const logAudit = require("../src/utils/auditLogger"); 
// adjust path if yours is src/utils/auditLogger.js

const fetchCoreProducts = async () => {
  // fake req/res to reuse controller
  let data = null;

  const req = {};
  const res = {
    json: (payload) => {
      if (payload?.success && Array.isArray(payload.data)) {
        data = payload.data;
      }
    },
  };

  await getProducts(req, res);
  return data || [];
};


const resolveRoleNames = async (roleIds = []) => {
  if (!roleIds.length) return [];

  const res = await pool.query(
    `SELECT id, name FROM roles WHERE id = ANY($1::int[])`,
    [roleIds]
  );

  const map = {};
  res.rows.forEach(r => {
    map[r.id] = r.name;
  });

  return roleIds.map(id => map[id] || "Unknown Role");
};

const resolveUserNames = async (userIds = []) => {
  if (!userIds.length) return [];

  const res = await pool.query(
    `SELECT id, first_name, last_name FROM users WHERE id = ANY($1::int[])`,
    [userIds]
  );

  const map = {};
  res.rows.forEach(u => {
    map[u.id] = `${u.first_name} ${u.last_name}`.trim();
  });

  return userIds.map(id => map[id] || "Unknown User");
};



// 🔧 NORMALIZE ARRAY-LIKE SETTINGS (handles old string data)
const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim());
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map(v => String(v).trim())
      .filter(Boolean);
  }

  return [];
};

// 🔐 NORMALIZE SESSION CONFIG (prevents false change detection)
const normalizeSession = (s = {}) => ({
  admin_idle_timeout_minutes: Number(s.admin_idle_timeout_minutes ?? 15),
  mobile_idle_timeout_minutes: Number(s.mobile_idle_timeout_minutes ?? 10),
  internet_idle_timeout_minutes: Number(s.internet_idle_timeout_minutes ?? 10),
  absolute_timeout_minutes: Number(s.absolute_timeout_minutes ?? 480),
});

/* 🔒 STABLE JSON STRINGIFY (ORDER-INDEPENDENT) */
const stableStringify = (obj = {}) =>
  JSON.stringify(
    Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = obj[key];
        return acc;
      }, {})
  );

/* ================= SAVE SETTINGS ================= */
router.post("/save", auth, async (req, res) => {
  try {
    const { settings } = req.body;

    settings.approval = settings.approval || {};

    // 🔒 PARTIAL SAVE SAFETY — ENSURE ALL ROOT SECTIONS EXIST
settings.limit = settings.limit || {};
settings.security = settings.security || {};
settings.notifications = settings.notifications || {};
settings.systemAccess = settings.systemAccess || {};
settings.session = settings.session || {};
settings.contact = settings.contact || {};
settings.onboarding = settings.onboarding || {};

settings.privacy = settings.privacy || {};

settings.hrm = settings.hrm || {};


const existingLoanRow = await pool.query(
  "SELECT loan_settings FROM system_settings LIMIT 1"
);

const existingLoanSettings =
  existingLoanRow.rows[0]?.loan_settings || {};

  // 🔥 DEEP MERGE PRODUCT APPROVALS (FIX)
const mergedProductApprovals = {
  ...(existingLoanSettings.productApprovals || {}),
};

if (settings.loan?.productApprovals) {
  for (const code of Object.keys(settings.loan.productApprovals)) {

    const existingCfg =
      existingLoanSettings.productApprovals?.[code] || {};

    const incomingCfg =
      settings.loan.productApprovals?.[code] || {};

    mergedProductApprovals[code] = {
  ...existingCfg,
  ...incomingCfg,

  // 🔥 FORCE SAFE SAVE
  accountOpeningProductCode:
    incomingCfg.accountOpeningProductCode !== undefined
      ? incomingCfg.accountOpeningProductCode
      : existingCfg.accountOpeningProductCode ?? null,

  useAmountThreshold:
    incomingCfg.useAmountThreshold !== undefined
      ? incomingCfg.useAmountThreshold
      : existingCfg.useAmountThreshold ?? false,

  flowThresholds: Array.isArray(incomingCfg.flowThresholds)
    ? incomingCfg.flowThresholds.map(v => Number(v) || 0)
    : Array.isArray(existingCfg.flowThresholds)
    ? existingCfg.flowThresholds.map(v => Number(v) || 0)
    : [],
};
  }
}



const loanSettings = {
  bvnVerificationMode:
    settings.loan?.bvnVerificationMode ??
    existingLoanSettings.bvnVerificationMode ??
    "BASIC",

  defaultAccountOfficerId:
    settings.loan?.defaultAccountOfficerId ??
    existingLoanSettings.defaultAccountOfficerId ??
    null,

  allowedProducts: normalizeArray(
    settings.loan?.allowedProducts ??
    existingLoanSettings.allowedProducts ??
    []
  ),

  
productMeta: {
  ...(existingLoanSettings.productMeta || {}),
  ...(settings.loan?.productMeta || {})
},

 productApprovals: mergedProductApprovals, 
};


// 🔥 REMOVE PRODUCT APPROVALS NOT IN allowedProducts
loanSettings.productApprovals = Object.fromEntries(
  Object.entries(loanSettings.productApprovals).filter(
    ([code]) => loanSettings.allowedProducts.includes(code)
  )
);


// 🔒 REMOVE PRODUCT META NOT IN allowedProducts
loanSettings.productMeta = Object.fromEntries(
  Object.entries(loanSettings.productMeta).filter(
    ([code]) => loanSettings.allowedProducts.includes(code)
  )
);

/* 🔒 ENSURE ABBREVIATION EXISTS FOR ALL LOAN PRODUCTS */

for (const code of loanSettings.allowedProducts) {
  if (!loanSettings.productApprovals[code]) {
    loanSettings.productApprovals[code] = {};
  }

  const cfg = loanSettings.productApprovals[code];

  if (!Array.isArray(cfg.fields)) cfg.fields = [];
  if (!Array.isArray(cfg.requirements)) cfg.requirements = [];

  cfg.useAmountThreshold = cfg.useAmountThreshold ?? false;
  cfg.flowThresholds = Array.isArray(cfg.flowThresholds)
    ? cfg.flowThresholds.map(v => Number(v) || 0)
    : [];
}
console.log(
  "Merged loan product approvals:",
  Object.keys(loanSettings.productApprovals)
);


    /* ================= LOAN PRODUCT VALIDATION (SERVER-SIDE) ================= */
const isFieldsOnly =
  req.body.meta?.partial === "FIELDS_ONLY";

for (const code of loanSettings.allowedProducts) {
  const cfg = loanSettings.productApprovals?.[code];

  // ✅ ALWAYS ensure arrays
  if (!Array.isArray(cfg.fields)) cfg.fields = [];
  if (!Array.isArray(cfg.requirements)) cfg.requirements = [];

  // 🚨 ONLY validate ranges on FULL SAVE
  if (!isFieldsOnly) {
    const minAmount = Number(cfg.minAmount || 0);
    const maxAmount = Number(cfg.maxAmount || 0);

    if (minAmount <= 0 || maxAmount <= 0 || minAmount >= maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Invalid loan amount range for product ${code}`,
      });
    }
  }
}





    if (!settings) {
      return res.status(400).json({
        success: false,
        message: "Settings data missing",
      });
    }

const roleRes = await pool.query(
  `
  SELECT r.name
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE u.id = $1
  `,
  [req.user.id]
);


if (!roleRes.rows.length) {
  return res.status(403).json({
    success: false,
    message: "User has no role assigned",
  });
}

if (roleRes.rows[0].name !== "Super Admin") {
  return res.status(403).json({
    success: false,
    message: "Only Super Admin users can update system settings",
  });
}



// 🔐 SESSION CONFIG VALIDATION (ADD HERE)
// 🔐 NORMALIZE + VALIDATE SESSION CONFIG (FIXED)
const s = normalizeSession(settings.session);

if (
  s.admin_idle_timeout_minutes < 1 ||
  s.mobile_idle_timeout_minutes < 1 ||
  s.internet_idle_timeout_minutes < 1 ||
  s.absolute_timeout_minutes < 10
) {
  return res.status(400).json({
    success: false,
    message: "Invalid session configuration",
  });
}



   // 🔥 TEMP ACTOR (AUTH DISABLED)
// 🔐 SAFE ACTOR (WORKS WITH AUTH, NEVER CRASHES)
let actorName = "System";
let actorEmail = "system@local";

if (req.user?.id) {
  const actorRes = await pool.query(
    `SELECT first_name, last_name, email FROM users WHERE id=$1`,
    [req.user.id]
  );

  const actor = actorRes.rows[0];
  if (actor) {
    actorName = `${actor.first_name} ${actor.last_name}`.trim();
    actorEmail = actor.email;
  }
}



    /* ================= APPROVAL STRUCTURE ================= */
   let approvalSettings;

if (!isFieldsOnly) {
  approvalSettings = {
    limitUpdate: {
      count: settings.approval?.limitUpdate,
      flow: settings.approval?.limitUpdateFlow || [],
    },
    userCreation: {
      count: settings.approval?.userCreation,
      flow: settings.approval?.userCreationFlow || [],
    },
    rolesCreation: {
      count: settings.approval?.rolesCreation,
      flow: settings.approval?.rolesCreationFlow || [],
    },
  };
}




    const existing = await pool.query(
      "SELECT * FROM system_settings LIMIT 1"
    );
const existingOnboarding =
  existing.rows[0]?.onboarding_config || {};

const onboardingSettings = {
  ...existingOnboarding,
  ...settings.onboarding,
  productMeta:
    settings.onboarding?.productMeta ??
    existingOnboarding.productMeta ??
    {},
};


const existingFD =
  existing.rows[0]?.fixed_deposit_settings || {};

const mergedFDProductApprovals = {
  ...(existingFD.productApprovals || {}),
};

if (settings.fixedDeposit?.productApprovals) {
  for (const code of Object.keys(settings.fixedDeposit.productApprovals)) {
    const existingCfg =
      existingFD.productApprovals?.[code] || {};

    const incomingCfg =
      settings.fixedDeposit.productApprovals?.[code] || {};

    mergedFDProductApprovals[code] = {
      ...existingCfg,
      ...incomingCfg,

      minAmount:
        incomingCfg.minAmount !== undefined
          ? Number(incomingCfg.minAmount) || 0
          : Number(existingCfg.minAmount) || 0,

      maxAmount:
        incomingCfg.maxAmount !== undefined
          ? Number(incomingCfg.maxAmount) || 0
          : Number(existingCfg.maxAmount) || 0,

      approval: {
        ...(existingCfg.approval || {}),
        ...(incomingCfg.approval || {}),
        enabled:
          incomingCfg.approval?.enabled ??
          existingCfg.approval?.enabled ??
          false,
        approvers:
          Number(incomingCfg.approval?.approvers) ||
          Number(existingCfg.approval?.approvers) ||
          1,
        flow: Array.isArray(incomingCfg.approval?.flow)
          ? incomingCfg.approval.flow
          : Array.isArray(existingCfg.approval?.flow)
          ? existingCfg.approval.flow
          : [""],
        useAmountThreshold:
          incomingCfg.approval?.useAmountThreshold ??
          existingCfg.approval?.useAmountThreshold ??
          false,
        flowThresholds: Array.isArray(incomingCfg.approval?.flowThresholds)
          ? incomingCfg.approval.flowThresholds.map(v => Number(v) || 0)
          : Array.isArray(existingCfg.approval?.flowThresholds)
          ? existingCfg.approval.flowThresholds.map(v => Number(v) || 0)
          : [],
      },

      certificate: {
        ...(existingCfg.certificate || {}),
        ...(incomingCfg.certificate || {}),

        approval: {
          ...(existingCfg.certificate?.approval || {}),
          ...(incomingCfg.certificate?.approval || {}),
          enabled:
            incomingCfg.certificate?.approval?.enabled ??
            existingCfg.certificate?.approval?.enabled ??
            false,
          approvers:
            Number(incomingCfg.certificate?.approval?.approvers) ||
            Number(existingCfg.certificate?.approval?.approvers) ||
            1,
          flow: Array.isArray(incomingCfg.certificate?.approval?.flow)
            ? incomingCfg.certificate.approval.flow
            : Array.isArray(existingCfg.certificate?.approval?.flow)
            ? existingCfg.certificate.approval.flow
            : [""],
          useAmountThreshold:
            incomingCfg.certificate?.approval?.useAmountThreshold ??
            existingCfg.certificate?.approval?.useAmountThreshold ??
            false,
          flowThresholds: Array.isArray(
            incomingCfg.certificate?.approval?.flowThresholds
          )
            ? incomingCfg.certificate.approval.flowThresholds.map(v => Number(v) || 0)
            : Array.isArray(existingCfg.certificate?.approval?.flowThresholds)
            ? existingCfg.certificate.approval.flowThresholds.map(v => Number(v) || 0)
            : [],
        },

        signatories: {
          ...(existingCfg.certificate?.signatories || {}),
          ...(incomingCfg.certificate?.signatories || {}),
          enabled:
            incomingCfg.certificate?.signatories?.enabled ??
            existingCfg.certificate?.signatories?.enabled ??
            false,
          useAmountBands:
            incomingCfg.certificate?.signatories?.useAmountBands ??
            existingCfg.certificate?.signatories?.useAmountBands ??
            false,
          bands: Array.isArray(incomingCfg.certificate?.signatories?.bands)
            ? incomingCfg.certificate.signatories.bands.map((band) => ({
                minAmount: Number(band.minAmount) || 0,
                maxAmount: Number(band.maxAmount) || 0,
                signatoryIds: Array.isArray(band.signatoryIds)
                  ? band.signatoryIds
                  : [],
              }))
            : Array.isArray(existingCfg.certificate?.signatories?.bands)
            ? existingCfg.certificate.signatories.bands.map((band) => ({
                minAmount: Number(band.minAmount) || 0,
                maxAmount: Number(band.maxAmount) || 0,
                signatoryIds: Array.isArray(band.signatoryIds)
                  ? band.signatoryIds
                  : [],
              }))
            : [],
        },

        regeneration: {
          ...(existingCfg.certificate?.regeneration || {}),
          ...(incomingCfg.certificate?.regeneration || {}),
          enabled:
            incomingCfg.certificate?.regeneration?.enabled ??
            existingCfg.certificate?.regeneration?.enabled ??
            false,
          maxAttempts:
            Number(incomingCfg.certificate?.regeneration?.maxAttempts) ||
            Number(existingCfg.certificate?.regeneration?.maxAttempts) ||
            1,
          otpConfirmers: Array.isArray(
            incomingCfg.certificate?.regeneration?.otpConfirmers
          )
            ? incomingCfg.certificate.regeneration.otpConfirmers
            : Array.isArray(existingCfg.certificate?.regeneration?.otpConfirmers)
            ? existingCfg.certificate.regeneration.otpConfirmers
            : [],
        },
      },
    };
  }
}

const fixedDepositSettings = {
  ...existingFD,
  ...settings.fixedDeposit,
  productCodes: normalizeArray(
    settings.fixedDeposit?.productCodes ??
      existingFD.productCodes ??
      []
  ),
  productMeta:
    settings.fixedDeposit?.productMeta ??
    existingFD.productMeta ??
    {},
  productApprovals: mergedFDProductApprovals,
};

fixedDepositSettings.productApprovals = Object.fromEntries(
  Object.entries(fixedDepositSettings.productApprovals || {}).filter(
    ([code]) => fixedDepositSettings.productCodes.includes(code)
  )
);

fixedDepositSettings.productMeta = Object.fromEntries(
  Object.entries(fixedDepositSettings.productMeta || {}).filter(
    ([code]) => fixedDepositSettings.productCodes.includes(code)
  )
);
const existingHRM =
  existing.rows[0]?.hrm_settings || {};

const hrmSettings = {
  ...existingHRM,
  ...settings.hrm,
  staffAccountCreation: {
    ...(existingHRM.staffAccountCreation || {}),
    ...(settings.hrm?.staffAccountCreation || {}),
  },
};

    const finalApprovalSettings = isFieldsOnly
  ? existing.rows[0].approval_settings
  : approvalSettings;

    // 🔥 FETCH PRODUCTS FROM CORE (SAME SOURCE AS UI)
const coreProducts = await fetchCoreProducts();

const productMap = {};
coreProducts.forEach(p => {
  productMap[String(p.ProductCode)] = p.ProductName;
});

    let changes = [];
    let safeChanges = [];


    /* ================= TRACK CHANGES ================= */
    if (existing.rows[0]) {

      const old = existing.rows[0];


      // 🔒 PRESERVE EXISTING VALUES ON PARTIAL SAVE
const safeLimit = isFieldsOnly
  ? {
      defaultSingleLimit: old.default_single_limit,
      defaultDailyLimit: old.default_daily_limit,
    }
  : settings.limit;

const safeSecurity = isFieldsOnly
  ? {
      customerTwoFactorAuth: old.customer_2fa_enabled,
      adminTwoFactorAuth: old.admin_2fa_enabled,
      passwordPolicy: old.password_policy,
      adminPasswordExpiryDays: old.admin_password_expiry_days,
      customerPasswordExpiryDays: old.customer_password_expiry_days,
    }
  : settings.security;

const safeNotifications = isFieldsOnly
  ? {
      emailNotifications: old.email_notifications,
      pushNotifications: old.push_notifications,
    }
  : settings.notifications;


      /* ================= APPROVAL FLOW CHANGES (ROLE NAMES) ================= */
const oldApproval = old.approval_settings || {};

/* ================= ONBOARDING CHANGES ================= */
const oldOnboarding = old.onboarding_config || {};
const newOnboarding = onboardingSettings || {};

if (oldOnboarding.officerCode !== newOnboarding.officerCode) {
  changes.push(
    `Onboarding account officer changed: 
     ${oldOnboarding.officerCode || "None"} → ${newOnboarding.officerCode || "None"}`
  );
}


/* ================= LOAN SETTINGS CHANGES ================= */
const oldLoan = old.loan_settings || {};
const newLoan = loanSettings || {};

const diffArray = (oldArr = [], newArr = []) => {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);

  return {
    added: newArr.filter(v => !oldSet.has(v)),
    removed: oldArr.filter(v => !newSet.has(v)),
  };
};


/* ================= LOAN PRODUCT FIELDS / REQUIREMENTS ================= */
if (
  JSON.stringify(oldLoan.productApprovals || {}) !==
  JSON.stringify(newLoan.productApprovals || {})
) {
const oldApprovals = oldLoan.productApprovals || {};
const newApprovals = newLoan.productApprovals || {};

for (const productCode of Object.keys(newApprovals)) {
  const oldCfg = oldApprovals[productCode] || {};
  const newCfg = newApprovals[productCode] || {};

  /* ===== REQUIREMENTS ===== */
  const reqDiff = diffArray(
    oldCfg.requirements || [],
    newCfg.requirements || []
  );

  if (reqDiff.added.length || reqDiff.removed.length) {
    changes.push({
      label: `Loan Requirements (${productCode})`,
      before: reqDiff.removed.length
        ? `Removed: ${reqDiff.removed.join(", ")}`
        : "No removals",
      after: reqDiff.added.length
        ? `Added: ${reqDiff.added.join(", ")}`
        : "No additions",
    });
  }

  /* ===== APPLICATION FIELDS ===== */
const oldFields = (oldCfg.fields || []).map(f => f.id);
const newFields = (newCfg.fields || []).map(f => f.id);


  const fieldDiff = diffArray(oldFields, newFields);

  if (fieldDiff.added.length || fieldDiff.removed.length) {
    changes.push({
      label: `Application Fields (${productCode})`,
      before: fieldDiff.removed.length
        ? `Removed: ${fieldDiff.removed.join(", ")}`
        : "No removals",
      after: fieldDiff.added.length
        ? `Added: ${fieldDiff.added.join(", ")}`
        : "No additions",
    });
  }
}

}


if (oldLoan.bvnVerificationMode !== newLoan.bvnVerificationMode) {
  changes.push({
    label: "BVN Verification Mode",
    before: oldLoan.bvnVerificationMode || "BASIC",
    after: newLoan.bvnVerificationMode || "BASIC",
  });
}

if (
  oldLoan.defaultAccountOfficerId !==
  newLoan.defaultAccountOfficerId
) {
  const idsToResolve = [
    oldLoan.defaultAccountOfficerId,
    newLoan.defaultAccountOfficerId,
  ].filter(Boolean);

  const resolved = idsToResolve.length
    ? await resolveUserNames(idsToResolve)
    : [];

  const nameMap = {};
  idsToResolve.forEach((id, index) => {
    nameMap[id] = resolved[index] || "Unknown User";
  });

  changes.push({
    label: "Default Loan Relationship Manager",
    before: oldLoan.defaultAccountOfficerId
      ? nameMap[oldLoan.defaultAccountOfficerId]
      : "None",
    after: newLoan.defaultAccountOfficerId
      ? nameMap[newLoan.defaultAccountOfficerId]
      : "None",
  });
}


/* ================= LOAN ALLOWED PRODUCTS ================= */
const oldLoanAllowed = normalizeArray(old.loan_settings?.allowedProducts).sort();
const newLoanAllowed = loanSettings.allowedProducts.sort();

if (JSON.stringify(oldLoanAllowed) !== JSON.stringify(newLoanAllowed)) {
  const oldNames = oldLoanAllowed.map(
    c => productMap[c] || `Unknown (${c})`
  );

  const newNames = newLoanAllowed.map(
    c => productMap[c] || `Unknown (${c})`
  );

  changes.push({
    label: "Allowed Loan Products",
    before: oldNames.join(", ") || "None",
    after: newNames.join(", ") || "None",
  });
}


const oldAllowed = normalizeArray(oldOnboarding.allowedProducts).sort();
const newAllowed = normalizeArray(newOnboarding.allowedProducts).sort();

if (JSON.stringify(oldAllowed) !== JSON.stringify(newAllowed)) {

  const oldAllowedNames = oldAllowed.map(
    c => productMap[c] || `Unknown (${c})`
  );

  const newAllowedNames = newAllowed.map(
    c => productMap[c] || `Unknown (${c})`
  );

  changes.push(
    `Onboarding allowed products updated 
     (${oldAllowedNames.join(", ") || "None"} → ${newAllowedNames.join(", ") || "None"})`
  );
}



/* ================= SYSTEM ACCESS CHANGES ================= */
const oldAccess = old.system_access || {};
const newAccess = settings.systemAccess || {};

if (JSON.stringify(oldAccess) !== JSON.stringify(newAccess)) {
  changes.push(
    `System access updated 
     (Mobile: ${oldAccess.mobileLoginEnabled} → ${newAccess.mobileLoginEnabled},
      Internet: ${oldAccess.internetBankingLoginEnabled} → ${newAccess.internetBankingLoginEnabled})`
  );
}



if (JSON.stringify(old.contact_details || {}) !== JSON.stringify(settings.contact || {})) {
  changes.push({
  label: "Contact Details",
  before: "Previous contact information",
  after: "Updated contact information",
});
}

if (
  stableStringify(old.privacy_settings) !==
  stableStringify(settings.privacy)
) {  changes.push({
    label: "Privacy & Policy URLs",
    before: JSON.stringify(old.privacy_settings || {}, null, 2)
      .replace(/\n/g, "<br>")
      .replace(/ /g, "&nbsp;"),
    after: JSON.stringify(settings.privacy || {}, null, 2)
      .replace(/\n/g, "<br>")
      .replace(/ /g, "&nbsp;"),
  });
}



// LIMIT UPDATE FLOW
/* ================= LIMIT UPDATE FLOW ================= */
if (!isFieldsOnly) {
  const oldLimitFlow =
    oldApproval.limitUpdate?.flow ?? [];

  const newLimitFlow =
    settings.approval?.limitUpdateFlow ?? [];

  if (
    JSON.stringify(oldLimitFlow) !==
    JSON.stringify(newLimitFlow)
  ) {
    const oldRoles = await resolveRoleNames(oldLimitFlow);
    const newRoles = await resolveRoleNames(newLimitFlow);

    changes.push(
      `Limit approval flow changed from <b>${oldRoles.join(" → ") || "None"}</b>
       to <b>${newRoles.join(" → ") || "None"}</b>`
    );
  }
}

/* ================= FIXED DEPOSIT APPROVAL CHANGES ================= */
const oldFD = old.fixed_deposit_settings || {};
const newFD = fixedDepositSettings;

/* ================= FD PRODUCT CODES ================= */
/* ================= FD PRODUCT CODES ================= */
const oldFDProducts = normalizeArray(oldFD.productCodes).sort();
const newFDProducts = normalizeArray(newFD.productCodes).sort();

if (JSON.stringify(oldFDProducts) !== JSON.stringify(newFDProducts)) {

  const oldFDNames = oldFDProducts.map(
    c => productMap[c] || `Unknown (${c})`
  );

  const newFDNames = newFDProducts.map(
    c => productMap[c] || `Unknown (${c})`
  );

 changes.push({
  label: "Fixed Deposit Products",
  before: oldFDNames.join(", ") || "None",
  after: newFDNames.join(", ") || "None",
});

}





/* ================= DEFAULT LIMITS ================= */
if (old.default_single_limit !== settings.limit.defaultSingleLimit) {
  changes.push({
    label: "Default Single Limit",
    before: old.default_single_limit,
    after: settings.limit.defaultSingleLimit,
  });
}

if (old.default_daily_limit !== settings.limit.defaultDailyLimit) {
  changes.push({
    label: "Default Daily Limit",
    before: old.default_daily_limit,
    after: settings.limit.defaultDailyLimit,
  });
}

/* ================= PASSWORD POLICY ================= */
if (old.password_policy !== settings.security.passwordPolicy) {
  changes.push({
    label: "Password Policy",
    before: old.password_policy,
    after: settings.security.passwordPolicy,
  });
}

/* ================= NOTIFICATIONS ================= */
if (old.email_notifications !== settings.notifications.emailNotifications) {
  changes.push({
    label: "Email Notifications",
    before: old.email_notifications ? "Enabled" : "Disabled",
    after: settings.notifications.emailNotifications ? "Enabled" : "Disabled",
  });
}

if (old.push_notifications !== settings.notifications.pushNotifications) {
  changes.push({
    label: "Push Notifications",
    before: old.push_notifications ? "Enabled" : "Disabled",
    after: settings.notifications.pushNotifications ? "Enabled" : "Disabled",
  });
}


      /* 🔥 TIER LIMIT CHANGES */
      if (
        JSON.stringify(old.tier_limits || {}) !==
        JSON.stringify(settings.tierLimits || {})
      ) {
        changes.push({
  label: "Tier-based Transaction Limits",
  before: "Previous tier limits",
  after: "Updated tier limits",
});
      }


      /* ================= SESSION TIMEOUT CHANGES ================= */
/* ================= SESSION TIMEOUT CHANGES (NORMALIZED) ================= */
const oldSession = normalizeSession(old.session_config);
const newSession = normalizeSession(settings.session);

const sessionDiffs = [];

const sessionFields = [
  ["Admin", "admin_idle_timeout_minutes"],
  ["Mobile", "mobile_idle_timeout_minutes"],
  ["Internet", "internet_idle_timeout_minutes"],
  ["Absolute", "absolute_timeout_minutes"],
];

sessionFields.forEach(([label, key]) => {
  if (oldSession[key] !== newSession[key]) {
    sessionDiffs.push({
      label,
      before: `${oldSession[key]} mins`,
      after: `${newSession[key]} mins`,
    });
  }
});

if (sessionDiffs.length) {
  changes.push({
    label: "Session Timeout",
    before: sessionDiffs.map(d => `${d.label}: ${d.before}`).join("<br>"),
    after: sessionDiffs.map(d => `${d.label}: ${d.after}`).join("<br>"),
  });
}



      // 🚫 STOP if nothing changed



  // ✅ FILTER ONLY TABLE-SAFE CHANGES (DEFINE ONCE)
safeChanges = changes.filter(
  c =>
    typeof c === "object" &&
    c.label &&
    c.before !== undefined &&
    c.after !== undefined
);


      /* ================= UPDATE ================= */

      console.log("🔥 SAVING LOAN SETTINGS:");
console.log(JSON.stringify(loanSettings, null, 2));
      await pool.query(
        `
      UPDATE system_settings SET
  default_single_limit=$1,
  default_daily_limit=$2,
  customer_2fa_enabled=$3,
  admin_2fa_enabled=$4,
  password_policy=$5,
  email_notifications=$6,
  push_notifications=$7,
  approval_settings=$8::jsonb,
  contact_details=$9::jsonb,
  onboarding_config=$10::jsonb,
  privacy_settings=$11::jsonb,
  session_config=$12::jsonb,
  admin_password_expiry_days=$13,
  customer_password_expiry_days=$14,
  tier_limits=$15::jsonb,
  fixed_deposit_settings=$16::jsonb,
  system_access=$17::jsonb,
loan_settings=$18::jsonb,
hrm_settings=$19::jsonb,
session_version = COALESCE(session_version, 0) + 1,
updated_at=NOW()
WHERE id=$20

      `,
      [
  safeLimit.defaultSingleLimit,
  safeLimit.defaultDailyLimit,
  safeSecurity.customerTwoFactorAuth,
  safeSecurity.adminTwoFactorAuth,
  safeSecurity.passwordPolicy,
  safeNotifications.emailNotifications,
  safeNotifications.pushNotifications,
  finalApprovalSettings,
  settings.contact,
  onboardingSettings,
  settings.privacy,
  normalizeSession(settings.session),
  safeSecurity.adminPasswordExpiryDays,
  safeSecurity.customerPasswordExpiryDays,
  settings.tierLimits,
  fixedDepositSettings,
  settings.systemAccess,
loanSettings,
hrmSettings,
old.id,
]

      );
    } else {
      /* ================= CREATE FIRST CONFIG ================= */
      await pool.query(
        `
   INSERT INTO system_settings(
  default_single_limit,
  default_daily_limit,
  customer_2fa_enabled,
  admin_2fa_enabled,
  password_policy,
  email_notifications,
  push_notifications,
  approval_settings,
  contact_details,
  onboarding_config,
  privacy_settings,
  session_config,
  admin_password_expiry_days,
  customer_password_expiry_days,
  tier_limits,
  fixed_deposit_settings,
 system_access,
loan_settings,
hrm_settings
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
)



      `,
 [
  settings.limit.defaultSingleLimit,
  settings.limit.defaultDailyLimit,
  settings.security.customerTwoFactorAuth,
  settings.security.adminTwoFactorAuth,
  settings.security.passwordPolicy,
  settings.notifications.emailNotifications,
  settings.notifications.pushNotifications,
  finalApprovalSettings,
  settings.contact,
  onboardingSettings,
  settings.privacy,
  normalizeSession(settings.session),
  settings.security.adminPasswordExpiryDays,
  settings.security.customerPasswordExpiryDays,
  settings.tierLimits,
  fixedDepositSettings,
  settings.systemAccess,
  loanSettings,
  hrmSettings,
]

      );

      changes.push("Initial System Settings Created");
    }

   /* ================= EMAIL LOGGED-IN USERS ================= */

const notify = await pool.query(`
  SELECT DISTINCT email
  FROM users
  WHERE
    login_status = 'Active'
    AND status = 'Approved'
    AND can_access_admin = true
    AND email IS NOT NULL
`);


    if (notify.rows.length > 0) {    

    const list =
  safeChanges.length > 0
    ? `
<table style="width:100%; border-collapse: collapse; font-size:14px;">
  <thead>
    <tr style="background:#f3f4f6;">
      <th style="border:1px solid #ddd; padding:8px; text-align:left;">Setting</th>
      <th style="border:1px solid #ddd; padding:8px; text-align:left;">Before</th>
      <th style="border:1px solid #ddd; padding:8px; text-align:left;">After</th>
    </tr>
  </thead>
  <tbody>
   ${safeChanges
  .map((c) => `
      <tr>
        <td style="border:1px solid #ddd; padding:8px;"><b>${c.label}</b></td>
        <td style="border:1px solid #ddd; padding:8px;">${c.before}</td>
        <td style="border:1px solid #ddd; padding:8px;">${c.after}</td>
      </tr>
    `
      )
      .join("")}
  </tbody>
</table>
`
    : `<p>No visible change detected</p>`;


     try {
  await sendStyledMail({
    to: notify.rows.map((u) => u.email).join(","),
    subject: "⚠ System Settings Updated",
    title: "System Settings Change Alert",
    body: `
      <p><b>Updated by:</b><br>${actorName}<br>${actorEmail}</p>
      <h4>Changes:</h4>${list}
      <p><b>Date:</b> ${new Date().toLocaleString()}</p>
    `,
  });
} catch (mailErr) {
  console.error("⚠ Settings email failed:", mailErr.message);
}

    }
const auditSummary = safeChanges
  .map(c => `${c.label}: ${c.before} → ${c.after}`)
  .join(" | ");

await logAudit(
  req,
  req.user.id,
  "SYSTEM_SETTINGS_UPDATE",
  "SUCCESS",
  auditSummary || "System settings updated",
  null,
  "system_settings"
);
const noChanges = !changes.length;

// 🔔 SEND REAL-TIME NOTIFICATION TO ADMINS
const io = req.app.get("io");

if (io && safeChanges.length > 0) {
  
io.emit("new_notification", {
  id: Date.now(),
  title: "System Settings Updated",
  message: `Settings updated by ${actorName}`,
  type: "system",
  created_at: new Date(),
  is_read: false
});
}

return res.json({
  success: true,
  message: noChanges
    ? "Settings saved (no tracked changes detected)"
    : "Settings Updated",
  changes,
});

 } catch (err) {

   // ✅ AUDIT FAILED ATTEMPT (NON-BLOCKING)
  try {
    await logAudit(
      req,
      req.user?.id || null,
      "SYSTEM_SETTINGS_UPDATE",
      "FAILED",
      err.message,
      null,
      "system_settings"
    );
  } catch (auditErr) {
    console.error("⚠ Audit logging failed:", auditErr.message);
  }
    // 👇 PUT IT HERE (ONLY HERE)
    console.error("❌ Save settings error message:", err.message);
    console.error("❌ PG ERROR CODE:", err.code);
console.error("❌ PG DETAIL:", err.detail);
console.error("❌ PG WHERE:", err.where);

    console.error("❌ Save settings error stack:", err.stack);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/fixed-deposit-products", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM system_settings LIMIT 1");

    if (!r.rows.length) {
      return res.json({ success: true, data: [] });
    }

    const row = r.rows[0];
    const fdSettings = row.fixed_deposit_settings || {};

    const productCodes = Array.isArray(fdSettings.productCodes)
      ? fdSettings.productCodes
      : [];

    const productMeta = fdSettings.productMeta || {};

    const data = productCodes.map((code) => ({
      code: String(code),
      name:
        productMeta?.[code]?.name ||
        productMeta?.[code]?.label ||
        productMeta?.[code]?.productName ||
        `Product ${code}`,
    }));

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error("❌ Fetch fixed deposit products error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch fixed deposit products",
    });
  }
});


/* ================= LOAD SETTINGS ================= */
router.get("/", auth, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM system_settings LIMIT 1");

    if (!r.rows.length) {
      return res.json({ success: true, settings: null });
    }

    const row = r.rows[0];
    const approval = row.approval_settings || {};

    return res.json({
      success: true,
      settings: {
        limit: {
          defaultSingleLimit: row.default_single_limit,
          defaultDailyLimit: row.default_daily_limit,
        },

        tierLimits: row.tier_limits || {
          TIER_1: {
            label: "Tier 1",
            maxSingleLimit: 50000,
            maxDailyLimit: 300000,
          },
          TIER_2: {
            label: "Tier 2",
            maxSingleLimit: 200000,
            maxDailyLimit: 1000000,
          },
          TIER_3: {
            label: "Tier 3",
            maxSingleLimit: 1000000,
            maxDailyLimit: 5000000,
          },
        },

        approval: {
          limitUpdate: approval.limitUpdate?.count ?? 1,
          limitUpdateFlow: approval.limitUpdate?.flow ?? [],
          userCreation: approval.userCreation?.count ?? 1,
          userCreationFlow: approval.userCreation?.flow ?? [],
          rolesCreation: approval.rolesCreation?.count ?? 1,
          rolesCreationFlow: approval.rolesCreation?.flow ?? [],
        },

        systemAccess: row.system_access || {
          mobileLoginEnabled: true,
          internetBankingLoginEnabled: true,
        },

        security: {
          customerTwoFactorAuth: row.customer_2fa_enabled,
          adminTwoFactorAuth: row.admin_2fa_enabled,
          passwordPolicy: row.password_policy,
          adminPasswordExpiryDays: row.admin_password_expiry_days || 90,
          customerPasswordExpiryDays:
            row.customer_password_expiry_days || 180,
        },

        notifications: {
          emailNotifications: row.email_notifications,
          pushNotifications: row.push_notifications,
        },

        contact: row.contact_details,
        onboarding: row.onboarding_config,
        privacy: row.privacy_settings,

        session: row.session_config || {
          admin_idle_timeout_minutes: 15,
          mobile_idle_timeout_minutes: 10,
          internet_idle_timeout_minutes: 10,
          absolute_timeout_minutes: 480,
        },

     fixedDeposit: {
  ...(row.fixed_deposit_settings || {}),
  productCodes:
    row.fixed_deposit_settings?.productCodes ?? [],
  productMeta:
    row.fixed_deposit_settings?.productMeta ?? {},
},


        /* ✅ THIS IS THE FIX */
loan: {
  bvnVerificationMode:
    row.loan_settings?.bvnVerificationMode || "BASIC",

  defaultAccountOfficerId:
    row.loan_settings?.defaultAccountOfficerId ?? null,

  allowedProducts:
    row.loan_settings?.allowedProducts || [],

  productMeta:
    row.loan_settings?.productMeta || {},

  productApprovals:
    row.loan_settings?.productApprovals || {},
},

hrm: row.hrm_settings || {
  staffAccountCreation: {
    enabled: false,
    productCode: null,
    accountOfficerCode: null,
  },
},

      },
    });
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
