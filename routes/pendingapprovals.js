const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

const { sendStyledMail, sendUserCredentialMail } = require("../mailer");

// 🔁 Map approval_settings keys → approval_requests.request_type
const bcrypt = require("bcrypt");

/* ===========================
   FINAL APPROVAL HANDLERS
=========================== */
const FINAL_APPROVAL_HANDLERS = {
  rolesCreation: async (client, request) => {
    await client.query(
      `UPDATE roles SET status = 'Approved' WHERE id = $1`,
      [request.request_ref_id]
    );
  },

userCreation: async (client, request) => {
  // 1️⃣ Generate system password
  const tempPassword = Math.random().toString(36).slice(-8);
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  // 2️⃣ Update user and fetch details
  const result = await client.query(
    `UPDATE users 
     SET 
       status='Approved',
       password=$1,
       login_status='Active',
       must_change_password = true       -- 🔥 Force user to change password on first login
     WHERE id=$2
     RETURNING first_name,last_name,email,username`,
    [hashedPassword, request.request_ref_id]
  );

  const user = result.rows[0];
  if (!user) return;

  const fullName = `${user.first_name} ${user.last_name}`;

  // 3️⃣ Send credentials email
  await sendUserCredentialMail(
    user.email,
    user.username,
    tempPassword,
    fullName
  );

  console.log("📩 Credentials email sent to:", user.email);
},




  limitUpdate: async (client, request) => {
  const {
    accountId,
    newSingleLimit,
    newDailyLimit,
    tier
  } = request.data;

  if (!accountId || !newSingleLimit || !newDailyLimit) {
    throw new Error("Invalid limit update payload");
  }

  if (Number(newSingleLimit) > Number(newDailyLimit)) {
    throw new Error("Single transaction limit cannot exceed daily limit");
  }

  const accCheck = await client.query(
    `SELECT 1 FROM accounts WHERE account_id = $1`,
    [accountId]
  );

  if (!accCheck.rowCount) {
    throw new Error("Account not found");
  }

  const tierRes = await client.query(
    `SELECT tier_limits FROM system_settings LIMIT 1`
  );

  const tierLimits = tierRes.rows[0]?.tier_limits?.[tier];

  if (!tierLimits) {
    throw new Error("Invalid customer tier");
  }

  if (Number(newSingleLimit) > Number(tierLimits.maxSingleLimit)) {
    throw new Error("Single transaction limit exceeds tier maximum");
  }

  if (Number(newDailyLimit) > Number(tierLimits.maxDailyLimit)) {
    throw new Error("Daily transaction limit exceeds tier maximum");
  }

  await client.query(
    `
    UPDATE accounts
    SET
      single_limit = $1,
      daily_limit  = $2,
      updated_at   = NOW()
    WHERE account_id = $3
    `,
    [newSingleLimit, newDailyLimit, accountId]
  );

  console.log(
    `✅ Limits updated for account ${accountId} (validated by ${tier})`
  );
},  // ✅ REQUIRED COMMA HERE




  userEdit: async (client, request) => {
  await client.query(
    `UPDATE users
     SET first_name = COALESCE($1, first_name),
         last_name = COALESCE($2, last_name),
         email = COALESCE($3, email),
         phone_number = COALESCE($4, phone_number),
         department = COALESCE($5, department),
         role_id = COALESCE($6, role_id),
         can_approve = COALESCE($7, can_approve)
     WHERE id = $8`,
    [
      request.data.first_name,
      request.data.last_name,
      request.data.email,
      request.data.phone_number,
      request.data.department,
      request.data.role_id,
      request.data.can_approve,
      request.request_ref_id
    ]
  );
}

};

// GET USERS BY ROLE (ACTIVE)
// ===========================
const getUsersByRoleId = async (roleId) => {
  const res = await pool.query(
    `
    SELECT email, first_name
    FROM users
    WHERE role_id = $1
      AND status = 'Active'
    `,
    [roleId]
  );
  return res.rows;
};

const REQUEST_TYPE_MAP = {
  rolesCreation: "rolesCreation",
  userCreation: "userCreation",
  limitUpdate: "limitUpdate",
};

