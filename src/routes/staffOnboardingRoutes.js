const router = require("express").Router();
const ctrl = require("../controllers/staffOnboardingController");

const auth = require("../../middleware/auth");
const upload = require("../../middleware/uploadDocument");
const uploadExcel = require("../../middleware/uploadBulkStaff");

/**
 * ==========================
 * STAFF ONBOARDING ROUTES
 * ==========================
 */


/* ==========================
   SECURED FILE UPLOAD ROUTES
   ========================== */

/* Upload onboarding document (CV / Interview sheet) */
router.post(
  "/upload-document",
  auth,                     // ✅ AUTH FIRST
  upload.single("file"),    // ✅ THEN MULTER
  ctrl.uploadStaffDocument
);

/* Bulk upload staff via Excel/CSV */
router.post(
  "/bulk-upload",
  auth,                          // ✅ AUTH FIRST
  uploadExcel.single("file"),    // ✅ THEN MULTER
  ctrl.bulkUploadStaff
);


/* ==========================
   AUTHENTICATED ROUTES
   ========================== */

router.use(auth);


/* Create staff */
router.post(
  "/",
  ctrl.createStaff
);


/* View onboarding list */
router.get(
  "/",
  ctrl.getAllStaff
);


/* Approve onboarding */
router.post(
  "/approve",
  ctrl.approveStaff
);


/* Reject onboarding */
router.post(
  "/reject",
  ctrl.rejectStaff
);


/* Reopen rejected staff */
router.post(
  "/reopen",
  ctrl.reopenStaff
);


/* Onboarding history */
router.get(
  "/:staffId/history",
  ctrl.getOnboardingHistory
);


/* Grant admin access */
router.put(
  "/:staffId/grant-admin",
  ctrl.grantAdminAccess
);


module.exports = router;
