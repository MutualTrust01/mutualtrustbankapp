const express = require("express");
const router = express.Router();
const pool = require("../db");
const auth = require("../middleware/auth");

/* ===========================
   MASTER PERMISSIONS
=========================== */
const ALL_PERMISSIONS = [
  "users",
  "roles",
  "customers",
  "settings",
  "reports",
  "audit_report",
  "system_logs",
];

/* ======================================================
   🔐 COMMON CHECKS
====================================================== */
const ensureCanApprove = async (client, userId) => {
  const res = await client.query(
    `SELECT can_approve FROM users WHERE id = $1`,
    [userId]
  );

  if (!res.rows.length || !res.rows[0].can_approve) {
    throw new Error("NOT_ALLOWED_TO_APPROVE");
  }
};

const ensureNotInitiator = async (client, roleId, userId) => {
  const res = await client.query(
    `
    SELECT initiated_by
    FROM approval_requests
    WHERE request_ref_id = $1
      AND request_type = 'rolesCreation'
    `,
    [roleId]
  );

  if (!res.rows.length) throw new Error("REQUEST_NOT_FOUND");

  if (res.rows[0].initiated_by === userId) {
    throw new Error("SELF_APPROVAL_BLOCKED");
  }
};



/* ===========================
   CREATE ROLE (PENDING)
=========================== */
// ===========================
// CREATE ROLE (FIXED)
// ===========================
router.post("/", auth, async (req, res) => {
  let { name, permissions, description } = req.body;
  const isSuperAdmin = name.trim().toLowerCase() === "super admin";

  if (!name || !permissions || permissions.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Role name and permissions are required",
    });
  }

  if (isSuperAdmin) permissions = ALL_PERMISSIONS;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");


     // ✅ ADD THIS BLOCK HERE (EXACTLY HERE)
  const existingRole = await client.query(
    `SELECT 1 FROM roles WHERE LOWER(name) = LOWER($1)`,
    [name.trim()]
  );

  if (existingRole.rowCount > 0) {
    await client.query("ROLLBACK");
    return res.status(409).json({
      success: false,
      message: "Role name already exists",
    });
  }

    // 1️⃣ GET REQUIRED APPROVAL COUNT
    const settingsRes = await client.query(
      `SELECT approval_settings FROM system_settings LIMIT 1`
    );

    const requiredApprovals =
      settingsRes.rows[0]?.approval_settings?.rolesCreation?.count || 1;

    const status = isSuperAdmin ? "Approved" : "Pending";
    const approvedCount = isSuperAdmin ? requiredApprovals : 0;

    // 2️⃣ INSERT ROLE (THIS WAS MISSING ❌)
    const roleRes = await client.query(
      `
      INSERT INTO roles (
        name,
        permissions,
        description,
        status,
        required_approvals,
        approved_count,
        created_by,
        created_on
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      RETURNING id
      `,
      [
        name.trim(),
        permissions,
        description || null,
        status,
        requiredApprovals,
        approvedCount,
        req.user.id, // ✅ IMPORTANT
      ]
    );

    const roleId = roleRes.rows[0].id;

    // 3️⃣ CREATE APPROVAL REQUEST (NON SUPER ADMIN)
    if (!isSuperAdmin) {
     await client.query(
  `
  INSERT INTO approval_requests (
  request_type,
  request_ref_id,
  initiated_by,
  required_approvals,
  current_approvals,
  status,
  created_at
)
VALUES ('rolesCreation', $1, $2, $3, 0, 'Pending', NOW());

  `,
  [roleId, req.user.id, requiredApprovals]
);

    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: isSuperAdmin
        ? "Super Admin role created and approved"
        : "Role created and sent for approval",
    });
  } catch (err) {
  await client.query("ROLLBACK");

  // ✅ ADD THIS
  if (err.code === "23505") {
    return res.status(409).json({
      success: false,
      message: "Role name already exists",
    });
  }

  console.error(err);
  res.status(500).json({ success: false, message: "Server error" });
}
 finally {
    client.release();
  }
});






