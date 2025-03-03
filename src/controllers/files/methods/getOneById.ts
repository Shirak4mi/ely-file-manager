import { isDirectory, returnActualOSPath } from "@/utils/functions.ts";
import { IdBasedTokenDTO, InlineQueryDTO } from "@/common/dto's.ts";
import { NotFoundException } from "@/utils/error";
import { file as bFile } from "bun";
import { prisma } from "@/db";

import { Elysia } from "elysia";

export default new Elysia().decorate("api_key", "" as string).get(
  "get-one-by-id/:id",
  async ({ params: { id }, query: { inline }, set }) => {
    try {
      const doesFileExists = await prisma.metadata.findFirst({
        select: { file_path: true, file_name: true },
        where: { id },
      });

      if (!doesFileExists) throw new NotFoundException("File not found");

      const { file_path, file_name } = doesFileExists;

      const basePath = returnActualOSPath(file_path);

      const totalFilePath = (await isDirectory(basePath)) ? basePath + file_name : file_path;

      const actualFile = bFile(totalFilePath);
      const contentType = actualFile.type || "application/octet-stream";
      const cntnLength = actualFile.size;

      set.headers["Content-disposition"] = inline ? "inline" : `attachment; filename="${actualFile.name}"`;
      set.headers["Content-length"] = cntnLength;
      set.headers["Content-Type"] = contentType;

      return actualFile;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { params: IdBasedTokenDTO, query: InlineQueryDTO }
);
