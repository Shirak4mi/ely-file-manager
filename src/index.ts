import { api_base_port, file_path, maxRequestBodySize } from "./utils/env.ts";
import { staticPlugin } from "@elysiajs/static";
import { swagger } from "@elysiajs/swagger";
import { helmet } from "elysia-helmet";
import { routes } from "@/controllers";

import { Elysia } from "elysia";

const helmetExec = helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false });



new Elysia({ name: "Storage Manager API", strictPath: true, precompile: true, serve: { maxRequestBodySize } })
  .use(
    swagger({
      theme: "Dark",
      version: "0.1",
      exclude: ["/swagger", "/swagger/json"],
      documentation: {
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
      },
    })
  )
  .use(staticPlugin({ prefix: "/files", assets: file_path }))
  .get("ping", () => "pong", { tags: ["Test"] })
  .use(helmetExec)
  .use(routes)
  .listen(api_base_port ?? 8080, ({ url }) => console.log(`🦊 Elisya is Running on ${url}`));
