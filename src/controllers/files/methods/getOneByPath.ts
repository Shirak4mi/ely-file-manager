import {
  ensureTrailingSlash,
  extractAndSanitizeFileName,
  extractAndSanitizePath,
  getWorkingFilePath,
  returnActualOSPath,
} from "@/utils/functions.ts";
import { CommonPathBasedToken, InlineQueryDTO } from "@/common/dto's.ts";
import { NotFoundException } from "@/utils/error/index.ts";
import { file as bFile } from "bun";
import { prisma } from "@/db";

import { Elysia, file } from "elysia";

export default new Elysia().decorate("api_key", "" as string).get(
  "get-one-by-path/:path",
  async ({ params: { path }, query: { inline }, set, api_key }) => {
    try {
      const validFilePath = await getWorkingFilePath(decodeURIComponent(path));
      if (!validFilePath) throw new NotFoundException("File not found, please check provided path");

      const actualFile = bFile(validFilePath ?? "");

      const file_name = extractAndSanitizeFileName(actualFile.name ?? "");
      const file_path = returnActualOSPath(ensureTrailingSlash(extractAndSanitizePath(path)));

      const contentType = actualFile.type || "application/octet-stream";
      const file_size = actualFile.size;

      set.headers["Content-disposition"] = inline ? `inline` : `attachment; filename="${actualFile.type}"`;
      set.headers["Content-length"] = (file_size ?? 0).toString();
      set.headers["Content-Type"] = contentType;

      const existingFile = await prisma.metadata.findFirst({ where: { file_name, file_path } });

      console.log({ file_path });

      if (!existingFile)
        await prisma.metadata.create({
          select: { file_path: true, file_name: true, file_mime: true, file_size: true, id: true },
          data: {
            file_name,
            file_path,
            User: { connect: { api_key } },
            Status: { connect: { id: 1 } },
            file_mime: actualFile.type,
            file_size,
          },
        });

      return file(validFilePath);
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { params: CommonPathBasedToken, query: InlineQueryDTO }
);
