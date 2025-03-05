import DeleteMultipleFilesById from "./methods/DeleteMultipleFilesById.ts";
import DownloadMultipleFiles from "./methods/DownloadMultipleFiles.ts";
// import GetMultipleByPath from "./methods/GetMultipleByPath.ts";
// import GetMultipleById from "./methods/GetMultipleById.ts";
import DeleteFileById from "./methods/DeleteFileById.ts";
import GetOneByPath from "./methods/GetOneByPath.ts";
import GetOneById from "./methods/GetOneById.ts";
import Upload from "./methods/Upload.ts";

import { Elysia } from "elysia";

export default new Elysia({ prefix: "Files", normalize: true, detail: { tags: ["Single Files"] } }).use([
  Upload,

  GetOneById,
  GetOneByPath,

  // GetMultipleById,
  // GetMultipleByPath,

  DeleteFileById,
  DownloadMultipleFiles,
  DeleteMultipleFilesById,
]);
