import { UnauthorizedException } from "@/utils/error";
import { prisma } from "@/db";

import { Elysia } from "elysia";

export const authMiddleware = (app: Elysia) => {
  return app.decorate("jwt", {} as { verify: Function }).derive(async ({ request, jwt: { verify } }) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) throw new UnauthorizedException("No Bearer Token");
    const token = authHeader.split(" ")[1];
    try {
      const { apiKey } = (await verify(token)) as { apiKey: string };
      const isValidAPIKey = await prisma.users.findFirst({ where: { apiKey }, select: { apiKey: true } });
      if (!isValidAPIKey) throw new UnauthorizedException("This is not a valid API KEY");
      return isValidAPIKey;
    } catch (err) {
      console.error(err);
      throw err;
    }
  });
};
