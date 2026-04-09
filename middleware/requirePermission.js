module.exports = (permission) => {
  return (req, res, next) => {
    const permissions = req.user?.permissions || [];
    const isSuperAdmin =
      req.user?.role === "Super Admin" ||
      permissions.includes("*");

    if (isSuperAdmin || permissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: "Permission denied",
    });
  };
};
