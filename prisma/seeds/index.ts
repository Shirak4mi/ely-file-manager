import { generateNanoID } from "@/utils/functions.ts";
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

  // const maintenance_app_user = await prisma.users.create({
  //   data: {
  //     api_key: generateNanoID(30),
  //     Type: { connect: { id: 3 } },
  //     Status: { connect: { id: 1 } },
  //     username: "SAD Maintenance User",
  //     email: "sad.maintenance@gruporead<noreply>.com",
  //     plain_password: "SadMaintenanceAccountÑÑÑ!!!@@",
  //     // password,
  //     // password_salt,
  //   },
  // });

  console.log({ user_status, user_type, file_status /* maintenance_app_user */ });
}

(async () => {
  await main();
  await prisma.$disconnect();
  process.exit();
})().then();
