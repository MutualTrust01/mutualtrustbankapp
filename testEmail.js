// testEmail.js
const nodemailer = require("nodemailer");
require("dotenv").config();

async function sendTestEmail() {
  // Create transporter (same as your main code)
  let transporter = nodemailer.createTransport({
    host: "mail.mutualtrustmfbank.com",
    port: 465,       // SSL port
    secure: true,    // true for SSL
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
    logger: true,
    debug: true,
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,           // must match your cPanel email
      to: "polatunji699@gmail.com",    // replace with your real email
      subject: "SMTP Test",
      text: "Hello, this is a plain text test from Node.js",
    });

    console.log("📩 Email sent successfully!", info.messageId);
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
}

sendTestEmail();
