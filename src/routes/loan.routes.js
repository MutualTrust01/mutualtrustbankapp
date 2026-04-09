const express = require("express");
const router = express.Router();

/* ===============================
   CONTROLLERS
================================ */
const loanController = require("../controllers/loan.controller");

const loanAdminUpload = require("../../middleware/loanadminapproval");

const {
  verifyBVNForLoan,
  getCoreCustomerByBVN,
} = require("../controllers/loanBvnVerification.controller");

const {
  verifyNINForLoan,
} = require("../controllers/loanNinVerification.controller");

const {
  verifyFaceForLoan,
} = require("../controllers/verifyFaceForLoan.controller");


const {
  createPublicLoan,
  getPublicRelationshipManager,
  listPublicRelationshipManagers,
  checkPayrollEligibility
} = require("../controllers/publicLoan.controller");

const {
  getPublicLoanProducts,
} = require("../controllers/publicLoanProducts.controller");

const {
  getLoanSession,
} = require("../controllers/loanSession.controller");

/* ===============================
   MIDDLEWARE
================================ */
const auth = require("../../middleware/auth");
const loanFilesUpload = require("../../middleware/loanFilesUpload");

/* =====================================================
   PUBLIC LOAN ONBOARDING (NO AUTH)
===================================================== */

router.get("/public/relationship-manager/:id", getPublicRelationshipManager);
router.get("/public/session/:loanSessionId", getLoanSession);
router.get("/public/loan-products", getPublicLoanProducts);
router.get("/public/relationship-managers", listPublicRelationshipManagers);
router.get("/public/payroll-check/:accountNumber", checkPayrollEligibility);


router.post("/verify-bvn", verifyBVNForLoan);
router.post("/verify-nin", verifyNINForLoan);
router.post("/verify-bvn-face", verifyFaceForLoan);
router.post("/verify-nin-face", verifyFaceForLoan);

router.post(
  "/public/create",
  loanFilesUpload.any(),
  createPublicLoan
);

/* =====================================================
   AUTHENTICATED LOAN ROUTES
===================================================== */

// ================= BASIC LOAN OPERATIONS =================

router.post("/create", auth, loanController.createLoan);
router.post("/repay", auth, loanController.repayLoan);

router.get("/customer/:customerId", auth, loanController.getLoansByCustomer);


router.get(
  "/:loanId/repayment-schedule-by-loan-id",
  auth,
  loanController.getLoanRepaymentScheduleByLoanId
);

router.get("/:loanAccountNumber/repayment-schedule",
  loanController.getRepaymentSchedule
);

router.get("/:loanAccountNumber/balance",
  loanController.getLoanBalance
);


router.get("/:loanAccountNumber/statement",
  auth,
  loanController.getLoanStatement
);

// ================= ACCOUNT OPENING =================

router.post(
  "/customers/:customerId/open-account",
  auth,
  loanController.openAccountForCustomer
);

// ================= LOAN APPROVALS LIST =================

router.get("/approvals",
  auth,
  loanController.getPendingLoanApprovals
);


// ================= LOAN OPERATIONS =================
router.get(
  "/operational",
  auth,
  loanController.getOperationalLoans
);


router.get(
  "/active",
  auth,
  loanController.getActiveLoans
);

// ================= LOAN TRANSFERS (NEW - MUST BE BEFORE :loanId) =================
router.get(
  "/loan-transfers",
  auth,
  loanController.getLoanTransfers
);

// ================= CORE BANKING (DIRECT BVN LOOKUP) =================

router.get("/core/:bvn",
  auth,
  getCoreCustomerByBVN
);

/* =====================================================
   LOAN ID–BASED ACTIONS (VERY IMPORTANT ORDER)
===================================================== */

// ---------- Approval Actions ----------
router.post("/:loanId/approve",
  auth,
  loanAdminUpload.array("attachments"),
  loanController.approveLoan
);


router.post("/:loanId/return",
  auth,
  loanAdminUpload.array("attachments"),
  loanController.returnLoan
);

router.post("/:loanId/reject",
  auth,
  loanAdminUpload.array("attachments"),
  loanController.rejectLoan
);


// ================= RM DASHBOARD =================
router.get(
  "/my-requests",
  auth,
  loanController.getMyLoanRequests
);


// ---------- Core Verification ----------
router.get("/:loanId/core-check",
  auth,
  loanController.checkCoreCustomerByLoanId
);

// ---------- Salary Account Validation ----------
router.get(
  "/:loanId/validate-salary",
  auth,
  loanController.validateSalaryAccount
);

// ---------- Core Loan Operations ----------
router.get("/:loanId/core-preview",
  auth,
  loanController.previewCoreLoanPayload
);

router.post("/:loanId/create-core",
  auth,
  loanController.createLoanInCore
);

// ---------- FULL LOAN LIFECYCLE ----------
router.post(
  "/:loanId/process",
  auth,
  loanController.processLoanLifecycle
);

// ---------- LOAN TRANSFER (DISBURSEMENT) ----------
router.post(
  "/:loanId/transfer",
  auth,
  loanController.transferLoan
);

router.get(
  "/:loanId/transfer-preview",
  auth,
  loanController.getTransferPreview
);

// ================= SINGLE LOAN FETCH (ALWAYS LAST) =================
router.get(
  "/:loanId",
  auth,
  (req, res, next) => {

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(req.params.loanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID format",
      });
    }

    next();
  },
  loanController.getLoanById
);

module.exports = router;
