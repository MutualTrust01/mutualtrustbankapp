const pool = require("../../db");

/* ===============================
   Generate Complaint Reference
================================ */
const generateComplaintRef = () => {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `MTMFB-COM-${rand}`;
};

/* ===============================
   CUSTOMER – LOG COMPLAINT
================================ */
exports.createComplaint = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      customer_id,
      name,
      email,
      phone,
      category,
      subject,
      description,
      preferred_contact
    } = req.body;

    if (!category || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing"
      });
    }

    /* ✅ CATEGORY VALIDATION */
    const allowedCategories = [
      "Account Issue",
      "Card Issue",
      "Transaction Dispute",
      "Fraud",
      "Others"
    ];

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid complaint category"
      });
    }

    const referenceId = generateComplaintRef();

    await client.query("BEGIN");

    // 1️⃣ Insert complaint
    const complaintRes = await client.query(
      `INSERT INTO complaints
       (reference_id, customer_id, name, email, phone,
        category, subject, description, preferred_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        referenceId,
        customer_id,
        name,
        email,
        phone,
        category,
        subject,
        description,
        preferred_contact
      ]
    );

    const complaintId = complaintRes.rows[0].id;

    // 2️⃣ History: CREATED
    await client.query(
      `INSERT INTO complaint_history
       (complaint_id, action, message, actor_role)
       VALUES ($1,'CREATED','Complaint logged by customer','customer')`,
      [complaintId]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      referenceId,
      message: "Complaint logged successfully"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("CREATE COMPLAINT ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

/* ===============================
   ADMIN – GET ALL COMPLAINTS
================================ */
exports.getAllComplaints = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM complaints ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ===============================
   ADMIN – ASSIGN COMPLAINT
================================ */
exports.assignComplaint = async (req, res) => {
  const client = await pool.connect();

  try {
    const complaintId = req.params.id;
    const { admin, message } = req.body;
    const adminId = parseInt(admin, 10);

    await client.query("BEGIN");

    // 🔍 Fetch complaint
    const complaintRes = await client.query(
      `SELECT status FROM complaints WHERE id = $1`,
      [complaintId]
    );

    if (!complaintRes.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found"
      });
    }

    if (complaintRes.rows[0].status === "Resolved") {
      return res.status(403).json({
        success: false,
        message: "Resolved complaints must be reopened before assignment"
      });
    }

    if (req.user.id === adminId) {
      return res.status(403).json({
        success: false,
        message: "You cannot assign a complaint to yourself"
      });
    }

    const userCheck = await client.query(
      `SELECT id FROM users
       WHERE id=$1 AND login_status='Active' AND status='Approved'`,
      [adminId]
    );

    if (!userCheck.rowCount) {
      return res.status(400).json({
        success: false,
        message: "Selected user is not active or approved"
      });
    }

    // ✅ Update complaint
    await client.query(
      `UPDATE complaints
       SET assigned_admin=$1,
           admin_message=$2,
           status='In Progress',
           updated_at=NOW()
       WHERE id=$3`,
      [adminId, message || null, complaintId]
    );

    // 🧾 History: ASSIGNED
    await client.query(
      `INSERT INTO complaint_history
       (complaint_id, action, message, actor_role, actor_id)
       VALUES ($1,'ASSIGNED',$2,'admin',$3)`,
      [complaintId, message || "Complaint assigned", req.user.id]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Complaint assigned successfully"
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ASSIGN COMPLAINT ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  } finally {
    client.release();
  }
};

/* ===============================
   ADMIN – RESOLVE COMPLAINT
================================ */
exports.resolveComplaint = async (req, res) => {
  const client = await pool.connect();

  try {
    const { adminMessage } = req.body;

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE complaints
       SET status='Resolved',
           admin_message=$1,
           updated_at=NOW()
       WHERE id=$2`,
      [adminMessage, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Complaint not found"
      });
    }

    // 🧾 History: RESOLVED
    await client.query(
      `INSERT INTO complaint_history
       (complaint_id, action, message, actor_role, actor_id)
       VALUES ($1,'RESOLVED',$2,'admin',$3)`,
      [req.params.id, adminMessage || "Complaint resolved", req.user.id]
    );

    await client.query("COMMIT");

    res.json({ success: true });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};

/* ===============================
   ADMIN – REOPEN COMPLAINT
================================ */
exports.reopenComplaint = async (req, res) => {
  const client = await pool.connect();

  try {
    const { message } = req.body;

    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE complaints
       SET status='In Progress',
           admin_message=$1,
           updated_at=NOW()
       WHERE id=$2 AND status='Resolved'`,
      [message || "Complaint reopened", req.params.id]
    );

    if (!result.rowCount) {
      return res.status(400).json({
        success: false,
        message: "Only resolved complaints can be reopened"
      });
    }

    // 🧾 History: REOPENED
    await client.query(
      `INSERT INTO complaint_history
       (complaint_id, action, message, actor_role, actor_id)
       VALUES ($1,'REOPENED',$2,'admin',$3)`,
      [req.params.id, message || "Complaint reopened", req.user.id]
    );

    await client.query("COMMIT");

    res.json({ success: true });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.release();
  }
};


/* ===============================
   GET COMPLAINT HISTORY
================================ */
exports.getComplaintHistory = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        ch.action,
        ch.message,
        ch.actor_role,
        ch.created_at,
        u.first_name,
        u.last_name
      FROM complaint_history ch
      LEFT JOIN users u ON u.id = ch.actor_id
      WHERE ch.complaint_id = $1
      ORDER BY ch.created_at ASC
      `,
      [req.params.id]
    );

    res.json({
      success: true,
      history: result.rows
    });

  } catch (err) {
    console.error("FETCH HISTORY ERROR:", err);
    res.status(500).json({ success: false });
  }
};
