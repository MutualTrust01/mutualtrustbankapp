const xlsx = require("xlsx");

/**
 * Expected headers (case-insensitive)
 */
const REQUIRED_HEADERS = [
  "employee_id",
  "first_name",
  "last_name",
  "middle_name",
  "email",
  "phone",
  "address",
  "date_of_birth",
  "grade_level",
  "designation",
  "branch",
  "department",
  "team",
];

/**
 * Normalize header names:
 * - lowercase
 * - trim
 * - replace spaces with underscores
 */
const normalizeHeader = (h = "") =>
  h
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

/**
 * Parse & validate staff upload file (CSV or XLSX)
 */
function staffUploadParser(filePath) {
  const workbook = xlsx.readFile(filePath, {
    cellDates: true,
    raw: false,
  });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows = xlsx.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  if (rows.length === 0) {
    return {
      validRows: [],
      errors: [
        {
          row: 1,
          email: "",
          reason: "File is empty",
        },
      ],
    };
  }

  // 🔍 Validate headers
  const fileHeaders = Object.keys(rows[0]).map(normalizeHeader);

  const missingHeaders = REQUIRED_HEADERS.filter(
    h => !fileHeaders.includes(h)
  );

  if (missingHeaders.length > 0) {
    return {
      validRows: [],
      errors: [
        {
          row: 1,
          email: "",
          reason: `Missing required columns: ${missingHeaders.join(", ")}`,
        },
      ],
    };
  }

  const validRows = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // header = row 1

    // Normalize row keys
    const data = {};
    Object.keys(row).forEach(key => {
      data[normalizeHeader(key)] =
        typeof row[key] === "string"
          ? row[key].trim()
          : row[key];
    });

    // 🔴 REQUIRED FIELD CHECKS
    if (!data.email) {
      errors.push({
        row: rowNumber,
        email: "",
        reason: "Email is required",
      });
      return;
    }

    if (!data.email.includes("@")) {
      errors.push({
        row: rowNumber,
        email: data.email,
        reason: "Invalid email format",
      });
      return;
    }

    if (!data.first_name || !data.last_name) {
      errors.push({
        row: rowNumber,
        email: data.email,
        reason: "First name and last name are required",
      });
      return;
    }

    if (!data.department) {
      errors.push({
        row: rowNumber,
        email: data.email,
        reason: "Department is required",
      });
      return;
    }

    // ✅ Normalize date (if provided)
    let dob = null;
    if (data.date_of_birth) {
      const parsed = new Date(data.date_of_birth);
      if (isNaN(parsed.getTime())) {
        errors.push({
          row: rowNumber,
          email: data.email,
          reason: "Invalid date_of_birth",
        });
        return;
      }
      dob = parsed;
    }

    // ✅ Push clean row
    validRows.push({
      employee_id: data.employee_id || null,
      first_name: data.first_name,
      last_name: data.last_name,
      middle_name: data.middle_name || null,
      email: data.email.toLowerCase(),
      phone: data.phone || null,
      address: data.address || null,
      date_of_birth: dob,
      grade_level: data.grade_level || null,
      designation: data.designation || null,
      branch: data.branch || null,
      department: data.department,
      team: data.team || null,
    });
  });

  return { validRows, errors };
}

module.exports = staffUploadParser;
