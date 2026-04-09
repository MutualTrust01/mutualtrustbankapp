const express = require("express");
const router = express.Router();

// RIGHT PATHS
const pool = require("../../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const logAudit = require("../utils/auditLogger"); 
const pictureUpload = require("../../middleware/picture_uploads");

const requirePermission = require("../../middleware/requirePermission");
const roleGuard = require("../../middleware/roleGuard");


// adjust path if needed


// RIGHT PATHS BASED ON YOUR STRUCTURE 🟢
const { sendOtpEmail, sendPasswordResetMail } = require("../../mailer");
const validatePassword = require("../utils/passwordPolicy");


// 🔐 SESSION AUTH MIDDLEWARE
const auth = (req, res, next) => {
  if (!req.session?.authenticated || !req.session.user) {
    return res.status(401).json({ success: false, message: "Session expired" });
  }
  req.user = req.session.user;
  next();
};





// ✔ TEST ENDPOINT
router.get("/test", (req, res) => res.json({ ok: true }));


/* ================= GET CURRENT USER ================= */
router.get("/me", auth, async (req, res) => {
  try {
const userRes = await pool.query(
  `SELECT 
    u.id,
    u.first_name,
    u.last_name,
    u.email,
    u.department,
    u.status,
    u.login_status,
    u.role_id,
    u.profile_picture,
    u.branch,
    u.core_staff_code,
    u.core_account_officer_status,
    r.name AS role
   FROM users u
   JOIN roles r ON r.id = u.role_id
   WHERE u.id = $1`,
  [req.user.id]
);
    if (!userRes.rowCount)
      return res.status(404).json({ success: false, message: "User not found" });

    res.json({
      success: true,
      user: {
        ...userRes.rows[0],
        permissions: req.session.user.permissions || [],
      }
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});







/* ================= FORGOT PASSWORD ================= */
router.post("/forgot-password", async (req,res)=>{
  const { username } = req.body;
  const normalized = username.toLowerCase().trim();

  try{
    const userRes = await pool.query(
      `SELECT id,email,first_name,last_name FROM users WHERE LOWER(username)=$1`,
      [normalized]
    );
  if (!userRes.rowCount) {
  await logAudit(
    req,
    null,
    "PASSWORD_RESET_REQUEST",
    "FAILED",
    `Username not found: ${normalized}`
  );

  return res.status(404).json({
    success: false,
    message: "User not found"
  });
}



    const user = userRes.rows[0];
    const otp = Math.floor(100000+Math.random()*900000).toString();
    const otpHash = await bcrypt.hash(otp,10);

    await pool.query(
      `UPDATE users SET reset_otp_hash=$1,reset_otp_expires=NOW()+INTERVAL '10 mins' WHERE id=$2`,
      [otpHash,user.id]
    );

    await sendOtpEmail(user.email,otp,`${user.first_name} ${user.last_name}`);
    res.json({ success:true,message:"Reset OTP sent to email" });

  }catch(err){
    console.log(err);
    res.status(500).json({ success:false,message:"Request failed" });
  }
});








/* ================= USERNAME SUGGESTIONS ================= */
router.get("/suggest-usernames", async (req,res)=>{
  const { first_name,last_name } = req.query;

  if (!first_name || !last_name)
    return res.json({ success:false, usernames:[] });

  const base = (first_name[0]+last_name).toLowerCase();
  try{
    const existing = await pool.query(
      "SELECT username FROM users WHERE username LIKE $1",
      [`${base}%`]
    );

    const taken = existing.rows.map(u=>u.username);
    let suggestions = [];

    if(!taken.includes(base)) suggestions.push(base);

    let i=1;
    while(suggestions.length<3){
      let cand = `${base}${i}`;
      if(!taken.includes(cand)) suggestions.push(cand);
      i++;
    }
    res.json({ success:true,usernames:suggestions });

  }catch(err){
    res.json({ success:false,usernames:[] });
  }
});


/* ===============================================================
   MERGED CREATE USER (Email-based + Approval-based)
================================================================ */
router.post(
  "/",
  auth,
  roleGuard("Super Admin"),
  requirePermission("users"),
  async (req, res) => {
  const {
    first_name,last_name,email,phone_number,
    gender,department,role_id,can_approve
  } = req.body;

  try{
    if(!email)
      return res.status(400).json({ success:false,message:"Email is required" });

    const exists = await pool.query(
      `SELECT id FROM users WHERE email=$1`,
      [email]
    );
    if(exists.rowCount)
      return res.status(409).json({ success:false,message:"Email already exists" });

    // auto username + random password
    const baseUsername = email.split("@")[0].toLowerCase();
    const username = `${baseUsername}${Math.floor(100+Math.random()*900)}`;
    const plainPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(plainPassword,10);

    const newUser = await pool.query(`
      INSERT INTO users
      (first_name,last_name,username,email,phone_number,gender,
       role_id,department,can_approve,password,status,login_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Pending','Inactive')
      RETURNING *`,
      [
        first_name,last_name,username,email,phone_number,
        gender,role_id,department,!!can_approve,hashedPassword
      ]
    );

    const { password,...user } = newUser.rows[0];

    // Optional Email notification could be reattached here

   await logAudit(
  req,
  req.user.id,
  "CREATE_USER",
  "SUCCESS",
  `User ${first_name} ${last_name} created pending approval`
);


    res.json({ success:true,message:"User created & awaiting approval",user });

  }catch(err){
    console.log(err);
    res.status(500).json({ success:false,message:"Failed to add user" });
  }
});


/* ================= MULTI-LEVEL USER APPROVAL ================= */
router.post(
  "/:id/approve",
  auth,
  roleGuard("Super Admin"),
  requirePermission("approval_requests"),
  async (req, res) => {
  const userId = req.params.id;
  const approverId = req.user.id;
  const client = await pool.connect();

  try{
    await client.query("BEGIN");

    const reqRes = await client.query(`
      SELECT * FROM approval_requests
      WHERE request_ref_id=$1 AND request_type='userCreation'`,
      [userId]
    );

    if(!reqRes.rowCount){
      await client.query("ROLLBACK");
      return res.status(404).json({ success:false,message:"Approval request missing" });
    }

    const request = reqRes.rows[0];
    if(request.initiated_by===approverId)
      return res.status(403).json({ success:false,message:"Cannot approve own request" });

    const settings = await client.query(
      `SELECT approval_settings FROM system_settings LIMIT 1`
    );
    const required = settings.rows[0]?.approval_settings?.userCreation?.count || 1;
    const newCount = request.current_approvals+1;
    const final = newCount>=required ? "Approved":"Pending";

    await client.query(
      `UPDATE approval_requests
       SET current_approvals=$1,status=$2
       WHERE request_ref_id=$3 AND request_type='userCreation'`,
      [newCount,final,userId]
    );

    if(final==="Approved"){
      await client.query(
       `UPDATE users SET status='Approved', login_status='Active' WHERE id=$1`,
        [userId]
      );
    }

    await client.query(
      `INSERT INTO user_approvals(user_id,approved_by,approved_at)
       VALUES($1,$2,NOW())`,
      [userId,approverId]
    );
    await client.query("COMMIT");

    res.json({
      success:true,
      status:final,
      approvals:`${newCount}/${required}`,
      message:final==="Approved"
        ? "User fully approved" : "Approval recorded, awaiting more"
    });

  }catch(err){
    await client.query("ROLLBACK");
    res.status(500).json({ success:false,message:"Approval failed" });
  }finally{ client.release(); }
});


/* ================= RESUBMIT USER FOR APPROVAL ================= */
router.post(
  "/:id/resubmit",
  auth,
  roleGuard("Super Admin"),
  requirePermission("approval_requests"),
  async (req, res) => {

  try{
    await pool.query(`UPDATE users SET status='Pending' WHERE id=$1`,[req.params.id]);
    await pool.query(
      `UPDATE approval_requests
       SET status='Pending',current_approvals=0
       WHERE request_ref_id=$1 AND request_type='userCreation'`,
      [req.params.id]
    );
    res.json({ success:true,message:"User resubmitted for approval" });

  }catch(err){
    res.status(500).json({ success:false,message:"Resubmit failed" });
  }
});


/* ================= GET ALL USERS (MERGED) ================= */

router.get("/active", auth, async (req, res) => {

  try{
    const result = await pool.query(`
      SELECT u.id,u.first_name,u.last_name,u.email,u.phone_number,u.gender,
             u.username,u.department,u.status,u.login_status,
             u.can_approve,u.created_at,u.role_id,r.name AS role
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.can_access_admin = true
      ORDER BY u.id ASC
    `);

    res.json({ success:true, users:result.rows });

  }catch(err){
    res.status(500).json({ success:false, message:"Fetch failed" });
  }
});
/* ================= UPDATE USER DETAILS ================= */
/* ================= UPDATE USER DETAILS (Send for Approval) ================= */
router.put(
  "/:id",
  auth,
  roleGuard("Super Admin"),
  requirePermission("users"),
  async (req, res) => {

  const userId = req.params.id;

  try {
    // Store update request instead of applying update
    await pool.query(
      `INSERT INTO approval_requests (request_ref_id, request_type, data, initiated_by, status, current_approvals)
       VALUES ($1,'userEdit',$2,$3,'Pending',0)`,
      [userId, req.body, req.user.id]
    );

    return res.json({
      success: true,
      message: "User update submitted for approval"
    });

  } catch (err) {
    console.log(err);
    return res.status(500).json({ success:false,message:"Failed to queue update" });
  }
});

// ================= GET SINGLE USER (For old vs new diff) =================
router.get("/:id/details", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, phone_number,
              gender, department, role_id, status, can_approve
       FROM users WHERE id=$1`,
      [req.params.id]
    );

    if (!result.rowCount)
      return res.status(404).json({ success:false, message:"User not found" });

    res.json({ success:true, user: result.rows[0] });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success:false, message:"Failed to fetch user" });
  }
});


/* ================= UNLOCK USER LOGIN ================= */
router.patch(
  "/:id/unlock",
  auth,
  roleGuard("Super Admin"),
  requirePermission("users"),
  async (req, res) => {

  try{
    const result = await pool.query(
      `UPDATE users SET login_status='Active',failed_attempts=0
       WHERE id=$1 RETURNING id`,
      [req.params.id]
    );

    if(!result.rowCount)
      return res.status(404).json({ success:false,message:"User not found" });

    res.json({ success:true,message:"User login unlocked" });

  }catch(err){
    res.status(500).json({ success:false,message:"Unlock failed" });
  }
});


/* ================= ADMIN RESET PASSWORD ================= */
/* ================= ADMIN RESET PASSWORD (Cooldown 10 mins) ================= */
router.post(
  "/:id/reset-password",
  auth,
  roleGuard("Super Admin"),
  requirePermission("users"),
  async (req, res) => {

  try {
    const userId = req.params.id;

    const check = await pool.query(
      "SELECT email, first_name, last_name FROM users WHERE id=$1",
      [userId]
    );

    if (!check.rows.length) {
      return res.status(404).json({ success:false, message:"User not found" });
    }

    const newPassword = Math.random().toString(36).slice(-8);
    const hashed = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users
       SET
         password = $1,
         must_change_password = true,
         last_password_change = NOW(),
         last_password_reset = NOW(),
         failed_attempts = 0
       WHERE id = $2`,
      [hashed, userId]
    );

    await sendPasswordResetMail(
      check.rows[0].email,
      newPassword,
      `${check.rows[0].first_name} ${check.rows[0].last_name}`
    );

    return res.json({
      success: true,
      message: "Password reset successfully. User must change password on next login."
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success:false, message:"Reset failed" });
  }
});


/* ================= DEACTIVATE USER ================= */
/* ================= DEACTIVATE USER (Login only) ================= */
router.patch(
  "/:id/deactivate",
  auth,
  roleGuard("Super Admin"),
  requirePermission("users"),
  async (req, res) => {

  try {
    await pool.query(
      `UPDATE users SET login_status='Inactive' WHERE id=$1`,
      [req.params.id]
    );

    res.json({ success: true, message: "User login disabled (Inactive)" });

  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to deactivate" });
  }
});



/* ================= REACTIVATE USER ================= */
/* ================= REACTIVATE USER (Login only) ================= */
router.patch(
  "/:id/reactivate",
  auth,
  roleGuard("Super Admin"),
  requirePermission("users"),
  async (req, res) => {

  try {
    await pool.query(
      `UPDATE users SET login_status='Active' WHERE id=$1`,
      [req.params.id]
    );

    res.json({ success: true, message: "User login reactivated" });

  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to reactivate" });
  }
});



/* ================= ROLE PERMISSION FETCH ================= */
router.get("/role/:id", async (req,res)=>{
  try{
    const result = await pool.query(
      "SELECT name,permissions FROM roles WHERE id=$1",
      [req.params.id]
    );

    if(!result.rows.length)
      return res.json({ success:false,message:"Role not found" });

    res.json({ success:true,role:result.rows[0] });

  }catch(err){
    res.status(500).json({ success:false,message:"Error retrieving role" });
  }
});


// ------------------- GET SINGLE USER DETAILS FOR APPROVAL DIFF ------------------- //

router.get("/:id/details", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, phone_number, department, role_id, can_approve
       FROM users WHERE id=$1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.json({ success:false, message:"User not found" });
    }

    return res.json({ success:true, user: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.json({ success:false });
  }
});

