import { UnauthorizedException } from "@/utils/error";
import { jwt_exp, jwt_secret } from "@/utils/env";
import { loginUserDTO } from "../dto";
import { jwt } from "@elysiajs/jwt";
import { prisma } from "@/db";

import { Elysia } from "elysia";
import { logger } from "@/utils/functions";

export default new Elysia().use(jwt({ name: "jwt", secret: jwt_secret, exp: jwt_exp ?? "365d" })).post(
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
