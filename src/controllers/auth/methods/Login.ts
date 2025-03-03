import { UnauthorizedException } from "@/utils/error";
import { logger } from "@/utils/functions";
import { loginUserDTO } from "../dto";
import { prisma } from "@/db";

import { Elysia } from "elysia";

export default new Elysia().decorate("jwt", {} as { sign: Function }).post(
  "Login",
  async ({ body: { email, password }, jwt: { sign } }) => {
    try {
      const isValidUser = await prisma.users.findFirst({
        select: { api_key: true, id: true, password: true, password_salt: true },
        where: { email },
      });

      if (!isValidUser) throw new UnauthorizedException("Invalid Credentials");
      const { id: _id = "", api_key = "", password: uPword, password_salt: pwsalt } = isValidUser;

      console.log({ pwsalt, uPword, password, unh: await Bun.password.verify(password, pwsalt + uPword, "argon2d") });

      const isValidPassword = await Bun.password.verify(password, pwsalt + uPword, "argon2d");

      if (!isValidPassword) throw new UnauthorizedException("Invalid Credentials");

      const token = await sign({ _id, api_key });

      logger("INFO", "User Logged");

      return { token };
    } catch (err) {
      throw err;
    }
  },
  { body: loginUserDTO }
);
