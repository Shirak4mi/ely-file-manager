import { InternalServerErrorException } from "@/utils/error";
import { IdBasedTokenDTO } from "@/common/dto's";
import { prisma } from "@/db";

import { Elysia } from "elysia";

export default new Elysia().delete(
  "delete-file-by-id",
  async ({ params: { id } }) => {
    try {
      const disabledFile = await prisma.metadata.update({
        select: { file_name: true, file_path: true, file_size: true, id: true },
        data: { Status: { connect: { id: 2 } } },
        where: { id },
      });
      if (!disabledFile) throw new InternalServerErrorException("Could not (soft) delete file");
      return disabledFile;
    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { params: IdBasedTokenDTO }
);
