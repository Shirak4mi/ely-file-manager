import { errorMiddleware, authMiddleware, loggerMiddleware } from "@/middlewares";
import files from "./files/index.ts";
import auth from "./auth/index.ts";

import { Elysia } from "elysia";

export const routes = new Elysia({ prefix: "api" })
  .use(loggerMiddleware)
  .use(errorMiddleware)
  .use([auth])
  // .use(authMiddleware)
  .use([files]);
