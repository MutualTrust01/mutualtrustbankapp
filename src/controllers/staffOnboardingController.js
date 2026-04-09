const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../../db");
const { sendUserCredentialMail } = require("../../mailer");
const XLSX = require("xlsx");

/**
 * ================================
 * GET ALL STAFF
 * ================================
 */
exports.getAllStaff = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.gender,
        u.email,
        u.phone_number,
        u.department,
        u.team,
        u.staff_role,
        u.date_of_birth,
        u.date_of_employment,
        u.grade,
        u.designation,
        u.branch,
        u.staff_status,
        u.status,
        u.rejection_reason,
        u.rejected_at,
        u.can_access_hrm_crm,
        u.can_access_admin,
        u.created_at,

        COALESCE(
          jsonb_object_agg(
            d.document_type,
            jsonb_build_object('url', d.file_url)
          ) FILTER (WHERE d.document_type IS NOT NULL),
          '{}'::jsonb
        ) AS documents

      FROM users u
      LEFT JOIN staff_documents d ON d.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch staff error:", err);
    res.status(500).json({ message: "Failed to fetch staff" });
  }
};

/**
 * ================================
 * CREATE STAFF
 * ================================
 */
exports.createStaff = async (req, res) => {

  const {
    first_name,
    last_name,
    email,
    phone,
    gender,
    department,
    team,
    staff_role,
    date_of_birth,
    date_of_employment,
    grade,
    designation,
    branch
  } = req.body;

  if (
    !first_name ||
    !last_name ||
    !email ||
    !phone ||
    !department ||
    !staff_role ||
    !grade ||
    !branch ||
    !date_of_employment
  ) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {

    const emailLower = email.toLowerCase();

    const exists = await pool.query(
      `SELECT id FROM users WHERE email=$1`,
      [emailLower]
    );

    if (exists.rows.length) {
      return res.status(409).json({
        message: "Staff with this email already exists"
      });
    }

const tempPassword = crypto.randomBytes(6).toString("base64");
const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const result = await pool.query(
      `
      INSERT INTO users (
        username,
        first_name,
        last_name,
        email,
        phone_number,
        gender,
        department,
        team,
        staff_role,
        date_of_birth,
        date_of_employment,
        grade,
        designation,
        branch,
        password,
        staff_status,
        status,
        can_access_hrm_crm,
        can_access_admin,
        must_change_password,
        registered_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
      $15,'PENDING_APPROVAL','INACTIVE',true,false,true,NOW()
      )
      RETURNING id
      `,
      [
        emailLower, // username
        first_name,
        last_name,
        emailLower,
        phone,
        gender,
        department,
        team || null,
        staff_role,
        date_of_birth || null,
        date_of_employment,
        grade,
        designation || null,
        branch,
hashedPassword
      ]
    );

    res.status(201).json({
      message: "Staff created and pending approval",
      staffId: result.rows[0].id
    });

  } catch (err) {
    console.error("Create staff error:", err);
    res.status(500).json({ message: "Failed to create staff" });
  }
};

/**
 * ================================
 * BULK STAFF UPLOAD
 * ================================
 */
exports.bulkUploadStaff = async (req, res) => {

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {

    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const errors = [];
    const inserted = [];

    const excelDateToJSDate = (excelDate) => {

      if (!excelDate) return null;

      if (typeof excelDate === "number") {
        const jsDate = new Date((excelDate - 25569) * 86400 * 1000);
        return jsDate.toISOString().split("T")[0];
      }

      return excelDate;
    };

    for (let i = 0; i < rows.length; i++) {

      const row = rows[i];

      const {
        id,
        first_name,
        last_name,
        email,
        phone,
        gender,
        department,
        team,
        grade_level,
        designation,
        branch,
        date_of_birth,
        date_of_employment
      } = row;

      if (!first_name || !last_name || !email) {

        errors.push({
          row: i + 2,
          email,
          reason: "Missing required fields"
        });

        continue;
      }

      try {

        const emailLower = email.toLowerCase();
        const username = emailLower;

        const dob = excelDateToJSDate(date_of_birth);
        const doe = excelDateToJSDate(date_of_employment);

        const exists = await pool.query(
          `SELECT id FROM users WHERE email=$1`,
          [emailLower]
        );

        if (exists.rows.length) {

          errors.push({
            row: i + 2,
            email,
            reason: "Email already exists"
          });

          continue;
        }


const tempPassword = crypto.randomBytes(6).toString("base64");
const hashedPassword = await bcrypt.hash(tempPassword, 12);

        const result = await pool.query(
          `
          INSERT INTO users (
            username,
            first_name,
            last_name,
            email,
            phone_number,
            gender,
            department,
            team,
            staff_role,
            date_of_birth,
            date_of_employment,
            grade,
            designation,
            branch,
            password,
            staff_status,
            status,
            must_change_password,
            registered_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,'Officer',$9,$10,$11,$12,$13,
            $14,'PENDING_APPROVAL','INACTIVE',true,NOW()
          )
          RETURNING id
          `,
          [
            username,
            first_name,
            last_name,
            emailLower,
            phone ? String(phone) : null,
            gender,
            department,
            team || null,
            dob,
            doe,
            grade_level,
            designation || null,
            branch,
hashedPassword
          ]
        );

        inserted.push(result.rows[0].id);

      } catch (err) {

        console.error("Bulk upload DB error:", err);

        errors.push({
          row: i + 2,
          email,
          reason: err.message
        });

      }

    }

    res.json({
      inserted: inserted.length,
      errors
    });

  } catch (err) {

    console.error("Bulk upload error:", err);

    res.status(500).json({
      message: "Bulk upload failed"
    });

  }

};

