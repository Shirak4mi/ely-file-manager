import { UnauthorizedException } from "@/utils/error";
import { logger } from "@/utils/functions";
import { loginUserDTO } from "../dto";
import { prisma } from "@/db";

import { Elysia } from "elysia";

import type { JWTOption } from "@elysiajs/jwt";

export default new Elysia().decorate("jwt", {} as { sign: Function }).post(
  "Login",
  async ({ body: { email, password }, jwt: { sign } }) => {
    try {
      const isValidUser = await prisma.users.findFirst({
        select: { apiKey: true, id: true, password: true },
        where: { email },
      });

      if (!isValidUser) throw new UnauthorizedException("Invalid Credentials");
      const { id: _id = "", apiKey = "", password: uPword } = isValidUser;

      const isValidPassword = await Bun.password.verify(password, uPword, "bcrypt");

      if (!isValidPassword) throw new UnauthorizedException("Invalid Credentials");

      const token = await sign({ _id, apiKey });

      logger("INFO", "User Logged");

      return { token };
    } catch (err) {
      throw err;
    }
  },
  { body: loginUserDTO }
);
