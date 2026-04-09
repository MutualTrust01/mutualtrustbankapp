const {
  getAccountOfficers,
  getAccountOfficerByStaffCode,
} = require("../core/accountOfficer.service");

/* ===============================
   GET ALL OFFICERS
================================ */
exports.fetchAccountOfficers = async (req, res) => {
  try {
    const data = await getAccountOfficers();

    if (!Array.isArray(data)) {
      return res.status(500).json({
        success: false,
        message: "Unexpected core response format",
      });
    }

    return res.json({
      success: true,
      data: data.map(o => ({
        code: o.Code,
        name: o.Name,
        branch: o.Branch,
        gender: o.Gender,
        phone: o.PhoneNumber,
        email: o.Email,
        id: o.Id,
      })),
    });
  } catch (error) {
    console.error(
      "❌ Account Officers Error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch account officers",
    });
  }
};

/* ===============================
   GET OFFICER BY STAFF CODE
================================ */
exports.fetchAccountOfficerByStaffCode = async (req, res) => {
  try {
    const { staffCode } = req.params;

    if (!staffCode) {
      return res.status(400).json({
        success: false,
        message: "staffCode is required",
      });
    }

    const data = await getAccountOfficerByStaffCode(staffCode);

    if (!data?.IsSuccessful || !data?.Message) {
      return res.status(404).json({
        success: false,
        message: "Account officer not found",
      });
    }

    const officer = data.Message;

    return res.json({
      success: true,
      data: {
        code: officer.Code,
        name: officer.Name,
        branch: officer.Branch,
        gender: officer.Gender,
        phone: officer.PhoneNumber,
        email: officer.Email,
        id: officer.Id,
      },
    });
  } catch (error) {
    console.error(
      "❌ Account Officer By Code Error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch account officer",
    });
  }
};
