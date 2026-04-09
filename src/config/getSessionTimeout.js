import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getSessionTimeout = async (type = "admin") => {
  const settings = await prisma.system_settings.findFirst({
    orderBy: { updated_at: "desc" },
    select: { session_config: true },
  });

  const session = settings?.session_config || {};

  switch (type) {
    case "admin":
      return session.adminTimeout ?? 15;
    case "mobile":
      return session.mobileTimeout ?? 10;
    case "internet":
      return session.internetBankingTimeout ?? 10;
    default:
      return 15;
  }
};
