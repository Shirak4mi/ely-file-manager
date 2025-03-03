import { convertIPv6ToIPv4, getFileExtension, isDirectory, logger, returnActualOSPath } from "@/utils/functions";
import { IdBasedTokenDTO, InlineQueryDTO } from "@/common/dto's";
import { NotFoundException } from "@/utils/error";
import { file as bFile } from "bun";
import { prisma } from "@/db";

import { Elysia } from "elysia";

export default new Elysia().decorate("apiKey", "" as string).get(
  "get-one-by-id/:id",
  async ({ params: { id }, query: { inline }, set, apiKey, request: req, server }) => {
    try {
      const doesFileExists = await prisma.metadata.findFirst({ where: { id }, select: { path: true, name: true } });

      if (!doesFileExists) throw new NotFoundException("File not found");

      const { path, name } = doesFileExists;

      const basePath = returnActualOSPath(path);
      const totalFilePath = (await isDirectory(basePath)) ? basePath + name : path;
      const actualFile = bFile(totalFilePath);
      const contentType = actualFile.type || "application/octet-stream";
      const cntnLength: string = (actualFile.length as number).toString();

      set.headers["Content-disposition"] = inline ? `inline` : `attachment; filename="${actualFile.type}"`;
      set.headers["Content-length"] = cntnLength;
      set.headers["Content-Type"] = contentType;

      const requestedBy = await prisma.users.findFirst({ where: { apiKey }, select: { id: true, name: true, email: true } });

      const requestedToken =
        req.headers.get("authorization") !== null ? (req.headers.get("authorization") ?? " ").split(" ")[1] : "N/A";

      logger("INFO", "GET ONE FILE BY ID", {
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
  { params: IdBasedTokenDTO, query: InlineQueryDTO }
);
