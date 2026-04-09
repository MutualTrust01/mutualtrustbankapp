const express = require("express");
const router = express.Router();

const controller = require("../src/controllers/customerLoanService.controller");

/*
CUSTOMER LOAN SERVICE ACCESS
*/

router.post("/request-access", controller.requestAccess);
router.post("/verify-otp", controller.verifyOTP);
router.post("/verify-activation", controller.verifyActivation);
router.post("/resend-activation", controller.resendActivation);
/*
CUSTOMER LOAN DATA
*/

router.post("/loans", controller.getCustomerLoans);
router.post("/repayment-schedule", controller.getRepaymentSchedule);
router.post("/balance", controller.getLoanBalance);
router.post("/statement", controller.getLoanStatement);

module.exports = router;
