import { convertIPv6ToIPv4, getFileExtension, logger } from "@/utils/functions";
import { prisma } from "@/db";

import type { Elysia } from "elysia";

export default function loggerMiddleware(app: Elysia) {
  return app
    .decorate("api_key", "" as string)
    .derive(async ({ request: { headers, method, url }, response, server, api_key, body, params, query }) => {
      const requestedBy =
        api_key.length &&
        (await prisma.users.findFirst({
          select: { id: true, username: true, email: true },
          where: { api_key },
        }));

      const requestedToken =
        headers.get("authorization") !== null ? (headers.get("authorization") ?? " ").split(" ")[1] : "N/A";

      const requestQuery = Object.values(query ?? {}).length > 0 ? query : null;
      const requestParams = Object.values(params ?? {}).length ? params : null;
      const responseData = response ? response : null;
      const requestedData = body ? body : null;

      console.log({ rbTypeof: typeof body });

      const logMetadata = {
        requestIpFrom: convertIPv6ToIPv4(server ? server.requestIP.toString() : "N/A"),
        requestUserAgent: headers.get("user-agent"),
        requestAt: new Date(),
        requestMethod: method,
        requestStatus: 200,
        requestPath: url,
        requestedToken,
        requestedData,
        requestParams,
        requestQuery,
        responseData,
        requestedBy,
      };

      logger("INFO", "GET ONE FILE BY PATH", logMetadata);
    });
}
