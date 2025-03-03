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

      const fileSize: string = (actualFile.size ?? 0).toString();

      const contentType = actualFile.type || "application/octet-stream";

      set.headers["Content-disposition"] = inline ? `inline` : `attachment; filename="${actualFile.type}"`;
      set.headers["Content-length"] = fileSize;
      set.headers["Content-Type"] = contentType;

      console.log({ fileSize });

      return actualFile;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { params: CommonPathBasedToken, query: InlineQueryDTO }
);

// 'http://localhost:3000/api/Files/get-one-by-path/%2FFLAV-358%20-%20Tsukasa%20Nagano.mp4?inline=true'
