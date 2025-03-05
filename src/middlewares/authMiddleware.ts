import { UnauthorizedException } from "@/utils/error";
import { prisma } from "@/db";

import type { Elysia } from "elysia";

export default function authMiddleware(app: Elysia) {
  return app.decorate("jwt", {} as { verify: Function }).derive(async ({ request, jwt: { verify }, path }) => {
    if (path.includes("/files")) return;

    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) throw new UnauthorizedException("No Bearer Token");
    const token = authHeader.split(" ")[1];
    try {
      const { api_key } = (await verify(token)) as { api_key: string };
      const isValidAPIKey = await prisma.users.findFirst({ where: { api_key }, select: { api_key: true } });
      if (!isValidAPIKey) throw new UnauthorizedException("This is not a valid API KEY");
      return isValidAPIKey;
    } catch (err) {
      console.error(err);
      throw err;
    }
  });
}
