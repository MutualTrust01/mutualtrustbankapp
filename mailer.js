const nodemailer = require("nodemailer");
require("dotenv").config({ path: __dirname + "/.env" });

// ============================
// CREATE SMTP TRANSPORTER
// ============================



const transporter = nodemailer.createTransport({
  host: "mail.mutualtrustmfbank.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify transporter on startup
transporter.verify((err) => {
  if (err) {
    console.error("❌ SMTP verification failed:", err);
  } else {
    console.log("✅ SMTP is ready to send emails");
  }
});

// ============================
// REUSABLE EMAIL TEMPLATE (UPGRADED)
// ============================
const emailLayout = ({ title, body }) => {
  const year = new Date().getFullYear();
  const logoUrl = "https://mutualtrustmfbank.com/assets/logo.png";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>

<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8; padding:30px 0;">
    <tr>
      <td align="center">

        <table width="600" cellpadding="0" cellspacing="0" style="
          background:#ffffff;
          border-radius:10px;
          overflow:hidden;
          box-shadow:0 6px 18px rgba(0,0,0,0.08);
        ">

          <!-- HEADER -->
          <tr>
            <td style="
              background:#0f3d6e;
              padding:24px;
              text-align:center;
            ">
              <img
                src="${logoUrl}"
                alt="Mutual Trust MFB"
                style="width:120px; margin-bottom:10px;"
              />
              <h1 style="
                color:#ffffff;
                margin:0;
                font-size:22px;
                letter-spacing:0.4px;
              ">
                Mutual Trust Microfinance Bank
              </h1>
              <p style="
                margin-top:6px;
                color:#cfe2ff;
                font-size:13px;
              ">
                Secure • Trusted • Reliable
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:30px;">
              <h2 style="
                margin-top:0;
                color:#0f3d6e;
                font-size:18px;
              ">
                ${title}
              </h2>

              <div style="
                color:#333333;
                font-size:14px;
                line-height:1.7;
              ">
                ${body}
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="
              background:#f1f3f6;
              padding:20px;
              text-align:center;
              font-size:12px;
              color:#777777;
            ">
              <p style="margin:6px 0;">
                This is an automated notification. Please do not reply.
              </p>

              <p style="margin:6px 0;">
                © ${year} Mutual Trust Microfinance Bank
              </p>

              <p style="margin-top:10px;">
                <a href="mailto:support@mutualtrustmfbank.com"
                  style="color:#0f3d6e; text-decoration:none;">
                  support@mutualtrustmfbank.com
                </a>
                &nbsp;|&nbsp; +234-XXX-XXXXXXX
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;
};

// ============================
// GENERIC EMAIL SENDER (UNCHANGED)
// ============================
const sendMail = async ({ to, subject, html }) => {
  if (!to || !subject || !html) {
    console.error("❌ sendMail error: missing parameters");
    return false;
  }

  const mailOptions = {
    from: `"Mutual Trust MFB" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📩 Email sent → ${info.messageId}`);
    return true;
  } catch (err) {
    console.error("❌ Failed to send email:", err);
    return false;
  }
};

// ============================
// STYLED EMAIL SENDER (REUSABLE)
// ============================
const sendStyledMail = async ({ to, subject, title, body }) => {
  return sendMail({
    to,
    subject,
    html: emailLayout({ title, body }),
  });
};

// ============================
// SEND OTP EMAIL (UNCHANGED)
// ============================
// ============================
// ============================
// SEND OTP EMAIL (PERSONALIZED ADMIN)
// ============================
const sendOtpEmail = async (to, otp, fullName = "User") => {
  if (!to || !otp) {
    console.error("❌ sendOtpEmail error: missing 'to' or 'otp'");
    return false;
  }

  const safeName = fullName || "User";

  const body = `
    <p>Dear ${safeName},</p>

    <p>
      A login attempt was made to access the
      <strong>Mutual Trust Microfinance Bank Administrative System</strong>.
    </p>

    <p>
      Please use the One-Time Password (OTP) below to complete your login:
    </p>

    <div style="
      margin: 25px 0;
      padding: 18px;
      background: #f1f6ff;
      border: 1px dashed #0f3d6e;
      border-radius: 8px;
      text-align: center;
    ">
      <span style="
        font-size: 28px;
        font-weight: bold;
        letter-spacing: 6px;
        color: #0f3d6e;
      ">
        ${otp}
      </span>
    </div>

    <p>
      <strong>This OTP will expire in 10 minutes.</strong>
    </p>

    <p>
      If you did not initiate this login attempt, please notify
      the IT or System Administration team immediately.
    </p>

    <p style="margin-top:20px;">
      <strong>Security Notice:</strong>
    </p>
    <ul>
      <li>Do not share this OTP with anyone</li>
      <li>No staff member will ever request your OTP</li>
      <li>This OTP grants access to a restricted administrative system</li>
    </ul>

    <p style="margin-top:20px;">
      Regards,<br/>
      <strong>Mutual Trust Microfinance Bank</strong><br/>
      <span style="font-size:13px; color:#555;">
        System Administration
      </span>
    </p>
  `;

  return sendStyledMail({
    to,
    subject: "Admin Login OTP – Mutual Trust MFB",
    title: "Admin OTP Verification",
    body,
  });
};






// ============================
// SEND PASSWORD RESET MAIL
// ============================
const sendPasswordResetMail = async (to, password, fullName = "User") => {
  const body = `
    <p>Dear <strong>${fullName}</strong>,</p>

    <p>Your password has been <strong>reset by an Administrator</strong>.</p>

    <p>Please use the temporary password below to login:</p>

    <div style="
      margin:20px 0;
      padding:15px;
      background:#eef6ff;
      border-left:4px solid #0f3d6e;
      border-radius:6px;
      font-size:18px;
      font-weight:bold;
      text-align:center;
      color:#0f3d6e;
    ">
      ${password}
    </div>

    <p style="margin-top:10px;">
      For your security, <strong>please change your password immediately after login.</strong>
    </p>

    <p style="margin-top:25px;">
      Regards,<br>
      <strong>Mutual Trust Microfinance Bank</strong>
    </p>
  `;

  return sendStyledMail({
    to,
    subject: "Password Reset Notification – Mutual Trust MFB",
    title: "Password Reset Notification",
    body,
  });
};


const sendUserCredentialMail = async (to, username, password, fullName = "User", crmLink) => {
  
const body = `
<p>Dear <strong>${fullName}</strong>,</p>

<p>
We are pleased to inform you that your staff onboarding has been 
<strong>successfully approved</strong> by the Human Resources Department 
of <strong>Mutual Trust Microfinance Bank</strong>.
</p>

<p>
Your access to the <strong>Mutual Trust Staff Portal</strong> has now been activated.
Please find your login credentials below:
</p>

<div style="
padding:18px;
background:#eef6ff;
border-left:4px solid #0f3d6e;
border-radius:6px;
margin:20px 0;
line-height:1.8;
font-size:14px;
">

<p><strong>Username:</strong> ${username}</p>
<p><strong>Temporary Password:</strong> ${password}</p>

</div>

<p>
You may access the staff system using the link below:
</p>

<p style="margin:15px 0;">
<a href="https://ibank.mutualtrustmfbank.com/login"
style="
background:#0f3d6e;
color:#ffffff;
padding:10px 20px;
text-decoration:none;
border-radius:5px;
font-size:14px;
">
Login to Staff Portal
</a>
</p>

<p>
The staff portal enables authorized personnel to carry out various 
<strong>HRM and CRM operations</strong> including internal administrative tasks,
customer management activities, and operational service delivery.
</p>

<p>
Your CRM application portal can be accessed through the link below:
</p>

<p style="margin:15px 0;">
<a href="${crmLink}"
style="
background:#16a34a;
color:#ffffff;
padding:10px 20px;
text-decoration:none;
border-radius:5px;
font-size:14px;
">
crm personalized  link
</a>
</p>

<p>
For security reasons, you will be required to 
<strong>change your password immediately after your first login</strong>.
</p>

<p>
If you experience any difficulty accessing the system, please contact
the <strong>IT Support Unit</strong> or the <strong>Human Resources Department</strong>.
</p>

<p style="margin-top:25px;">
We welcome you to the team and wish you success in your role at
<strong>Mutual Trust Microfinance Bank</strong>.
</p>

<p>
Warm regards,<br/>
<strong>Human Resources Department</strong><br/>
Mutual Trust Microfinance Bank
</p>
`;

  return sendStyledMail({
    to,
    subject: "Your Account Access Details – Mutual Trust MFB",
    title: "Account Approval & Access Credentials",
    body
  });
};

// ============================
// EXPORTS (BACKWARD SAFE)
// ============================
module.exports = {
  sendOtpEmail,
  sendMail,
  sendStyledMail,
  emailLayout,
  sendPasswordResetMail,
  sendUserCredentialMail 
};
