const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const { sendOtpEmail } = require("../mailer");
const validatePassword = require("../src/utils/passwordPolicy");

const { rateLimit, ipKeyGenerator } = require("express-rate-limit");



const auth = require("../middleware/auth");  // <--- add this line

const logAudit = require("../src/utils/auditLogger");




const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 attempts per window

  keyGenerator: (req) => {
  const username = (req.body.username || "").toLowerCase().trim();
  return `${ipKeyGenerator(req)}_${username}`;
},


  standardHeaders: true,  // Return rate limit info in headers
  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many login attempts. Try again in 10 minutes."
    });
  }
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // temporarily relax while testing

  keyGenerator: (req) => {
  const username = (req.body.username || "").toLowerCase().trim();
  return `${ipKeyGenerator(req)}_${username}_otp`;
},


  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many OTP attempts. Try again later."
    });
  }
});


console.log("🔐 AUTH ROUTE FILE LOADED");





/* =========================
   LOGIN (SEND OTP)
========================= */
/* =========================
   LOGIN (SEND OTP)
========================= */
router.post("/login", loginLimiter, async (req, res) => {
const { username, password } = req.body;
if (!username || !password) {
  return res.status(400).json({
    success: false,
    message: "Username and password are required"
  });
}


const normalized = username.toLowerCase().trim();




  try {
    const userRes = await pool.query(
      `
   
SELECT
  id,
  username,
  email,
  first_name,
  last_name,
  password,
  status,
  login_status,
  can_approve,
  failed_attempts,
  role_id,
  must_change_password,
  last_password_change,
  created_at,
  locked_until
FROM users
WHERE LOWER(username) = $1

`,
[normalized]

    );

    // ❌ USER NOT FOUND
    if (!userRes.rows.length) {
  await logAudit(
    req,
    null, // user not identified
    "LOGIN_ATTEMPT",
    "FAILED",
    "Username not found"
  );

 return res.status(400).json({
  success: false,
  message: "Invalid credentials"
});

}


    const user = userRes.rows[0];

    // 🔒 ACCOUNT LOCK CHECK
if (user.locked_until && new Date(user.locked_until) > new Date()) {

  await logAudit(
    req,
    user.id,
   "LOGIN_ATTEMPT",

    "FAILED",
    "Account temporarily locked"
  );

  return res.status(403).json({
    success: false,
    message: "Account temporarily locked. Try again later."
  });
}



    // ❌ PASSWORD INCORRECT → LOG FAILED LOGIN ATTEMPT
    const isMatch = await bcrypt.compare(password, user.password);
    

if (!isMatch) {

  const attempts = (user.failed_attempts || 0) + 1;

  await pool.query(
    `UPDATE users
     SET failed_attempts = $1,
         locked_until = CASE
           WHEN $1 >= 5
           THEN NOW() + INTERVAL '15 minutes'
           ELSE locked_until
         END
     WHERE id = $2`,
    [attempts, user.id]
  );

  await logAudit(
    req,
    user.id,
    "LOGIN_ATTEMPT",
    "FAILED",
    "Incorrect password"
  );

  if (attempts >= 5) {
    return res.status(403).json({
      success: false,
      message: "Account locked for 15 minutes due to multiple failed attempts"
    });
  }

  return res.status(400).json({
    success: false,
    message: "Invalid credentials"
  });
}




// ✅ LOG SUCCESSFUL LOGIN ATTEMPT
await logAudit(
  req,
  user.id,
  "LOGIN_ATTEMPT",
  "SUCCESS",
  "Password verified successfully"
);

    // 🔐 SEND OTP
const otp = Math.floor(100000 + Math.random() * 900000).toString();
const otpHash = await bcrypt.hash(otp, 10);


await pool.query(
  `
  UPDATE users
  SET otp = $1,
      otp_expires = NOW() + INTERVAL '10 minutes'
  WHERE id = $2
  `,
  [otpHash, user.id]
);

await pool.query(
  `UPDATE users
   SET failed_attempts = 0,
       locked_until = NULL
   WHERE id = $1`,
  [user.id]
);
try {
  await sendOtpEmail(user.email, otp, `${user.first_name} ${user.last_name}`);
} catch (emailErr) {
  console.error("OTP email failed but login continues:", emailErr.message);
}


    return res.json({
      success: true,
      message: "OTP sent"
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
});



router.post("/verify-otp", async (req, res) => {
  const { username, otp } = req.body;

if (!username || !otp) {
  return res.status(400).json({
    success: false,
    message: "Username and OTP are required"
  });
}


const normalized = username.toLowerCase().trim();

  try {
    /* ================= LOAD USER ================= */
    const userRes = await pool.query(
      `
     SELECT
  id,
  username,
  email,
  first_name,
  last_name,
  role_id,
status,
login_status, 
 can_approve,
  must_change_password,
  last_password_change,
  created_at,

  -- 🔥 ADD THESE
  can_access_hrm_crm,
can_access_admin,
otp,
otp_expires

FROM users
WHERE LOWER(username) = $1
`,
[normalized]
    );

    if (!userRes.rowCount) {
      return res.status(400).json({
        success: false,
        message: "Invalid user"
      });
    }

    const user = userRes.rows[0];

    // 🔒 ACCOUNT LOCK CHECK (FOR OTP STAGE)
if (user.locked_until && new Date(user.locked_until) > new Date()) {

  await logAudit(
    req,
    user.id,
    "OTP_ATTEMPT",
    "FAILED",
    "Account temporarily locked"
  );

  return res.status(403).json({
    success: false,
    message: "Account temporarily locked. Try again later."
  });
}




    /* ================= OTP EXPIRED ================= */
    if (!user.otp_expires || new Date(user.otp_expires) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "OTP expired"
      });
    }

    /* ================= OTP INVALID ================= */
  const otpMatch = await bcrypt.compare(otp.toString(), user.otp);

if (!otpMatch) {

  // 🔥 Increment failed attempts for wrong OTP
  await pool.query(
    `UPDATE users
SET failed_attempts = failed_attempts + 1,
    locked_until = CASE
        WHEN failed_attempts + 1 >= 5
        THEN NOW() + INTERVAL '15 minutes'
        ELSE locked_until
    END
WHERE id = $1`,
    [user.id]
  );

  await logAudit(
    req,
    user.id,
    "OTP_ATTEMPT",
    "FAILED",
    "Invalid OTP entered"
  );

  return res.status(400).json({
    success: false,
    message: "Invalid OTP"
  });
}


// ✅ FULL AUTH SUCCESS → RESET FAILED LOGIN ATTEMPTS
// ✅ FULL AUTH SUCCESS → RESET FAILED LOGIN ATTEMPTS
await pool.query(
  `UPDATE users
SET failed_attempts = 0,
    locked_until = NULL
WHERE id = $1
`,
  [user.id]
);

// ✅ AUDIT: OTP SUCCESS
await logAudit(
  req,
  user.id,
  "OTP_ATTEMPT",
  "SUCCESS",
  "OTP verified successfully"
);


    /* ================= CLEAR OTP ================= */
await pool.query(
  `
UPDATE users
SET otp = NULL,
    otp_expires = NULL
WHERE id = $1

  `,
  [user.id]
);


/* ================= PASSWORD EXPIRY ================= */
const sys = await pool.query(`
  SELECT admin_password_expiry_days
  FROM system_settings
  ORDER BY updated_at DESC
  LIMIT 1
`);

const expiryDays = Number(sys.rows[0]?.admin_password_expiry_days) || 90;
const lastChange = user.last_password_change || user.created_at;

const daysPassed = Math.floor(
  (Date.now() - new Date(lastChange)) / (1000 * 60 * 60 * 24)
);

const mustReset = user.must_change_password || daysPassed >= expiryDays;

    /* ================= LOAD PERMISSIONS ================= */
    const permRes = await pool.query(
      `SELECT permissions FROM roles WHERE id = $1`,
      [user.role_id]
    );

    let permissions = permRes.rows[0]?.permissions || [];
    if (typeof permissions === "string") {
      permissions = permissions.split(",").map(p => p.trim());
    }

    /* ================= CREATE SESSION ================= */
   /* ================= SUPER ADMIN OVERRIDE ================= */
const roleRes = await pool.query(
  `SELECT name FROM roles WHERE id = $1`,
  [user.role_id]
);

const roleName = roleRes.rows[0]?.name;

/* ================= CREATE SESSION ================= */
req.session.regenerate(err => {
  if (err) {
    return res.status(500).json({ success:false, message:"Session error" });
  }

  // ✅ ADD THIS LINE
  req.session.authenticated = true;

  
req.session.user = {
  id: user.id,
  username: user.username,
  email: user.email,
  first_name: user.first_name,
  last_name: user.last_name,
  role_id: user.role_id,

  status: user.status,
  login_status: user.login_status,

  can_access_hrm_crm: user.can_access_hrm_crm ?? false,

  can_access_admin:
    roleName === "Super Admin"
      ? true
      : user.can_access_admin ?? false,

  can_approve: user.can_approve,
  must_change_password: user.must_change_password,
  permissions
};

  req.session.lastActivity = Date.now();
  req.session.createdAt = Date.now();
  req.session.ip = req.ip;
  req.session.userAgent = req.headers["user-agent"];

  


req.session.save(() => {
  res.json({
    success: true,
    message: "Login successful",
    forcePasswordChange: mustReset,
    reason: mustReset
      ? (daysPassed >= expiryDays ? "expired" : "reset")
      : null,
    user: req.session.user
  });
});
   
});

  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "OTP verification failed"
    });
  }
});