/* ===========================
   GET ALL PENDING APPROVALS
=========================== */
router.get("/", auth, async (req, res) => {
  try {
    const userRole = req.user.role;

    /* 1️⃣ Load approval flow from system_settings */
    const settingsRes = await pool.query(`
      SELECT approval_settings
      FROM system_settings
      LIMIT 1
    `);

    const approvalSettings = settingsRes.rows[0]?.approval_settings || {};


   /* 2️⃣ Load approval requests (all statuses visible) */
const approvalsRes = await pool.query(`
  SELECT
    ar.id,
    ar.request_type,
    ar.status,
    ar.required_approvals,
    ar.approved_count AS current_approvals,
    ar.request_ref_id,
     ar.data, 
    ar.created_at,

    ar.initiated_by AS initiator_id,

    u.first_name || ' ' || u.last_name AS initiator,
    u.department AS initiator_department,

    -- Role creation data
    r.name        AS role_name,
    r.permissions AS role_permissions,

    -- User creation data
    cu.first_name || ' ' || cu.last_name AS created_user_name,
    cu.email      AS created_user_email,

    -- Return/Reject Details ======================
    (SELECT comment FROM approval_logs 
        WHERE request_id = ar.id AND action='Rejected' 
        ORDER BY id DESC LIMIT 1) AS rejection_reason,

    (SELECT created_at FROM approval_logs 
        WHERE request_id = ar.id AND action='Rejected' 
        ORDER BY id DESC LIMIT 1) AS rejected_at,

    (SELECT comment FROM approval_logs 
        WHERE request_id = ar.id AND action='Returned'
        ORDER BY id DESC LIMIT 1) AS return_reason,

    (SELECT created_at FROM approval_logs 
        WHERE request_id = ar.id AND action='Returned' 
        ORDER BY id DESC LIMIT 1) AS returned_at

  FROM approval_requests ar

  -- who initiated the request
  JOIN users u ON u.id = ar.initiated_by

  -- Role creation join
  LEFT JOIN roles r
    ON r.id = ar.request_ref_id AND ar.request_type = 'rolesCreation'

  -- User creation join
  LEFT JOIN users cu
    ON cu.id = ar.request_ref_id AND ar.request_type = 'userCreation'

  -- Sorting (Pending first → then Returned → Rejected → Approved)
  ORDER BY 
    CASE 
      WHEN ar.status = 'Pending' THEN 1
      WHEN ar.status = 'Returned' THEN 2
      WHEN ar.status = 'Rejected' THEN 3
      WHEN ar.status = 'Approved' THEN 4
      ELSE 5
    END,
    ar.created_at DESC
`);




    /* 3️⃣ Build roleId → roleName map */
    const roleRes = await pool.query(`SELECT id, name FROM roles`);
    const roleMap = {};
    roleRes.rows.forEach(r => {
      roleMap[r.id] = r.name;
    });

    /* 4️⃣ Attach canApprove flag */
   const approvals = approvalsRes.rows
  .map(ar => {
    const stage = ar.current_approvals || 0;
    const settingsKey = ar.request_type;
    const flow = approvalSettings?.[settingsKey]?.flow || [];

    const approvalFlow = flow.map(
  roleId => roleMap[roleId]
).filter(Boolean);


    // 🔹 Role-based VISIBILITY
    const isInFlow = flow
      .map(Number)
      .includes(Number(req.user.role_id));

    if (!isInFlow) return null; // 👈 HIDE FROM OTHER ROLES

    // 🔹 Stage-based ACTION permission
    const expectedRoleId = flow[stage];
    const expectedRoleName = roleMap[expectedRoleId] || null;

    const canApprove =
  req.user.can_approve === true &&
  Number(expectedRoleId) === Number(req.user.role_id);

    return {
  id: ar.id,
  request_type: ar.request_type,
  status: ar.status,
  required_approvals: ar.required_approvals,
  current_approvals: ar.current_approvals,
  created_at: ar.created_at,
  initiator: ar.initiator,
  initiator_id: ar.initiator_id,
  initiator_department: ar.initiator_department, 
  expected_role: expectedRoleName,
  approvalFlow,
  canApprove,

  // 🔽 PUT IT HERE
  requestData: (() => {
    const common = {
        rejectionReason: ar.rejection_reason,
        rejectedAt: ar.rejected_at,
        returnReason: ar.return_reason,
        returnedAt: ar.returned_at,
    };

    if (ar.request_type === "rolesCreation") {
        return {
            roleName: ar.role_name,
            permissions: ar.role_permissions || [],
            ...common
        };
    }

    if (ar.request_type === "userCreation") {
        return {
            userName: ar.created_user_name,
            email: ar.created_user_email,
            ...common
        };
    }

   if (ar.request_type === "limitUpdate") {
  return {
    accountId: ar.data?.accountId,
    tier: ar.data?.tier,

    oldSingleLimit: ar.data?.oldSingleLimit,
    oldDailyLimit: ar.data?.oldDailyLimit,

    newSingleLimit: ar.data?.newSingleLimit,
    newDailyLimit: ar.data?.newDailyLimit,

    validationBasis: `Customer Tier (${ar.data?.tier?.replace("_", " ")})`,

    ...common
  };
}


    if (ar.request_type === "userEdit") {
  return {
      userId: ar.request_ref_id,
      ...ar.data,     // returned to frontend
      ...common
  };
}


    return { ...common };
})(),

};

  })
  .filter(Boolean);


    res.json({ success: true, approvals });
  } catch (err) {
    console.error("❌ FETCH PENDING APPROVALS ERROR:", err);
    res.status(500).json({ success: false });
  }
});


