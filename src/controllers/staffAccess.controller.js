const staffAccessService = require("../services/staffAccess.service");

async function grantAdminAccess(req, res) {
  try {
    const { id } = req.params;
    const { role_id } = req.body;

    if (!role_id) {
      return res.status(400).json({
        success: false,
        message: "Role is required",
      });
    }

    await staffAccessService.grantAdminAccess(
      id,
      role_id,
      req.user?.id
    );

    return res.json({
      success: true,
      message: "Admin access granted successfully",
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  grantAdminAccess,
};