/**
 * ================================
 * APPROVE STAFF
 * ================================
 */
exports.approveStaff = async (req, res) => {

  const { ids } = req.body;

  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ message: "No staff IDs provided" });
  }

  try {

    const staff = await pool.query(
      `SELECT id,email,first_name,last_name FROM users WHERE id = ANY($1::int[])`,
      [ids]
    );

    await pool.query(
      `
      UPDATE users
      SET staff_status='ACTIVE',
          status='ACTIVE',
          core_account_officer_status='AWAITING_CREATION'
      WHERE id = ANY($1::int[])
      `,
      [ids]
    );

    for (const user of staff.rows) {

      const tempPassword = crypto.randomBytes(6).toString("base64");
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      await pool.query(
        `UPDATE users SET password=$1, must_change_password=true WHERE id=$2`,
        [hashedPassword, user.id]
      );

      try {

        const crmLink = `https://ibank.mutualtrustmfbank.com/apply/${user.id}`;

        await sendUserCredentialMail(
          user.email,
          user.email,
          tempPassword,
          `${user.first_name} ${user.last_name}`,
          crmLink
        );

      } catch (mailErr) {
        console.error("Email failed for:", user.email, mailErr);
      }

    }

    res.json({
      message: "Staff approved and credentials emailed"
    });

  } catch (err) {

    console.error("Approve staff error:", err);
    res.status(500).json({ message: "Approval failed" });

  }

};

/**
 * ================================
 * REJECT STAFF
 * ================================
 */
exports.rejectStaff = async (req, res) => {

  const { ids, reason } = req.body;

  if (!ids?.length || !reason) {
    return res.status(400).json({ message: "Missing data" });
  }

  await pool.query(
    `
    UPDATE users
    SET staff_status='REJECTED',
        rejection_reason=$2,
        rejected_at=NOW()
    WHERE id = ANY($1::int[])
    `,
    [ids, reason]
  );

  res.json({ message: "Staff rejected" });

};

/**
 * ================================
 * REOPEN STAFF
 * ================================
 */
exports.reopenStaff = async (req, res) => {

  const { ids } = req.body;

  await pool.query(
    `
    UPDATE users
    SET staff_status='PENDING_APPROVAL',
        rejection_reason=NULL,
        rejected_at=NULL
    WHERE id = ANY($1::int[])
    `,
    [ids]
  );

  res.json({ message: "Staff reopened" });

};

/**
 * ================================
 * ONBOARDING HISTORY
 * ================================
 */
exports.getOnboardingHistory = async (req, res) => {

  const { staffId } = req.params;

  const result = await pool.query(
    `
    SELECT *
    FROM staff_onboarding_actions
    WHERE user_id=$1
    ORDER BY action_at DESC
    `,
    [staffId]
  );

  res.json(result.rows);

};

/**
 * ================================
 * GRANT ADMIN ACCESS
 * ================================
 */
exports.grantAdminAccess = async (req, res) => {

  const { staffId } = req.params;

  await pool.query(
    `UPDATE users SET can_access_admin=true WHERE id=$1`,
    [staffId]
  );

  res.json({ message: "Admin access granted" });

};

/**
 * ================================
 * UPLOAD STAFF DOCUMENT
 * ================================
 */
exports.uploadStaffDocument = async (req, res) => {

  console.log("CONTENT-TYPE:", req.headers["content-type"]);
  console.log("BODY:", req.body);
  console.log("FILE:", req.file);

  const staff_id = parseInt(req.body.staffId);
  const document_type = req.body.type;

  if (!staff_id || !document_type) {
    return res.status(400).json({
      message: "Missing staffId or document type"
    });
  }

  if (!req.file) {
    return res.status(400).json({
      message: "No file received"
    });
  }

  const fileUrl =
    `${req.protocol}://${req.get("host")}/uploads/staff/staff_${staff_id}/${req.file.filename}`;

  await pool.query(
    `
    INSERT INTO staff_documents (user_id, document_type, file_url)
    VALUES ($1,$2,$3)
    ON CONFLICT (user_id, document_type)
    DO UPDATE SET file_url=EXCLUDED.file_url
    `,
    [staff_id, document_type, fileUrl]
  );

  res.json({
    message: "Document uploaded",
    url: fileUrl
  });

};
