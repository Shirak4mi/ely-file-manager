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

export default new Elysia().post(
  "upload",
  async ({ body: { path, file }, request: req, server, set }) => {
    try {
      const workingFP = await createFilePathIfDoesntExists(path);
      const createdFile = await createFileOnsFS(workingFP, file);
      if (!createdFile) throw new ImATeapotException("There was an error uploading the file");

      const totalFilePath = returnActualOSPath(path + file.name);
      const actualFile = bFile(totalFilePath ?? "");

      // Actual File MetaData
      const contentType = actualFile.type || "application/octet-stream";
      const fileSize = actualFile.size;

      set.headers["Content-Type"] = contentType;
      set.headers["Content-length"] = fileSize;

      // const requestedBy = await prisma.users.findFirst({
      //   select: { id: true, username: true, email: true },
      //   where: { api_key },
      // });

      // const registeredFile = await prisma.metadata.create({
      //   select: { file_path: true, file_name: true, file_mime: true, file_size: true },
      //   data: {
      //     file_name: actualFile.name ?? "",
      //     User: { connect: { api_key } },
      //     Status: { connect: { id: 1 } },
      //     file_mime: actualFile.type,
      //     file_size: actualFile.size,
      //     file_path: totalFilePath,
      //   },
      // });

      // const requestedToken =
      //   req.headers.get("authorization") !== null ? (req.headers.get("authorization") ?? " ").split(" ")[1] : "N/A";

      // logger("INFO", "File Upload", {
      //   requestedBy,
      //   requestIpFrom: convertIPv6ToIPv4(server ? server.requestIP.toString() : "N/A"),
      //   requestUserAgent: req.headers.get("user-agent"),
      //   requestedResource: req.method,
      //   requestPath: req.url,
      //   Method: req.method,
      //   requestedData: {
      //     file: {
      //       extension: getFileExtension(actualFile.name ?? ""),
      //       size: (await actualFile.stat()).size,
      //       type: actualFile.type,
      //       name: file.name,
      //     },
      //   },
      //   requestedToken,
      //   requestStatus: 200,
      //   requestAt: new Date(),
      //   response: { message: ["File retrieved successfully"], statusCode: 200 },
      // });

      // return registeredFile;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { body: FileUploadDTO }
);