/* ===========================
   APPROVE ROLE
=========================== */
router.post("/:id/approve", auth, async (req, res) => {
  const client = await pool.connect();
  const roleId = req.params.id;
  const userId = req.user.id;

  try {
    await client.query("BEGIN");

    await ensureCanApprove(client, userId);
    await ensureNotInitiator(client, roleId, userId);

    const roleRes = await client.query(
      `SELECT * FROM roles WHERE id = $1`,
      [roleId]
    );

    if (!roleRes.rows.length || roleRes.rows[0].status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Role is not pending approval",
      });
    }

    const role = roleRes.rows[0];
    const newApprovedCount = role.approved_count + 1;
    const newStatus =
      newApprovedCount >= role.required_approvals ? "Approved" : "Pending";

    await client.query(
      `UPDATE roles SET approved_count = $1, status = $2 WHERE id = $3`,
      [newApprovedCount, newStatus, roleId]
    );

    await client.query(
  `
  UPDATE approval_requests
  SET current_approvals = $1,
      status = $2
  WHERE request_ref_id = $3
    AND request_type = 'rolesCreation'
  `,
  [newApprovedCount, newStatus, roleId]
);


    await client.query(
  `
  INSERT INTO role_approvals (role_id, approved_by, approved_at, action)
VALUES ($1, $2, NOW(), 'Approved')
  `,
  [roleId, userId]
);


    await client.query("COMMIT");
    res.json({ success: true, status: newStatus });
  } catch (err) {
    await client.query("ROLLBACK");

    if (err.message === "NOT_ALLOWED_TO_APPROVE") {
      return res.status(403).json({
        success: false,
        message: "Approval not permitted",
      });
    }

    if (err.message === "SELF_APPROVAL_BLOCKED") {
      return res.status(403).json({
        success: false,
        message: "You cannot approve a request you initiated",
      });
    }

    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});