/* ================= PROFILE PICTURE UPLOAD ================= */
router.post(
  "/profile-picture",
  auth,
  (req, res, next) => {
    pictureUpload.single("profile_picture")(req, res, async (err) => {
      if (err) {
        // ❌ AUDIT: multer / validation error
        await logAudit(
          req,
          req.user?.id || null,
          "PROFILE_PICTURE_UPDATE",
          "FAILED",
          err.message,
          req.user?.id || null,
          "user"
        );

        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        // ❌ AUDIT: no file
        await logAudit(
          req,
          req.user.id,
          "PROFILE_PICTURE_UPDATE",
          "FAILED",
          "No image uploaded",
          req.user.id,
          "user"
        );

        return res.status(400).json({
          success: false,
          message: "No image uploaded"
        });
      }

      const imagePath = `/uploads/profile_pictures/${req.file.filename}`;

      // ✅ Update DB
      await pool.query(
        `UPDATE users SET profile_picture = $1 WHERE id = $2`,
        [imagePath, req.user.id]
      );

      // ✅ Update session
      req.session.user.profile_picture = imagePath;

      // ✅ AUDIT: success
      await logAudit(
        req,
        req.user.id,
        "PROFILE_PICTURE_UPDATE",
        "SUCCESS",
        "Profile picture updated successfully",
        req.user.id,
        "user"
      );

      res.json({
        success: true,
        message: "Profile picture updated",
        profile_picture: imagePath
      });

    } catch (err) {
      console.error(err);

      // ❌ AUDIT: server error
      await logAudit(
        req,
        req.user?.id || null,
        "PROFILE_PICTURE_UPDATE",
        "FAILED",
        err.message || "Upload failed",
        req.user?.id || null,
        "user"
      );

      res.status(500).json({
        success: false,
        message: "Upload failed"
      });
    }
  }
);



/* ================= USER CHANGE PASSWORD ================= */
router.post("/change-password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    // 🔍 Get current password hash
    const userRes = await pool.query(
      "SELECT password FROM users WHERE id = $1",
      [userId]
    );

    if (!userRes.rowCount) {
      await logAudit(
        req,
        userId,
        "CHANGE_PASSWORD",
        "FAILED",
        "User not found",
        userId,
        "user"
      );
      return res.status(404).json({ success: false });
    }

    // ❌ Wrong current password
    const valid = await bcrypt.compare(
      currentPassword,
      userRes.rows[0].password
    );

    if (!valid) {
      await logAudit(
        req,
        userId,
        "CHANGE_PASSWORD",
        "FAILED",
        "Incorrect current password",
        userId,
        "user"
      );
      return res.status(400).json({
        success: false,
        message: "Incorrect current password"
      });
    }

    // 🔐 Validate password policy
    const policyError = validatePassword(newPassword);
    if (policyError) {
      return res.status(400).json({
        success: false,
        message: policyError
      });
    }

    // ✅ Update password
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users
       SET password = $1,
           must_change_password = false,
           last_password_change = NOW()
       WHERE id = $2`,
      [hashed, userId]
    );

    // ✅ AUDIT SUCCESS
    await logAudit(
      req,
      userId,
      "CHANGE_PASSWORD",
      "SUCCESS",
      "User changed password successfully",
      userId,
      "user"
    );

    res.json({
      success: true,
      message: "Password changed successfully"
    });

  } catch (err) {
    console.error(err);

    await logAudit(
      req,
      userId,
      "CHANGE_PASSWORD",
      "FAILED",
      err.message || "Server error",
      userId,
      "user"
    );

    res.status(500).json({
      success: false,
      message: "Password change failed"
    });
  }
});



router.post("/request-password-change-otp", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  try {
    const userRes = await pool.query(
      `
     SELECT password, email, first_name, last_name,
       reset_otp_expires
FROM users WHERE id=$1

      `,
      [userId]
    );

    if (!userRes.rowCount) {
      await logAudit(req, userId, "PASSWORD_CHANGE_OTP", "FAILED", "User not found");
      return res.status(404).json({ success: false });
    }

    const user = userRes.rows[0];

    // ❌ wrong current password
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      await logAudit(req, userId, "PASSWORD_CHANGE_OTP", "FAILED", "Incorrect current password");
      return res.status(400).json({
        success: false,
        message: "Incorrect current password"
      });
    }

    // 🔐 password policy
    const policyError = validatePassword(newPassword);
    if (policyError) {
      return res.status(400).json({ success: false, message: policyError });
    }

    // 🚫 OTP cooldown
    if (
  user.reset_otp_expires &&
  new Date(user.reset_otp_expires) > new Date()
) {
      return res.status(429).json({
        success: false,
        message: "OTP already sent. Please wait."
      });
    }

    // 🔢 generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await pool.query(
      `
      UPDATE users
SET reset_otp_hash=$1,
    reset_otp_expires=NOW() + INTERVAL '5 minutes'
WHERE id=$2

      `,
      [otpHash, userId]
    );

    req.session.pendingPassword = newPassword;

    try {
  await sendOtpEmail(
    user.email,
    otp,
    `${user.first_name} ${user.last_name}`
  );
} catch (mailErr) {
  console.error("MAIL ERROR:", mailErr);

  await logAudit(
    req,
    userId,
    "OTP_EMAIL_FAILED",
    "FAILED",
    mailErr.message
  );

  return res.status(500).json({
    success: false,
    message: "Failed to send OTP email"
  });
}

    await logAudit(req, userId, "PASSWORD_CHANGE_OTP", "SUCCESS", "OTP sent");

    res.json({ success: true, message: "OTP sent to email" });

  } catch (err) {
    console.error(err);
    await logAudit(req, userId, "PASSWORD_CHANGE_OTP", "FAILED", err.message);
    res.status(500).json({ success: false });
  }
});




router.post("/confirm-password-change", auth, async (req, res) => {
  const { otp } = req.body;
  const userId = req.user.id;

  try {
    const userRes = await pool.query(
      `SELECT reset_otp_hash, reset_otp_expires
       FROM users WHERE id=$1`,
      [userId]
    );

    if (!userRes.rowCount) {
      return res.status(404).json({ success: false });
    }

    const user = userRes.rows[0];

    if (!user.reset_otp_expires || new Date() > user.reset_otp_expires) {
      return res.status(400).json({
        success: false,
        message: "OTP expired"
      });
    }

    const validOtp = await bcrypt.compare(otp, user.reset_otp_hash);
    if (!validOtp) {
      await logAudit(req, userId, "CHANGE_PASSWORD", "FAILED", "Invalid OTP");
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // 🔐 HASH NEW PASSWORD FROM SESSION
    const hashed = await bcrypt.hash(req.session.pendingPassword, 10);

    await pool.query(
      `UPDATE users
       SET password=$1,
           reset_otp_hash=NULL,
           reset_otp_expires=NULL,
           must_change_password=false,
           last_password_change=NOW()
       WHERE id=$2`,
      [hashed, userId]
    );

    delete req.session.pendingPassword;

    await logAudit(
      req,
      userId,
      "CHANGE_PASSWORD",
      "SUCCESS",
      "Password changed successfully"
    );

    // 🔥 AUTO LOGOUT (DESTROY SESSION)
    req.session.destroy(() => {
      res.json({
        success: true,
        logout: true,
        message: "Password changed. Please login again."
      });
    });

  } catch (err) {
    console.error(err);
    await logAudit(req, userId, "CHANGE_PASSWORD", "FAILED", err.message);
    res.status(500).json({ success: false });
  }
});





router.post("/resend-password-change-otp", auth, async (req, res) => {
  const userId = req.user.id;

  try {
    const userRes = await pool.query(
      `
      SELECT email, first_name, last_name,
             reset_otp_expires
      FROM users WHERE id=$1
      `,
      [userId]
    );

    if (!userRes.rowCount) {
      await logAudit(
        req,
        userId,
        "PASSWORD_CHANGE_OTP_RESEND",
        "FAILED",
        "User not found"
      );
      return res.status(404).json({ success: false });
    }

    const user = userRes.rows[0];

    // 🚫 Cooldown check (still valid OTP)
    if (
      user.reset_otp_expires &&
      new Date(user.reset_otp_expires) > new Date()
    ) {
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting another OTP"
      });
    }

    // 🔢 Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await pool.query(
      `
      UPDATE users
SET reset_otp_hash = $1,
    reset_otp_expires = NOW() + INTERVAL '5 minutes'
WHERE id = $2

      `,
      [otpHash, userId]
    );

    await sendOtpEmail(
      user.email,
      otp,
      `${user.first_name} ${user.last_name}`
    );

    await logAudit(
      req,
      userId,
      "PASSWORD_CHANGE_OTP_RESEND",
      "SUCCESS",
      "Password change OTP resent"
    );

    res.json({
      success: true,
      message: "OTP resent successfully"
    });

  } catch (err) {
    console.error(err);

    await logAudit(
      req,
      userId,
      "PASSWORD_CHANGE_OTP_RESEND",
      "FAILED",
      err.message || "Server error"
    );

    res.status(500).json({
      success: false,
      message: "Failed to resend OTP"
    });
  }
});


/* ================= GRANT ADMIN ACCESS ================= */
router.patch(
  "/:id/grant-admin",
  auth,
  roleGuard("Super Admin"),
  requirePermission("users"),
  async (req, res) => {

  const { role_id, can_approve } = req.body;

  try {


 // 🔐 Prevent admin from modifying their own privileges
    if (req.user.id == req.params.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot modify your own admin privileges"
      });
    }

    
const userCheck = await pool.query(
  "SELECT id, email, can_access_admin FROM users WHERE id=$1",
  [req.params.id]
);

if (!userCheck.rowCount) {
  return res.status(404).json({
    success: false,
    message: "User not found"
  });
}

if (userCheck.rows[0].can_access_admin) {
  return res.status(400).json({
    success: false,
    message: "User already has admin access"
  });
}
  
await pool.query(
  `UPDATE users
   SET
     can_access_admin = true,
     role_id = $1,
     can_approve = $2,
     status = 'Pending',
     login_status = 'Inactive'
   WHERE id = $3`,
  [role_id, !!can_approve, req.params.id]
);

await pool.query(
  `INSERT INTO approval_requests
   (request_ref_id, request_type, initiated_by, status, current_approvals)
   VALUES ($1, 'userCreation', $2, 'Pending', 0)`,
  [req.params.id, req.user.id]
);

    return res.json({
      success: true,
      message: "Admin access sent for approval"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Failed to grant admin access"
    });
  }
});

/* ================= EXPORT ROUTER ================= */
module.exports = router;
