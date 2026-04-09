import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { generateOTP } from "../utils/generateOTP.js";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

/* ================= EMAIL SETUP ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ================= SEND OTP EMAIL ================= */
const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your OTP Code",
    text: `Your OTP code is: ${otp}\nIt will expire in 5 minutes.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("OTP email sent to:", email);
  } catch (error) {
    console.error("Error sending OTP email:", error);
  }
};

/* ================= LOGIN (USERNAME + PASSWORD) ================= */
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.oTP.create({
      data: {
        code: otpCode,
        expiresAt,
        userId: user.id,
      },
    });

    await sendOTPEmail(user.username, otpCode);

    return res.json({
      success: true,
      message: "OTP sent to your email",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Login failed" });
  }
};

/* ================= VERIFY OTP (ADMIN / STAFF) ================= */
export const verifyOTP = async (req, res) => {
  try {
    const { username, otp } = req.body;

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otpRecord = await prisma.oTP.findFirst({
      where: {
        userId: user.id,
        code: otp,
        used: false,
      },
    });

    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    await prisma.oTP.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });

    const permissions = await prisma.rolePermission.findMany({
      where: { role_id: user.role_id },
      select: { permission: true },
    });

    /* ================= LOAD SESSION TIMEOUT FROM DB ================= */
    const systemSettings = await prisma.systemSettings.findFirst({
      orderBy: { updated_at: "desc" },
    });

    const timeoutMinutes =
      systemSettings?.session_config?.adminTimeout ?? 15;

    /* ================= CREATE SESSION ================= */
    req.session.user = {
      id: user.id,
      email: user.username,
      role: user.role,
      role_id: user.role_id,
      can_approve: user.can_approve === true,
      permissions: permissions.map((p) => p.permission),
    };

    req.session.ip = req.ip;
    req.session.userAgent = req.headers["user-agent"];
    req.session.lastActivity = Date.now();

    /* 🔥 FORCE SESSION SAVE */
    req.session.save((err) => {
      if (err) {
        console.error("Session save failed:", err);
        return res.status(500).json({
          success: false,
          message: "Session creation failed",
        });
      }

      return res.json({
        success: true,
        message: "Admin login successful",
        user: {
          id: user.id,
          email: user.username,
          role: user.role,
          role_id: user.role_id,
          permissions: permissions.map((p) => p.permission),
          session_timeout: timeoutMinutes, // 🔥 ADDED
        },
      });
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "OTP verification failed" });
  }
};
