const express = require("express");
const router = express.Router();

// 🔐 FRONTEND SESSION AUTH (✅ CORRECT)
const auth = require("../middleware/auth");

const {
  createFixedDeposit,
  getByLiquidationAccount,
  getByPhoneNumber,
  topUpFixedDeposit,
  createFDRequest,
  getFDRequests,
  markFDRequestAsBooked,
  getBookedInvestments,
  getPendingCertificateApprovals,
  approveCertificateApproval,
  rejectCertificateApproval,
  approveFDRequest,
  rejectFDRequest,
} = require("../src/controllers/fixedDepositController");

/* ===============================
   FIXED DEPOSIT (FRONTEND)
================================ */

// CREATE FIXED DEPOSIT
router.post("/create", auth, createFixedDeposit);

// GET FIXED DEPOSIT BY LIQUIDATION ACCOUNT
router.get(
  "/by-liquidation-account/:accountNumber",
  auth,
  getByLiquidationAccount
);

// GET FIXED DEPOSIT BY PHONE NUMBER
router.get(
  "/by-phone/:phoneNumber",
  auth,
  getByPhoneNumber
);

// TOP-UP FIXED DEPOSIT
router.post(
  "/top-up",
  auth,
  topUpFixedDeposit
);

// CREATE FD REQUEST
router.post("/requests", auth, createFDRequest);

// GET PENDING FD REQUESTS
router.get("/requests", auth, getFDRequests);

// MARK FD REQUEST AS BOOKED
router.post("/requests/:id/book", auth, markFDRequestAsBooked);

// APPROVE FD REQUEST
router.post("/requests/:id/approve", auth, approveFDRequest);

// REJECT FD REQUEST
router.post("/requests/:id/reject", auth, rejectFDRequest);

// GET BOOKED INVESTMENTS
router.get("/booked", auth, getBookedInvestments);

// GET PENDING CERTIFICATE APPROVALS
router.get("/approvals", auth, getPendingCertificateApprovals);

// APPROVE CERTIFICATE APPROVAL
router.post("/approvals/:approvalId/approve", auth, approveCertificateApproval);

// REJECT CERTIFICATE APPROVAL
router.post("/approvals/:approvalId/reject", auth, rejectCertificateApproval);


module.exports = router;
