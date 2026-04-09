const xlsx = require("xlsx");
const fs = require("fs");
const prisma = require("../../prisma/client");
const { sendProgress, getProgress } = require("../utils/payslipProgress");
const axios = require("axios");

console.log("🔥 Controller reached");

const safeProgress = (uploadId, payload) => {
  try {
    sendProgress(uploadId, payload);
  } catch (err) {
    console.warn("⚠️ Progress update failed:", err.message);
  }
};

const detectValue = (row, aliases) => {
  const normalize = (k) =>
    String(k).toLowerCase().replace(/[^a-z0-9]/g, "");

  const normalizedAliases = aliases.map(normalize);

  for (const key of Object.keys(row || {})) {
    const normKey = normalize(key);

    if (normalizedAliases.includes(normKey)) {
      return row[key];
    }
  }

  return null;
};

const normalizeKey = (k) =>
  String(k)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

const cleanString = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out || fallback;
};

const cleanAccountNumber = (value) => {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits || null;
};

const getEmployeeId = (row) => {
  const value =
    row.staff_id ||
    row.assignment_number ||
    row.legacy_id ||
    row.ippis_no ||
    row.ippis_number ||
    row.ippis ||
    null;

  if (value === null || value === undefined) return null;

  const normalized = String(value).trim().toUpperCase();
  return normalized || null;
};

const getBankName = (row) =>
  cleanString(detectValue(row, ["bank", "bank_name"]), "UNKNOWN");

const getOrganisation = (row) =>
  cleanString(
    detectValue(row, ["organisation", "organization", "ministry", "agency"]),
    "UNKNOWN"
  );

const getSalary = (row) =>
  Number(detectValue(row, ["salary", "gross_salary", "total_gross"]) || 0);

const getNetPay = (row) =>
  Number(
    detectValue(row, ["net_pay", "net_salary", "6net_pay", "netpay"]) || 0
  );

const getAccountNumber = (row) =>
  cleanAccountNumber(
    row.acc_no ||
      row.accountno ||
      row.account_number ||
      row.salary_account ||
      row.salaryaccount ||
      null
  );