/* ===========================
   CREATE APPROVAL REQUEST
=========================== */
router.post("/", auth, async (req, res) => {
  try {
    const { requestType, requestData } = req.body;

    if (!requestType || !requestData) {
      return res.status(400).json({
        success: false,
        message: "Invalid approval request payload"
      });
    }

    // 🔒 PREVENT DUPLICATE LIMIT UPDATE REQUESTS
    if (requestType === "limitUpdate") {
      const accountId = requestData.accountId;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          message: "Account ID is required for limit update"
        });
      }

      const existing = await pool.query(
        `
        SELECT 1
        FROM approval_requests
        WHERE request_type = 'limitUpdate'
          AND status = 'Pending'
          AND data->>'accountId' = $1
        `,
        [accountId]
      );

      if (existing.rowCount > 0) {
        return res.status(409).json({
          success: false,
          message:
            "A pending limit update already exists for this account. Please wait for approval."
        });
      }
    }

    // 🔁 Load approval flow
    const settingsRes = await pool.query(
      `SELECT approval_settings FROM system_settings LIMIT 1`
    );

    const approvalSettings = settingsRes.rows[0]?.approval_settings || {};
    const flow = approvalSettings?.[requestType]?.flow || [];

    if (!flow.length) {
      return res.status(400).json({
        success: false,
        message: "Approval flow not configured for this request type"
      });
    }

    // ✅ Insert approval request
    await pool.query(
  `
  INSERT INTO approval_requests
    (
      request_type,
      request_ref_id,
      data,
      initiated_by,
      status,
      required_approvals,
      approved_count
    )
  VALUES
    ($1, $2, $3, $4, 'Pending', $5, 0)
  `,
  [
    requestType,
    requestType === "limitUpdate"
      ? requestData.accountId     // 🔥 VERY IMPORTANT
      : null,

    JSON.stringify(requestData),  // 🔥 REQUIRED

    req.user.id,
    flow.length
  ]
);


    return res.json({
      success: true,
      message: "Approval request submitted successfully"
    });

  } catch (err) {
    console.error("❌ CREATE APPROVAL ERROR:", err);
    return res.status(500).json({ success: false });
  }
});



