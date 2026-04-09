import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
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
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your OTP Code",
    text: `Your OTP code is: ${otp}. It expires in 5 minutes.`,
  });
};

/* ================= CUSTOMER LOGIN ================= */
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const otp = generateOTP();

    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    await sendOTPEmail(user.username, otp);

    return res.json({
      success: true,
      message: "OTP sent",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Login failed" });
  }
};

/* ================= VERIFY CUSTOMER OTP (JWT) ================= */
export const verifyCustomerOTP = async (req, res) => {
  try {
    const { username, otp } = req.body;

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const record = await prisma.oTP.findFirst({
      where: {
        userId: user.id,
        code: otp,
        used: false,
      },
    });

    if (!record) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    await prisma.oTP.update({
      where: { id: record.id },
      data: { used: true },
    });

    const token = jwt.sign(
      {
        id: user.id,
        role: "CUSTOMER",
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    return res.json({
      success: true,
      token,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "OTP verification failed" });
  }
};
