import { useErrorMiddleware } from "@/middlewares/errorMiddleware.ts";
import { authMiddleware } from "@/middlewares/authMiddleware.ts";
import files from "./files/index.ts";
import auth from "./auth/index.ts";

import { Elysia } from "elysia";

export const routes = new Elysia({ prefix: "api" })
  .use(useErrorMiddleware)
  .use([auth])
  // .use(authMiddleware)
  .use([files]);