/* ===========================
   APPROVE REQUEST
=========================== */
router.post("/:id/approve", auth, async (req, res) => {
  const approvalId = req.params.id;
  const userId = req.user.id;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1️⃣ Load approval request
    const reqRes = await client.query(
      `SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE`,
      [approvalId]
    );

    if (!reqRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    const request = reqRes.rows[0];

    // 2️⃣ Prevent self-approval
    if (request.initiated_by === userId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Self approval not allowed" });
    }

    // 3️⃣ Must be pending
    if (request.status !== "Pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Request not pending" });
    }

    // 4️⃣ 🔐 MUST explicitly be allowed to approve
    if (req.user.can_approve !== true) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "You are not permitted to approve requests",
      });
    }

    // 5️⃣ Load approval flow
    const settingsRes = await client.query(
      `SELECT approval_settings FROM system_settings LIMIT 1`
    );

    const approvalSettings = settingsRes.rows[0]?.approval_settings || {};
    const stage = request.approved_count || 0;
    const flow = approvalSettings?.[request.request_type]?.flow || [];
    const expectedRoleId = flow[stage];

    // 6️⃣ Must be correct role for this stage
    if (Number(expectedRoleId) !== Number(req.user.role_id)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Not allowed at this stage" });
    }

    // 7️⃣ Resolve role name
    const roleRes = await client.query(
      `SELECT name FROM roles WHERE id = $1`,
      [expectedRoleId]
    );

    const expectedRole = roleRes.rows[0]?.name || "Unknown";

    // 8️⃣ Log approval step
    await client.query(
      `
      INSERT INTO approval_steps
        (approval_request_id, role, approved_by, status, approved_at)
      VALUES ($1, $2, $3, 'Approved', NOW())
      `,
      [approvalId, expectedRole, userId]
    );

    // 9️⃣ Audit log
    await client.query(
      `
      INSERT INTO approval_logs
        (request_id, approver_id, action)
      VALUES ($1, $2, 'Approved')
      `,
      [approvalId, userId]
    );

    // 🔟 Update request status
    const newCount = stage + 1;
    const newStatus =
      newCount >= request.required_approvals ? "Approved" : "Pending";

    await client.query(
      `
      UPDATE approval_requests
      SET approved_count = $1, status = $2
      WHERE id = $3
      `,
      [newCount, newStatus, approvalId]
    );

    

// ✅ FINAL APPROVAL → UPDATE ACTUAL ENTITY
// ✅ FINAL APPROVAL → EXECUTE BUSINESS LOGIC
if (newStatus === "Approved") {
  const handler = FINAL_APPROVAL_HANDLERS[request.request_type];

  if (handler) {
    await handler(client, request);
  }
}


    await client.query("COMMIT");

    res.json({ success: true, status: newStatus });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ APPROVE ERROR:", err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
});



router.post("/:id/return", auth, async (req, res) => {
  const approvalId = req.params.id;
  const userId = req.user.id;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: "Return reason is required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const reqRes = await client.query(
      `SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE`,
      [approvalId]
    );

    if (!reqRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false });
    }

    const request = reqRes.rows[0];

    // ❌ Prevent self action
    if (request.initiated_by === userId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Self action not allowed" });
    }

    // ❌ Must be pending
    if (request.status !== "Pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Request not pending" });
    }

    // 🔐 MUST explicitly be allowed to approve
    if (req.user.can_approve !== true) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "You are not permitted to return requests",
      });
    }

    // ✅ LOG RETURN
    await client.query(
      `
      INSERT INTO approval_logs
        (request_id, approver_id, action, comment)
      VALUES ($1, $2, 'Returned', $3)
      `,
      [approvalId, userId, reason]
    );

    // 📧 Notify initiator
    const initiatorRes = await client.query(
      `SELECT email, first_name FROM users WHERE id = $1`,
      [request.initiated_by]
    );

    const initiator = initiatorRes.rows[0];

    if (initiator) {
      await sendStyledMail({
        to: initiator.email,
        subject: "Request Returned",
        title: "Request Returned for Correction",
        body: `
          <p>Dear ${initiator.first_name},</p>
          <p>Your <strong>${request.request_type}</strong> request has been <strong>returned</strong>.</p>
          <p><strong>Reason:</strong><br/>${reason}</p>
          <p>Please log in to correct and resubmit.</p>
        `,
      });
    }

    // ✅ UPDATE REQUEST
    // ✅ UPDATE REQUEST ON RETURN (replace your current update block with this)
await client.query(
  `
  UPDATE approval_requests
  SET
    status = 'Returned',
    can_resubmit = TRUE,
    approved_count = 0
  WHERE id = $1
  `,
  [approvalId]
);



    await client.query("COMMIT");

    res.json({ success: true, status: "Returned" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ RETURN ERROR:", err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
});



