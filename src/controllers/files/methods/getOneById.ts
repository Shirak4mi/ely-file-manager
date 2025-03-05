import { ensureTrailingSlash, isDirectory, returnActualOSPath, returnActualOSPathss } from "@/utils/functions.ts";
import { IdBasedTokenDTO, InlineQueryDTO } from "@/common/dto's.ts";
import { NotFoundException } from "@/utils/error";
import { file as bFile } from "bun";
import { prisma } from "@/db";

import { Elysia } from "elysia";

export default new Elysia().get(
  "get-one-by-id/:id",
  async ({ params: { id }, query: { inline }, set }) => {
    try {
      const doesFileExists = await prisma.metadata.findFirst({
        select: { file_path: true, file_name: true, status_id: true },
        where: { id },
      });

      if (!doesFileExists) throw new NotFoundException("File not found");

      const { file_path, file_name, status_id } = doesFileExists;

      if (status_id !== 1) throw new NotFoundException("The file has been (soft) deleted");

      const basePathssx = returnActualOSPath(ensureTrailingSlash(file_path));
      const basePathss = returnActualOSPathss(file_path);
      const basePath = returnActualOSPath(file_path);

      console.log({ file_path, basePath, basePathss, file_name, basePathssx });

      const totalFilePath = (await isDirectory(basePath)) ? basePath + file_name : file_path;

      console.log({ basePath, totalFilePath, tbp: await isDirectory(basePath) });

      const actualFile = bFile(totalFilePath);
      const contentType = actualFile.type || "application/octet-stream";
      const cntnLength = actualFile.size;

      set.headers["Content-disposition"] = inline ? "inline" : `attachment; filename="${actualFile.name}"`;
      set.headers["Content-length"] = (cntnLength ?? 0).toString();
      set.headers["Content-Type"] = contentType;

      return actualFile;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { params: IdBasedTokenDTO, query: InlineQueryDTO }
);
