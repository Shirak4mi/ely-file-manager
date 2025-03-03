import { convertIPv6ToIPv4, getFileExtension, getWorkingFilePath, logger } from "@/utils/functions.ts";
import { CommonPathBasedToken, InlineQueryDTO } from "@/common/dto's.ts";
import { file as bFile } from "bun";
import { prisma } from "@/db";

import { Elysia, file } from "elysia";

export default new Elysia().decorate("api_key", "" as string).get(
  "get-one-by-path/:path",
  async ({ params: { path }, query: { inline }, set, server, request: req, api_key }) => {
    try {
      const validFilePath = await getWorkingFilePath(decodeURIComponent(path));
      const actualFile = bFile(validFilePath ?? "");
      const cntnLength: string = (actualFile.length as number).toString();

      const contentType = actualFile.type || "application/octet-stream";

      set.headers["Content-disposition"] = inline ? `inline` : `attachment; filename="${actualFile.type}"`;
      set.headers["Content-length"] = cntnLength;
      set.headers["Content-Type"] = contentType;

      const requestedBy = await prisma.users.findFirst({
        select: { id: true, username: true, email: true },
        where: { api_key },
      });

      const requestedToken =
        req.headers.get("authorization") !== null ? (req.headers.get("authorization") ?? " ").split(" ")[1] : "N/A";

      logger("INFO", "GET ONE FILE BY PATH", {
        requestedBy,
        requestIpFrom: convertIPv6ToIPv4(server ? server.requestIP.toString() : "N/A"),
        requestUserAgent: req.headers.get("user-agent"),
        requestedResource: req.method,
        requestPath: req.url,
        Method: req.method,
        requestedData: {
          file: {
            extension: getFileExtension(actualFile.name ?? ""),
            size: (await actualFile.stat()).size,
            type: actualFile.type,
            name: actualFile.name,
          },
        },
        requestedToken,
        requestStatus: 200,
        requestAt: new Date(),
        response: { message: ["File retrieved successfully"], statusCode: 200 },
      });

      return actualFile;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { params: CommonPathBasedToken, query: InlineQueryDTO }
);