router.get("/:id/history", auth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        al.action,
        COALESCE(al.comment, '') AS comment,        -- avoid null issues
        al.created_at,
        u.first_name || ' ' || u.last_name AS actor -- who performed the action
      FROM approval_logs al
      JOIN users u ON u.id = al.approver_id
      WHERE al.request_id = $1
      ORDER BY al.created_at DESC
    `, [id]);

    return res.json({
      success: true,
      history: result.rows  // MUST be array
    });

  } catch (err) {
    console.error("❌ HISTORY ERROR:", err);
    return res.json({ success:false, history: [] });
  }
});


/* ===========================
   RESUBMIT RETURNED REQUEST
=========================== */
router.post("/:id/resubmit", auth, async (req, res) => {
  const approvalId = req.params.id;
  const userId = req.user.id;
  const { updatedData } = req.body; // contains edited fields

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const reqRes = await client.query(
      `SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE`,
      [approvalId]
    );

    if (!reqRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success:false, message:"Request not found" });
    }

    const request = reqRes.rows[0];

    // Only initiator can resubmit
    if (request.initiated_by !== userId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Only initiator can resubmit" });
    }

    // Must be returned
    if (request.status !== "Returned") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Only returned requests can be resubmitted" });
    }

    // Save edited data if exists
    // rolesCreation => update role table
    if (request.request_type === "rolesCreation" && updatedData) {
      await client.query(
        `UPDATE roles 
         SET name = $1, permissions = $2 
         WHERE id = $3`,
        [updatedData.roleName, updatedData.permissions, request.request_ref_id]
      );
    }

    // userCreation => update user table (editable fields)
    if (request.request_type === "userCreation" && updatedData) {
      await client.query(
        `UPDATE users 
         SET first_name = $1, email = $2 
         WHERE id = $3`,
        [updatedData.userName, updatedData.email, request.request_ref_id]
      );
    }

    // Reset approval workflow
    await client.query(
      `UPDATE approval_requests
       SET status='Pending',
           approved_count = 0,
           can_resubmit = FALSE
       WHERE id = $1`,
      [approvalId]
    );

    // Add log
    await client.query(
      `INSERT INTO approval_logs (request_id, approver_id, action, comment)
       VALUES($1,$2,'Resubmitted','Request updated and resubmitted')`,
      [approvalId, userId]
    );

    await client.query("COMMIT");
    return res.json({ success:true, message:"Resubmitted successfully" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ RESUBMIT ERROR:", err);
    return res.status(500).json({ success:false });
  } finally {
    client.release();
  }
});



/* ===========================
   REJECT REQUEST
=========================== */
router.post("/:id/reject", auth, async (req, res) => {
  const approvalId = req.params.id;
  const userId = req.user.id;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ message: "Rejection reason is required" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const reqRes = await client.query(
      `SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE`,
      [approvalId]
    );

    if (!reqRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false });
    }

    const request = reqRes.rows[0];

    // ❌ Prevent self action
    if (request.initiated_by === userId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Self action not allowed" });
    }

    // ❌ Must be pending
    if (request.status !== "Pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Request not pending" });
    }

    // 🔐 MUST explicitly be allowed to approve
    if (req.user.can_approve !== true) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "You are not permitted to reject requests",
      });
    }

    // ✅ LOG REJECTION
    await client.query(
      `
      INSERT INTO approval_logs
        (request_id, approver_id, action, comment)
      VALUES ($1, $2, 'Rejected', $3)
      `,
      [approvalId, userId, reason]
    );

    // 📧 Notify initiator
    const initiatorRes = await client.query(
      `SELECT email, first_name FROM users WHERE id = $1`,
      [request.initiated_by]
    );

    const initiator = initiatorRes.rows[0];

    if (initiator) {
      await sendStyledMail({
        to: initiator.email,
        subject: "Request Rejected",
        title: "Request Rejected",
        body: `
          <p>Dear ${initiator.first_name},</p>
          <p>Your <strong>${request.request_type}</strong> request has been <strong>rejected</strong>.</p>
          <p><strong>Reason:</strong><br/>${reason}</p>
        `,
      });
    }

    // ✅ UPDATE REQUEST
    await client.query(
  `
  UPDATE approval_requests
  SET
    status = 'Rejected',
    can_resubmit = FALSE
  WHERE id = $1
  `,
  [approvalId]
);

    await client.query("COMMIT");

    res.json({ success: true, status: "Rejected" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ REJECT ERROR:", err);
    res.status(500).json({ success: false });
  } finally {
    client.release();
  }
});


module.exports = router;
