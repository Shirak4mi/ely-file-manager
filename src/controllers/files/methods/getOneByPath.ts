import { CommonPathBasedToken, InlineQueryDTO } from "@/common/dto's.ts";
import { getWorkingFilePath } from "@/utils/functions.ts";
import { NotFoundException } from "@/utils/error";
import { file as bFile } from "bun";

import { Elysia, file } from "elysia";

export default new Elysia().get(
  "get-one-by-path/:path",
  async ({ params: { path }, query: { inline }, set }) => {
    try {
      const validFilePath = await getWorkingFilePath(decodeURIComponent(path));
      if (!validFilePath) throw new NotFoundException("File not found, please check provided path");

      const actualFile = bFile(validFilePath ?? "");
      const contentType = actualFile.type || "application/octet-stream";
      const fileSize = actualFile.size;

      set.headers["Content-disposition"] = inline ? `inline` : `attachment; filename="${actualFile.type}"`;
      set.headers["Content-Type"] = contentType;
      set.headers["Content-length"] = fileSize;

      return file(validFilePath);
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { params: CommonPathBasedToken, query: InlineQueryDTO }
);