/* =====================================================
   UPLOAD PAYSLIP
===================================================== */
exports.uploadPayslip = async (req, res) => {
  const { uploadId, uploadMonth } = req.body;
  let uploadLog = null;

  if (!uploadId) {
    return res.status(400).json({ message: "Missing uploadId" });
  }

  safeProgress(uploadId, {
    success: true,
    progress: 0,
    status: "starting",
    message: "Upload started"
  });

  try {
    if (!req.file) {
      safeProgress(uploadId, {
        success: false,
        progress: 0,
        status: "failed",
        message: "No file uploaded"
      });
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (!uploadMonth || !/^\d{4}-\d{2}$/.test(uploadMonth)) {
      safeProgress(uploadId, {
        success: false,
        progress: 0,
        status: "failed",
        message: "Invalid uploadMonth"
      });
      return res.status(400).json({ message: "Invalid uploadMonth" });
    }

    safeProgress(uploadId, {
      success: true,
      progress: 10,
      status: "reading_file",
      message: "Reading uploaded file"
    });

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (!rawRows.length) {
      safeProgress(uploadId, {
        success: false,
        progress: 0,
        status: "failed",
        message: "Empty file"
      });
      return res.status(400).json({ message: "Empty file" });
    }

    safeProgress(uploadId, {
      success: true,
      progress: 25,
      status: "processing_rows",
      message: "Processing payslip rows"
    });

    const rows = rawRows.map((r) => {
      const out = {};
      for (const key of Object.keys(r || {})) {
        out[normalizeKey(key)] = r[key];
      }
      return out;
    });

    const validRows = rows.filter((row) => getEmployeeId(row));

    if (!validRows.length) {
      safeProgress(uploadId, {
        success: false,
        progress: 0,
        status: "failed",
        message: "No valid employee identifier found"
      });
      return res
        .status(400)
        .json({ message: "No valid employee identifier found" });
    }

    uploadLog = await prisma.PayslipUpload.create({
  data: {
    upload_month: uploadMonth,
    uploaded_by: req.user?.email || "system",
    status: "SUCCESS",
    record_count: validRows.length
  }
});
    safeProgress(uploadId, {
      success: true,
      progress: 40,
      status: "saving_records",
      message: "Saving payslip records"
    });

    
    for (const row of validRows) {
  const employeeId = getEmployeeId(row);
  if (!employeeId) continue;

  await prisma.PayslipRecord.deleteMany({
    where: { ippis_number: employeeId }
  });

  await prisma.PayslipRecord.create({
    data: {
      ippis_number: employeeId,
      upload_id: uploadLog.id,
      upload_month: uploadMonth,
      data: {
        ...row,
        account_number:
          row.account_number ||
          row.acc_no ||
          row.accountno ||
          row.salary_account ||
          row.salaryaccount ||
          null,
        organisation:
          row.organisation ||
          row.organization ||
          row.ministry ||
          row.agency ||
          null
      }
    }
  });
}
    
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const employeeId = getEmployeeId(row);

      const percent = Math.min(
        90,
        50 + Math.floor(((i + 1) / validRows.length) * 40)
      );

      safeProgress(uploadId, {
        success: true,
        progress: percent,
        status: "saving_customers",
        message: `Processing row ${i + 1} of ${validRows.length}`
      });

      if (!employeeId) continue;

      const accountNumber = getAccountNumber(row);
      if (!accountNumber || accountNumber.length < 10) continue;

      const bankName = getBankName(row);
      const organisation = getOrganisation(row);
      const salary = getSalary(row);
      const netPay = getNetPay(row);

      await prisma.$executeRaw`
        INSERT INTO payslip_customers
          (ippis_number, account_number, bank_name, organisation, salary, net_pay, upload_month, raw_data)
        VALUES
          (${employeeId}, ${accountNumber}, ${bankName}, ${organisation}, ${salary}, ${netPay}, ${uploadMonth}, ${JSON.stringify(row)}::jsonb)
        ON CONFLICT (ippis_number, account_number)
        DO UPDATE SET
          bank_name = EXCLUDED.bank_name,
          organisation = EXCLUDED.organisation,
          salary = EXCLUDED.salary,
          net_pay = EXCLUDED.net_pay,
          upload_month = EXCLUDED.upload_month,
          raw_data = EXCLUDED.raw_data;
      `;
    }

    await prisma.PayslipUpload.update({
      where: { id: uploadLog.id },
      data: {
        status: "SUCCESS",
        record_count: validRows.length
      }
    });

    safeProgress(uploadId, {
      success: true,
      progress: 100,
      status: "completed",
      message: "Payslip upload completed"
    });

    return res.json({
      success: true,
      message: "Payslip uploaded successfully",
      uploadId,
      savedRows: validRows.length,
      uploadRecordId: uploadLog.id
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);

    if (uploadLog?.id) {
      await prisma.PayslipUpload.update({
        where: { id: uploadLog.id },
        data: { status: "FAILED" }
      }).catch(() => {});
    }

    safeProgress(uploadId, {
      success: false,
      progress: 0,
      status: "failed",
      message: err.message
    });

    return res.status(500).json({
      success: false,
      message: err.message
    });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
  }
};

/* =====================================================
   ANALYZE PAYROLL
===================================================== */
exports.analyzePayrollEligibility = async (req, res) => {
  const { accountNumber } = req.params;

  const customer = await prisma.payslipCustomer.findFirst({
    where: { account_number: String(accountNumber) },
    orderBy: { upload_month: "desc" }
  });

  if (!customer) return res.json({ success: false });

  const setting = await prisma.app_settings.findFirst({
    where: { setting_key: "minimum_netpay" }
  });

  const min = Number(setting?.setting_value || 0);

  return res.json({
    success: true,
    eligible: Number(customer.net_pay || 0) >= min
  });
};

/* =====================================================
   PUBLIC CHECK
===================================================== */
exports.publicPayrollEligibility = async (req, res) => {
  const customer = await prisma.payslipCustomer.findFirst({
    where: { account_number: String(req.params.accountNumber) },
    orderBy: { upload_month: "desc" }
  });

  return res.json({ success: !!customer });
};

/* =====================================================
   CHECK LOAN ELIGIBILITY
===================================================== */
exports.checkLoanEligibility = async (req, res) => {
  const { accountNumber } = req.body;

  const customer = await prisma.payslipCustomer.findFirst({
    where: { account_number: String(accountNumber) },
    orderBy: { upload_month: "desc" }
  });

  if (!customer) return res.json({ success: false });

  const setting = await prisma.app_settings.findFirst({
    where: { setting_key: "minimum_netpay" }
  });

  return res.json({
    success: true,
    eligible: Number(customer.net_pay || 0) >= Number(setting?.setting_value || 0)
  });
};

/* =====================================================
   VERIFY ACCOUNT
===================================================== */
exports.verifyLoanAccount = async (req, res) => {
  const { accountNumber, bankCode, productCode } = req.body;

  try {
    const bankRes = await axios.post(
      `${process.env.API_BASE_URL}/api/bank/verify-account`,
      { accountNumber, bankCode }
    );

    if (!bankRes.data.success) {
      return res.json({
        success: false,
        message: "Invalid account number or wrong bank selected"
      });
    }

    const systemSettings = await prisma.system_settings.findFirst();
    const loanSettings = systemSettings?.loan_settings || {};

    const productConfig =
      loanSettings.productApprovals?.[productCode] || {};
    const requirePayslipCheck =
      productConfig.requirePayslipCheck === true;

    let customer = null;

    if (requirePayslipCheck) {
      customer = await prisma.payslipCustomer.findFirst({
        where: { account_number: String(accountNumber) },
        orderBy: { upload_month: "desc" }
      });

      if (!customer) {
        return res.json({
          success: false,
          message: "Salary account not found in payroll"
        });
      }

      const setting = await prisma.app_settings.findFirst({
        where: { setting_key: "minimum_netpay" }
      });

      const minimumNetPay = Number(setting?.setting_value || 0);
      const netPay = Number(customer.net_pay || 0);

      if (netPay < minimumNetPay) {
        return res.json({
          success: false,
          message: "Salary does not meet minimum requirement"
        });
      }

      return res.json({
        success: true,
        eligible: true,
        accountName: bankRes.data.accountName,
        bankCode,
        netPay,
        minimumRequired: minimumNetPay
      });
    }

    return res.json({
      success: true,
      eligible: true,
      accountName: bankRes.data.accountName,
      bankCode
    });
  } catch (err) {
    console.error("Verification error:", err);

    return res.status(500).json({
      success: false,
      message: "Verification failed"
    });
  }
};

/* =====================================================
   ADMIN FETCH
===================================================== */
exports.getAdminPayslipCustomer = async (req, res) => {
  try {
    const accountNumber = String(req.params.accountNumber);

    console.log("Fetching payslip for:", accountNumber);
    console.time("payslip-query");

    const data = await prisma.payslipCustomer.findMany({
      where: { account_number: accountNumber },
      orderBy: { upload_month: "desc" },
      take: 12
    });

    console.timeEnd("payslip-query");

    if (!data || data.length === 0) {
      return res.json({
        success: false,
        message: "No payroll data found",
        customer: null,
        history: []
      });
    }

return res.json({
  success: true,
  customer: {
    ...data[0],
      organization:
      data[0].organisation ||
      data[0].raw_data?.organisation ||
      data[0].raw_data?.organization ||
      data[0].raw_data?.ministry ||
      "N/A",

    organisation: data[0].organisation,
    ministry: data[0].raw_data?.ministry || null
  },
  history: data.map((item) => ({
    ...item,
    organization:
      item.organisation ||
      item.organization ||
      item.raw_data?.organisation ||
      item.raw_data?.organization ||
      item.raw_data?.ministry ||
      "N/A"
  }))
});    

  } catch (err) {
    console.error("Payslip fetch error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch payslip"
    });
  }
};

/* =====================================================
   GET UPLOAD PROGRESS
===================================================== */
exports.getUploadProgress = (req, res) => {
  const { uploadId } = req.params;

  try {
    const progress = getProgress(uploadId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        message: "No progress found"
      });
    }

    return res.json(progress);
  } catch (err) {
    console.error("Progress error:", err);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
