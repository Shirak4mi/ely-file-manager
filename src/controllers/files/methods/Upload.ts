import {
  createFilePathIfDoesntExists,
  extractAndSanitizeFileName,
  extractAndSanitizePath,
  ensureTrailingSlash,
  returnActualOSPath,
  createFileOnsFS,
} from "@/utils/functions.ts";
import { ImATeapotException } from "@/utils/error";
import { FileUploadDTO } from "@/common/dto's";
import { file as bFile } from "bun";
import { prisma } from "@/db";

import { Elysia } from "elysia";

export default new Elysia().decorate("api_key", "" as string).post(
  "upload",
  async ({ body: { path, file }, api_key }) => {
    try {
      const workingFP = await createFilePathIfDoesntExists(path);
      const createdFile = await createFileOnsFS(workingFP, file);

      if (!createdFile) throw new ImATeapotException("There was an error uploading the file");

      const totalFilePath = returnActualOSPath(ensureTrailingSlash(path) + file.name);
      const actualFile = bFile(totalFilePath ?? "");

      // Actual File MetaData
      const file_size = actualFile.size;

      const registerFile = await prisma.metadata.create({
        select: { file_path: true, file_name: true, file_mime: true, file_size: true, id: true },
        data: {
          file_name: extractAndSanitizeFileName(actualFile.name ?? ""),
          file_path: extractAndSanitizePath(totalFilePath),
          User: { connect: { api_key } },
          Status: { connect: { id: 1 } },
          file_mime: actualFile.type,
          file_size,
        },
      });

      console.log({ registerFile });

      return registerFile;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { body: FileUploadDTO }
);
