import express from "express";
import {
  login,
  verifyCustomerOTP,
} from "../controllers/customerAuthController.js";

const router = express.Router();

router.post("/login", login);
router.post("/verify-otp", verifyCustomerOTP);

export default router;
