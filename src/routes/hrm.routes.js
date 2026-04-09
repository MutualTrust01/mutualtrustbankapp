const express = require("express");
const router = express.Router();
const prisma = require("../../prisma/client");
const authMiddleware = require("../../middleware/auth");

router.get("/staff-by-email", authMiddleware, async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const staff = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        gender: true,
        department: true,
        staffStatus: true,
        canAccessAdmin: true,
      },
    });

    if (!staff) {
      return res.json({
        success: false,
        message: "Staff not found",
      });
    }

    // 🚫 If not ACTIVE
    if (staff.staffStatus !== "ACTIVE") {
      return res.json({
        success: false,
        message: "Staff is not active",
      });
    }

    // 🚫 If already admin
    if (staff.canAccessAdmin) {
      return res.json({
        success: false,
        message: "This staff already has admin access",
      });
    }

    // ✅ Allowed to proceed
// ✅ Allowed to proceed
return res.json({
  success: true,
  staff: {
    id: staff.id,
    firstName: staff.firstName,
    lastName: staff.lastName,
    email: staff.email,
    phoneNumber: staff.phoneNumber,
    gender: staff.gender,
    department: staff.department,
    alreadyExists: staff.canAccessAdmin
  }
});    

  } catch (error) {
    console.error("HRM search error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;
