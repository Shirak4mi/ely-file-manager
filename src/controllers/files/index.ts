import getOneByPath from "./methods/getOneByPath.ts";
import getOneById from "./methods/getOneById.ts";
import Upload from "./methods/Upload.ts";

import { Elysia } from "elysia";

export default new Elysia({ prefix: "Files", normalize: true, detail: { tags: ["Files"] } }).use([
  Upload,
  getOneById,
  getOneByPath,
]);
