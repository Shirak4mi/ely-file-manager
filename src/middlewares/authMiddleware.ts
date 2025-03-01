import { UnauthorizedException } from "@/utils/error";
import { jwt_exp, jwt_secret } from "@/utils/env";
import { jwt } from "@elysiajs/jwt";
import { prisma } from "@/db";

import { Elysia } from "elysia";

export const authMiddleware = (app: Elysia) => {
  return app
    .use(jwt({ name: "jwt", secret: jwt_secret, exp: jwt_exp ?? "365d" }))
    .derive(async ({ request, jwt: { verify } }) => {
      // Get the Authorization header
      const authHeader = request.headers.get("Authorization");
      // Check if header exists and starts with "Bearer "
      if (!authHeader || !authHeader.startsWith("Bearer ")) throw new UnauthorizedException("No Bearer Token");
      // Extract the token
      const token = authHeader.split(" ")[1];
      try {
        const { apiKey } = (await verify(token)) as { apiKey: string };

        const isValidAPIKey = await prisma.users.findFirst({ where: { apiKey } });

        if (!isValidAPIKey) throw new UnauthorizedException("This is not a valid API KEY");

        return isValidAPIKey;
      } catch (err) {
        console.error(err);
        throw err;
      }
    });
};
