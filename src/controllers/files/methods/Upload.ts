import { ImATeapotException } from "@/utils/error";
import { FileUploadDTO } from "@/common/dto's";
import { file as bFile } from "bun";
import {
  createFilePathIfDoesntExists,
  returnActualOSPath,
  convertIPv6ToIPv4,
  getFileExtension,
  createFileOnsFS,
  logger,
} from "@/utils/functions.ts";

import { Elysia } from "elysia";
import { prisma } from "@/db";

export default new Elysia().decorate("apiKey", "" as string).post(
  "upload",
  async ({ body: { path, file }, apiKey, request: req, server, set }) => {
    try {
      const workingFP = await createFilePathIfDoesntExists(path);
      const createdFile = await createFileOnsFS(workingFP, file);

      if (!createdFile) throw new ImATeapotException("There was an error uploading the file");

      const totalFilePath = returnActualOSPath(path + file.name);
      const actualFile = bFile(totalFilePath ?? "");
      const contentType = actualFile.type || "application/octet-stream";

      set.headers["Content-length"] = actualFile.size;
      set.headers["Content-Type"] = contentType;

      const requestedBy = await prisma.users.findFirst({ where: { apiKey }, select: { id: true, name: true, email: true } });

      const registeredFile = await prisma.files.create({
        data: {
          apiKey,
          name: file.name,
          path: totalFilePath,
          createdAt: new Date(),
          extension: getFileExtension(file.name),
          size: file.size,
          softDelete: false,
          type: file.type,
          updatedAt: new Date(),
          uploadedByPath: false,
        },
        select: { path: true, name: true, extension: true, size: true },
      });

      const requestedToken =
        req.headers.get("authorization") !== null ? (req.headers.get("authorization") ?? " ").split(" ")[1] : "N/A";

      logger("INFO", "File Upload", {
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
            name: file.name,
          },
        },
        requestedToken,
        requestStatus: 200,
        requestAt: new Date(),
        response: { message: ["File retrieved successfully"], statusCode: 200 },
      });
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { body: FileUploadDTO }
);
