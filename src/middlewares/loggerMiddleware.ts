import { convertIPv6ToIPv4, getFileExtension, logger } from "@/utils/functions";
import { prisma } from "@/db";

import type { Elysia } from "elysia";

export default function loggerMiddleware(app: Elysia) {
  return app
    .decorate("api_key", "" as string)
    .derive(async ({ request: { headers, method, url }, response, server, api_key }) => {
     
      const requestedBy =
        api_key === ""
          ? null
          : await prisma.users.findFirst({
              select: { id: true, username: true, email: true },
              where: { api_key },
            });

      const requestedToken =
        headers.get("authorization") !== null ? (headers.get("authorization") ?? " ").split(" ")[1] : "N/A";

      const logMetadata = {
        requestIpFrom: convertIPv6ToIPv4(server ? server.requestIP.toString() : "N/A"),
        requestUserAgent: headers.get("user-agent"),
        requestPath: url,
        Method: method,
        requestedData: {
          // file: {
          //   extension: getFileExtension(actualFile.name ?? ""),
          //   size: (await actualFile.stat()).size,
          //   type: actualFile.type,
          //   name: actualFile.name,
          // },
        },
        requestedToken,
        requestStatus: 200,
        requestAt: new Date(),
        response: { message: ["File retrieved successfully"], statusCode: 200 },
        requestedBy,
      };

      logger("INFO", "GET ONE FILE BY PATH", logMetadata);
    });
}