/* ===========================
   REJECT ROLE
=========================== */
router.post("/:id/reject", auth, async (req, res) => {
  const client = await pool.connect();
  const { reason } = req.body;
  const roleId = req.params.id;
  const userId = req.user.id;

  try {
    await client.query("BEGIN");

    await ensureCanApprove(client, userId);
    await ensureNotInitiator(client, roleId, userId);

    // ❗ Update role status
    await client.query(
      `UPDATE roles SET status = 'Rejected' WHERE id = $1`,
      [roleId]
    );

    // ❗ Log rejection with action tag
    await client.query(
      `
      INSERT INTO role_approvals (role_id, approved_by, approved_at, reason, action)
      VALUES ($1, $2, NOW(), $3, 'Rejected')
      `,
      [roleId, userId, reason]
    );

    // ❗ Update approval request status
    await client.query(
      `
      UPDATE approval_requests
      SET status = 'Rejected'
      WHERE request_ref_id = $1 AND request_type = 'rolesCreation'
      `,
      [roleId]
    );

    await client.query("COMMIT");
    res.json({ success: true, message: "Role rejected" });

  } catch (err) {
    await client.query("ROLLBACK");

    if (err.message === "SELF_APPROVAL_BLOCKED") {
      return res.status(403).json({
        success: false,
        message: "You cannot reject a request you initiated",
      });
    }

    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});












/* ===========================
   RETURN ROLE
=========================== */
router.post("/:id/return", auth, async (req, res) => {
  const client = await pool.connect();
  const { reason } = req.body;
  const roleId = req.params.id;
  const userId = req.user.id;

  try {
    await client.query("BEGIN");

    await ensureCanApprove(client, userId);
    await ensureNotInitiator(client, roleId, userId);

    await client.query(
      `UPDATE roles SET status = 'Returned' WHERE id = $1`,
      [roleId]
    );

    await client.query(
      `UPDATE approval_requests
SET status = 'Returned'
WHERE request_ref_id = $1
  AND request_type = 'rolesCreation'
`,
      [roleId]
    );

   await client.query(
  `
  INSERT INTO role_approvals (role_id, approved_by, approved_at, reason, action)
VALUES ($1, $2, NOW(), $3, 'Returned')
  `,
  [roleId, userId, reason]
);


    await client.query("COMMIT");
    res.json({ success: true, message: "Role returned for correction" });
  } catch (err) {
    await client.query("ROLLBACK");

    if (err.message === "SELF_APPROVAL_BLOCKED") {
      return res.status(403).json({
        success: false,
        message: "You cannot return a request you initiated",
      });
    }

    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    client.release();
  }
});



/* ===========================
   RESUBMIT RETURNED ROLE
=========================== */
router.post("/:id/resubmit", auth, async (req, res) => {
  const client = await pool.connect();
  const roleId = req.params.id;
  const userId = req.user.id;

  try {
    await client.query("BEGIN");

    // Check that the user is the initiator
    const check = await client.query(`
      SELECT initiated_by, status 
      FROM approval_requests 
      WHERE request_ref_id = $1 AND request_type = 'rolesCreation'
    `, [roleId]);

    if (!check.rows.length)
      return res.status(404).json({ success:false, message:"Record not found" });

    if (check.rows[0].status !== "Returned")
      return res.status(400).json({ success:false, message:"Only returned request can be resubmitted" });

    if (check.rows[0].initiated_by !== userId)
      return res.status(403).json({ success:false, message:"Only initiator can resubmit" });

    // Reset approval for new approval cycle
    await client.query(`
      UPDATE approval_requests 
      SET status='Pending', current_approvals=0 
      WHERE request_ref_id=$1 AND request_type='rolesCreation'
    `, [roleId]);

    await client.query(`
      UPDATE roles 
      SET status='Pending', approved_count=0 
      WHERE id=$1
    `, [roleId]);

    await client.query("COMMIT");

    res.json({ success:true, message:"Resubmitted for approval" });

  } catch (err) {
    await client.query("ROLLBACK");
    console.log(err);
    res.status(500).json({ success:false, message:"Server error" });
  } finally {
    client.release();
  }
});



/* ===========================
   GET ROLES (ALL including Returned/Rejected)
=========================== */
router.get("/", auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.id,
        r.name,
        r.permissions,
        r.created_on,
        r.created_by,
        COALESCE(ar.status, r.status) AS status,     -- 🔥 Always use latest status
        ar.current_approvals,
        u.first_name || ' ' || u.last_name AS initiated_by,
        au.first_name || ' ' || au.last_name AS approved_by,
        ra.approved_at
      FROM roles r
      LEFT JOIN approval_requests ar 
            ON ar.request_ref_id = r.id 
           AND ar.request_type = 'rolesCreation'
      LEFT JOIN role_approvals ra ON ra.role_id = r.id
      LEFT JOIN users u ON u.id = r.created_by
      LEFT JOIN users au ON au.id = ra.approved_by
      ORDER BY 
        CASE 
          WHEN COALESCE(ar.status, r.status) = 'Pending' THEN 0 
          WHEN COALESCE(ar.status, r.status) = 'Returned' THEN 1
          WHEN COALESCE(ar.status, r.status) = 'Rejected' THEN 2
          WHEN COALESCE(ar.status, r.status) = 'Approved' THEN 3
          ELSE 4
        END,
        r.created_on DESC
    `);

    res.json({ success: true, roles: result.rows });

  } catch (err) {
    console.error("FETCH ROLES ERROR:", err);
    res.status(500).json({ success: false, message: "Failed to fetch roles" });
  }
});







/* ===========================
   GET APPROVED ROLES
=========================== */
router.get("/approved", async (req, res) => {
  const result = await pool.query(
    `SELECT id, name FROM roles WHERE status = 'Approved' ORDER BY name`
  );

  res.json({ success: true, roles: result.rows });
});

router.get("/me", auth, (req, res) => {
  res.json({ success: true, user: req.user });
});

/* ===========================
   GET ROLE APPROVAL HISTORY
=========================== */
router.get("/:id/history", auth, async (req, res) => {
  try {
    const roleId = req.params.id;

    const history = await pool.query(`
      SELECT 
          'Pending' AS action,
          ar.created_at,
          NULL AS comment,
          u.first_name || ' ' || u.last_name AS actor
      FROM approval_requests ar
      LEFT JOIN users u ON u.id = ar.initiated_by
      WHERE ar.request_ref_id = $1 AND ar.request_type='rolesCreation'

      UNION ALL

      SELECT
        COALESCE(ra.action,'Pending') AS action,
        ra.approved_at AS created_at,
        ra.reason AS comment,
        u2.first_name || ' ' || u2.last_name AS actor
      FROM role_approvals ra
      LEFT JOIN users u2 ON u2.id = ra.approved_by
      LEFT JOIN roles r ON r.id = ra.role_id
      WHERE ra.role_id = $1

      ORDER BY created_at DESC  -- 🔥 change applied
    `,[roleId]);

    res.json({success:true, history:history.rows});

  } catch (e) {
    res.status(500).json({success:false});
  }
});




router.get("/:id/next-approver", auth, async(req,res)=>{
  const roleId = req.params.id;

  try{
    const setting = await pool.query(`
      SELECT approval_settings->'rolesCreation' AS rc
      FROM system_settings LIMIT 1
    `);

    const flow = setting.rows[0].rc.flow;       // [4]
    const count = setting.rows[0].rc.count;     // number of approvals needed

    // Get role
    const role = await pool.query(`SELECT approved_count FROM roles WHERE id=$1`,[roleId]);
    const approvedCount = role.rows[0].approved_count;

    // Next role = flow position
    const nextRoleId = flow[approvedCount];     // flow index

    if(nextRoleId === undefined)
      return res.json({success:true, next:null});

    // Get role name/title
    const r = await pool.query(`SELECT name FROM roles WHERE id=$1`,[nextRoleId]);

    return res.json({
      success:true,
      next:r.rows[0]?.name || null
    });

  }catch(e){
    console.log(e)
    return res.status(500).json({success:false})
  }
});


/* ==============================================
   GET APPROVAL FLOW INCLUDING ROLE NAMES
============================================== */
router.get("/approval-flow", auth, async (req, res) => {
  try {
    // Fetch approval flow
    const result = await pool.query(
      `SELECT approval_settings FROM system_settings LIMIT 1`
    );

    const settings = result.rows[0]?.approval_settings?.rolesCreation;

    if (!settings)
      return res.json({ success:true, flow: [], message:"No flow set" });

    // Get role names using IDs in flow[]
    const flowIds = settings.flow; // [4,3,6]

    const roles = await pool.query(
      `SELECT id, name FROM roles WHERE id = ANY($1)`,
      [flowIds]
    );

    // Map roles in order of flow
    const orderedFlow = flowIds.map(id =>
      roles.rows.find(r => r.id === id)?.name || `ID:${id}`
    );

    res.json({
      success:true,
      flow: orderedFlow,
      count: settings.count
    });

  } catch (err) {
    console.error("FLOW ERROR:", err);
    res.status(500).json({ success:false, message:"Failed to load flow" });
  }
});


/* ===========================
   GET A ROLE + PERMISSIONS
=========================== */
router.get("/:id", async (req, res) => {
  try {
    const roleId = req.params.id;

    const result = await pool.query(
      `SELECT id, name, permissions FROM roles WHERE id = $1`,
      [roleId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success:false, message:"Role not found" });
    }

    let permissions = result.rows[0].permissions;

    // Ensure permissions outputs as array
    if (typeof permissions === "string") {
      permissions = permissions.split(",")
        .map(p => p.trim())
        .filter(p => p.length > 0);
    }

    res.json({
      success:true,
      role: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        permissions
      }
    });

  } catch (err) {
    console.log("GET ROLE ERROR:", err);
    res.status(500).json({ success:false, message:"Server error" });
  }
});

router.get("/:id/approval-chain", auth, async (req, res) => {
  try {
    const roleId = req.params.id;

    const role = await pool.query(`SELECT approved_count FROM roles WHERE id=$1`, [roleId]);
    if (!role.rows.length) return res.json({ success:false, message:"Role not found" });

    const approvedCount = role.rows[0].approved_count;

    const settings = await pool.query(`SELECT approval_settings FROM system_settings LIMIT 1`);
    const flowIds = settings.rows[0].approval_settings.rolesCreation.flow; // e.g [4,1]

    // 🔥 FIX HERE
    const orderedNames = [];
    for (let id of flowIds) {
      const result = await pool.query(`SELECT name FROM roles WHERE id=$1`, [id]);
      orderedNames.push(result.rows[0]?.name || `Unknown Role (#${id})`);
    }

    res.json({
      success:true,
      chain: orderedNames,
      remaining: orderedNames.slice(approvedCount),
      next: orderedNames[approvedCount] || null
    });

  } catch(err){
    console.log(err);
    res.status(500).json({success:false});
  }
});


module.exports = router;
