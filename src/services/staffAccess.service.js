const prisma = require("../../prisma/client");
const bcrypt = require("bcrypt");

async function grantAdminAccess(staffId, role_id, grantedBy) {
  const staff = await prisma.users.findUnique({
    where: { id: Number(staffId) },
  });

  if (!staff) {
    throw new Error("Staff not found");
  }

  if (staff.staff_status !== "ACTIVE") {
    throw new Error("Only approved staff can get admin access");
  }

  if (staff.can_access_admin) {
    throw new Error("Staff already has admin access");
  }

  const tempPassword = staff.email;
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  await prisma.users.update({
    where: { id: Number(staffId) },
    data: {
      can_access_admin: true,
      role_id: role_id,
      password: hashedPassword,
      must_change_password: true,
      status: "APPROVED",
    },
  });

  return { success: true };
}

module.exports = {
  grantAdminAccess,
};