/* ==================== RESEND LOGIN OTP ==================== */
router.post("/resend-otp", async (req, res) => {
  const { username } = req.body;
if (!username) {
  return res.status(400).json({
    success: false,
    message: "Username is required"
  });
}



const normalized = username.toLowerCase().trim();


  try {
    const userRes = await pool.query(
      `
      SELECT id, email, first_name, last_name
      FROM users
     WHERE LOWER(username) = $1
`,
[normalized]

    );

    if (!userRes.rowCount) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = userRes.rows[0];
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
const otpHash = await bcrypt.hash(otp, 10);


    await pool.query(
      `
      UPDATE users
      SET otp = $1,
          otp_expires = NOW() + INTERVAL '10 minutes'
      WHERE id = $2
      `,
      [otpHash, user.id]
    );

    await sendOtpEmail(user.email, otp, `${user.first_name} ${user.last_name}`);

    return res.json({
      success: true,
      message: "OTP resent successfully"
    });

  } catch (err) {
    console.error("RESEND OTP ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to resend OTP"
    });
  }
});










/* =========================
   LOGOUT
========================= */
router.post("/logout", async (req, res) => {
  if (req.session?.user?.id) {
    await logAudit(
      req,
      req.session.user.id,
      "LOGOUT",
      "SUCCESS",
      "User logged out"
    );
  }

  req.session.destroy(() => res.json({ success: true }));
});



