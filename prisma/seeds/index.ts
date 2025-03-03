import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

(async () => {
  const user_status = await prisma.user_Status.createMany({
    data: [
      { name: "Active" },
      { name: "Password Reset" },
      { name: "Deleted" },
    ],
    skipDuplicates: true,
  });
})().then();
