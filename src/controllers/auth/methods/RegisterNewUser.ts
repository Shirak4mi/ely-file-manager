import { encryptPassword, generateNanoID, generateRandomSalt } from "@/utils/functions";
import { InternalServerErrorException } from "@/utils/error";
import { successResponseMiddleware } from "@/middlewares";
import { CreateUserDTO } from "../dto";
import { prisma } from "@/db";

import { Elysia } from "elysia";

export default new Elysia().use(successResponseMiddleware).post(
  "Register",
  async ({ body: { username, email, password, type } }) => {
    try {
      const password_salt = generateRandomSalt();

      const newUser = await prisma.users.create({
        data: {
          password: await encryptPassword(password_salt, password),
          Type: { connect: { id: parseInt(type) } },
          Status: { connect: { id: 1 } },
          api_key: generateNanoID(25),
          plain_password: password,
          updated_at: null,
          password_salt,
          username,
          email,
        },
        select: { api_key: true, plain_password: true },
      });

      if (!newUser) throw new InternalServerErrorException("Could not create User, please try again");

      return newUser;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { body: CreateUserDTO }
);
