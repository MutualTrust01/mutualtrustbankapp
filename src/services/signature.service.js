// backend/src/services/signature.service.js

const prisma = require("../lib/prisma");

/**
 * ===============================
 * SAVE SIGNATURE
 * ===============================
 * Stores certificate-grade base64 PNG
 */
exports.saveSignature = async ({ userId, base64 }) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  if (!base64 || !base64.startsWith("data:image/png;base64,")) {
    throw new Error("Invalid signature format");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      signaturePath: base64, // Prisma field → DB column
    },
  });

  return base64;
};

/**
 * ===============================
 * GET SIGNATURE
 * ===============================
 */
exports.getSignature = async (userId) => {
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      signaturePath: true,
    },
  });

  return user?.signaturePath || null;
};
