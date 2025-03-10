import { encryptPassword, generateNanoID, generateRandomSalt } from "@/utils/functions.ts";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tables_transact =
    (
      (await prisma.$transaction([
        prisma.file_status.count(),
        prisma.user_status.count(),
        prisma.user_type.count(),
        prisma.users.count(),
      ])) ?? []
    ).reduce((old, curr) => old + curr, 0) > 0;

  if (tables_transact) {
    console.info("Migrations could not run due to the data beign already there");
    return;
  }

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

  const plain_password = "SadMaintenanceAccountÑÑÑ!!!@@";
  const password_salt = generateRandomSalt();

  const maintenance_app_user = await prisma.users.create({
    data: {
      password: await encryptPassword(password_salt, plain_password),
      username: "SAD Maintenance User",
      email: "sad.maintenance@sad.com",
      Status: { connect: { id: 1 } },
      Type: { connect: { id: 3 } },
      api_key: generateNanoID(30),
      updated_at: null,
      plain_password,
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