/* =========================
   GET LOGGED-IN USER
========================= */
router.get("/me", async (req, res) => {
 if (!req.session || !req.session.user) {
  return res.status(401).json({
    success: false,
    message: "Not authenticated"
  });
}


const result = await pool.query(`
  SELECT
  u.id,
  u.username,
  u.email,
  u.first_name,
  u.last_name,
  u.role_id,
  r.name AS role_name,
  u.profile_picture,
 u.branch,
  u.core_staff_code,



  -- 🔥 DASHBOARD FLAGS
  u.can_access_hrm_crm,
  u.can_access_admin,

  u.can_approve,
  u.must_change_password,
  r.permissions
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE u.id = $1

`, [req.session.user.id]);



  let user = result.rows[0];
  if (typeof user.permissions === "string")
    user.permissions = user.permissions.split(",").map(p=>p.trim());

return res.json({
  success: true,
  user,
  forcePasswordChange: user.must_change_password
});  

});





const upload = require("../middleware/picture_uploads");

router.post(
  "/upload-profile-picture",
  auth,

  // 🔥 UPDATE STARTS HERE
  (req, res, next) => {
    upload.single("profile_picture")(req, res, async err => {
      if (err) {
        await logAudit(
          req,
          req.session?.user?.id || null,
          "PROFILE_PICTURE_UPDATE",
          "FAILED",
          err.message
        );
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  },
  // 🔥 UPDATE ENDS HERE

  async (req, res) => {

    try {
      if (!req.file) {
        // ❌ AUDIT: failed attempt (no file)
       await logAudit(req, req.session.user.id, "PROFILE_PICTURE_UPDATE", "FAILED", "No image uploaded");


        return res.status(400).json({
          success: false,
          message: "No image uploaded"
        });
      }

      const imagePath = `/uploads/profile_pictures/${req.file.filename}`;

      await pool.query(
        `UPDATE users SET profile_picture=$1 WHERE id=$2`,
        [imagePath, req.session.user.id]
      );

      // 🔥 update session
      req.session.user.profile_picture = imagePath;

      // ✅ AUDIT: success
      await logAudit(
  req,
  req.session.user.id,
  "PROFILE_PICTURE_UPDATE",
  "SUCCESS",
  "Profile picture updated successfully"
);


      return res.json({
        success: true,
        message: "Profile picture updated",
        profile_picture: imagePath
      });

    } catch (err) {
      console.error(err);

      // ❌ AUDIT: server error
     await logAudit(
  req,
  req.session.user?.id || null,
  "PROFILE_PICTURE_UPDATE",
  "FAILED",
  err.message || "Upload failed"
);

      return res.status(500).json({
        success: false,
        message: "Upload failed"
      });
    }
  }
);








/* ================= FORGOT PASSWORD - SEND RESET OTP ================= */
router.post("/forgot-password", otpLimiter, async (req,res)=>{
  const { username } = req.body;
if (!username) {
  return res.status(400).json({
    success: false,
    message: "Username is required"
  });
}


const normalized = username.toLowerCase().trim();
  

  try{
    const userRes = await pool.query(
      `SELECT id,email,first_name,last_name FROM users WHERE LOWER(username)=$1`,
      [normalized]
    );
    if(!userRes.rowCount)
      return res.status(404).json({ success:false,message:"User not found" });

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
    res.status(500).json({ success:false,message:"Request failed" });
  }
});


/* ================= VERIFY RESET OTP ================= */
router.post("/verify-reset-otp", async(req,res)=>{
  const { username, otp } = req.body;
if (!username || !otp) {
  return res.status(400).json({
    success: false,
    message: "Username and OTP are required"
  });
}



const normalized = username.toLowerCase().trim();
  

  try{
    const userRes = await pool.query(
      `SELECT id,reset_otp_hash,reset_otp_expires FROM users WHERE LOWER(username)=$1`,
      [normalized]
    );
    if(!userRes.rowCount)
      return res.status(404).json({ success:false,message:"User not found" });

    const user = userRes.rows[0];

    if(!user.reset_otp_expires || new Date(user.reset_otp_expires) < new Date())
      return res.status(400).json({ success:false,message:"OTP expired" });

    const match = await bcrypt.compare(otp,user.reset_otp_hash);
    if(!match)
      return res.status(400).json({ success:false,message:"Invalid OTP" });

    res.json({ success:true,message:"OTP verified" });

  }catch(err){
    res.status(500).json({ success:false,message:"OTP verification failed" });
  }
});


/* ================= RESEND RESET OTP ================= */
router.post("/resend-reset-otp", async (req,res)=>{
  const { username } = req.body;
  if (!username) {
  return res.status(400).json({
    success: false,
    message: "Username is required"
  });
}



const normalized = username.toLowerCase().trim();
  

  try{
    const userRes = await pool.query(
      `SELECT id,email,first_name,last_name FROM users WHERE LOWER(username)=$1`,
      [normalized]
    );

    if(!userRes.rowCount)
      return res.status(404).json({ success:false,message:"User not found" });

    const user = userRes.rows[0];
    const otp = Math.floor(100000+Math.random()*900000).toString();
    const otpHash = await bcrypt.hash(otp,10);

    await pool.query(
      `UPDATE users SET reset_otp_hash=$1,reset_otp_expires=NOW()+INTERVAL '10 mins' WHERE id=$2`,
      [otpHash,user.id]
    );

    await sendOtpEmail(user.email,otp,`${user.first_name} ${user.last_name}`);
    return res.json({ success:true,message:"Reset OTP resent" });

  }catch(err){
    console.log(err);
    return res.status(500).json({ success:false,message:"Failed to resend OTP" });
  }
});


/* ================= RESET PASSWORD FINAL ================= */
router.post("/reset-password", async(req,res)=>{
  const { username, otp, newPassword } = req.body;
if (!username || !otp || !newPassword) {
  return res.status(400).json({
    success: false,
    message: "Username, OTP and new password are required"
  });
}

const normalized = username.toLowerCase().trim();
  

  const passwordError = validatePassword(newPassword,"Strong");
  if(passwordError)
    return res.status(400).json({ success:false,message:passwordError });

  try{
    const userRes = await pool.query(
      `SELECT id,reset_otp_hash,reset_otp_expires FROM users WHERE LOWER(username)=$1`,
      [normalized]
    );

    if(!userRes.rowCount)
      return res.status(404).json({ success:false,message:"User not found" });

    const user = userRes.rows[0];

    if(!user.reset_otp_expires || new Date(user.reset_otp_expires) < new Date())
      return res.status(400).json({ success:false,message:"OTP expired" });

    const match = await bcrypt.compare(otp,user.reset_otp_hash);
    if(!match)
      return res.status(400).json({ success:false,message:"Invalid OTP" });

    const hash = await bcrypt.hash(newPassword,10);

   await pool.query(
  `UPDATE users
   SET password=$1,
       must_change_password=false,
       last_password_change=NOW(),
       failed_attempts=0,
       locked_until=NULL,
       reset_otp_hash=NULL,
       reset_otp_expires=NULL
   WHERE id=$2`,
  [hash, user.id]
);


    res.json({ success:true,message:"Password reset successful" });

  }catch(err){
    res.status(500).json({ success:false,message:"Reset failed" });
  }
});


// ================= CHANGE PASSWORD AFTER FIRST LOGIN ================= //
// ================= CHANGE PASSWORD WITH CURRENT PASSWORD VALIDATION ================= //


router.post("/change-password", auth, async (req, res) => {

  const { currentPassword, newPassword } = req.body;

  
if (!currentPassword || !newPassword) {
  return res.status(400).json({
    success:false,
    message:"Current and new password are required"
  });
}


  try {

    const userRes = await pool.query(
      `SELECT id, password FROM users WHERE id=$1`,
      [req.session.user.id]
    );

    if (!userRes.rowCount) {
      return res.json({
        success:false,
        message:"User not found"
      });
    }

    const user = userRes.rows[0];

    /* VERIFY CURRENT PASSWORD */
    const match = await bcrypt.compare(currentPassword, user.password);

    
if (!match) {

  await logAudit(
    req,
    req.session.user.id,
    "PASSWORD_CHANGE",
    "FAILED",
    "Incorrect current password"
  );

  return res.status(400).json({
    success: false,
    message: "Current password is incorrect"
  });
}

    /* HASH NEW PASSWORD */
    const hash = await bcrypt.hash(newPassword,10);

    /* UPDATE PASSWORD */
    await pool.query(
      `UPDATE users
       SET password=$1,
           must_change_password=false,
           last_password_change=NOW()
       WHERE id=$2`,
      [hash, user.id]
    );

    req.session.user.must_change_password = false;

    await logAudit(
      req,
      user.id,
      "PASSWORD_CHANGE",
      "SUCCESS",
      "Password updated successfully"
    );

    return res.json({
      success:true,
      message:"Password updated successfully"
    });

  } catch(err){

    console.error("CHANGE PASSWORD ERROR:", err);

    return res.status(500).json({
      success:false,
      message:"Server error"
    });

  }

});


router.post("/admin/reset-device/:userId", auth, async (req, res) => {
  if (!req.session.user.permissions.includes("admin_reset_device")) {
    return res.status(403).json({ message: "Unauthorized" });
  }


  
  if (Number(req.params.userId) === req.session.user.id) {
    return res.status(400).json({
      success: false,
      message: "You cannot reset your own device"
    });
  }

  await pool.query(
  `
  UPDATE users
  SET device_id = NULL,
      device_locked = false
  WHERE id = $1
  `,
  [req.params.userId]
);


  await logAudit(
    req,
    req.session.user.id,
    "DEVICE_RESET",
    "SUCCESS",
    `Device reset for user ${req.params.userId}`
  );

  

  res.json({ success: true, message: "Device reset successfully" });
});


module.exports = router;
