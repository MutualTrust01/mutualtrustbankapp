const express = require("express");
const router = express.Router();

/*
|--------------------------------------------------------------------------
| Complaint Controllers
|--------------------------------------------------------------------------
| Ensure ALL used controllers are imported here.
*/
const {
  createComplaint,
  getAllComplaints,
  assignComplaint,
  resolveComplaint,
  reopenComplaint,
  getComplaintHistory
} = require("../controllers/complaintController");

/*
|--------------------------------------------------------------------------
| CUSTOMER ROUTES
|--------------------------------------------------------------------------
*/

// Create a new complaint
router.post("/", createComplaint);

/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
*/

// Get all complaints
router.get("/admin/all", getAllComplaints);

// Assign complaint to an admin/staff
router.put("/admin/:id/assign", assignComplaint);

// Resolve a complaint
router.put("/admin/:id/resolve", resolveComplaint);

// Reopen a resolved complaint
router.put("/admin/:id/reopen", reopenComplaint);

// Get complaint history (timeline/audit)
router.get("/admin/:id/history", getComplaintHistory);

module.exports = router;
