import { encryptPassword, generateNanoID, generateRandomSalt, generateToken } from "@/utils/functions.ts";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user_status = await prisma.user_status.createMany({
    data: [{ name: "Active" }, { name: "Password Reset" }, { name: "Deleted" }],
    skipDuplicates: true,
  });

  const user_type = await prisma.user_type.createMany({
    data: [{ name: "Application" }, { name: "User" }, { name: "Maintainer" }],
    skipDuplicates: true,
  });

  const file_status = await prisma.file_status.createMany({
    data: [{ name: "Active" }, { name: "Deleted" }],
    skipDuplicates: true,
  });

  const password_salt = generateRandomSalt();
  const hashed_token = generateToken();

  const maintenance_app_user = await prisma.users.create({
    data: {
      password: await encryptPassword(password_salt, "SadMaintenanceAccountÑÑÑ!!!@@"),
      email: "sad.maintenance@gruporead<noreply>.com",
      plain_password: "SadMaintenanceAccountÑÑÑ!!!@@",
      username: "SAD Maintenance User",
      Status: { connect: { id: 1 } },
      Type: { connect: { id: 3 } },
      api_key: generateNanoID(30),
      password_salt,
    },
  });

  console.log({ user_status, user_type, file_status, maintenance_app_user });
}

(async () => {
  await main();
  await prisma.$disconnect();
  process.exit();
})().then();
