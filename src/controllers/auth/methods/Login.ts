import { UnauthorizedException } from "@/utils/error";
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
      const { id: _id = "", api_key = "", password: encrypt, password_salt: salt } = isValidUser;

      const isValidPassword = await Bun.password.verify(salt + password, encrypt, "argon2d");

      if (!isValidPassword) throw new UnauthorizedException("Invalid Credentials");

      const token = await sign({ _id, api_key });

      return { token };
    } catch (err) {
      throw err;
    }
  },
  { body: loginUserDTO }
);
