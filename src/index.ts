import { api_base_port, file_path, jwt_exp, jwt_secret, maxRequestBodySize } from "./utils/env.ts";
import { swagger, ElysiaSwaggerConfig } from "@elysiajs/swagger";
import { staticPlugin } from "@elysiajs/static";
import { helmet } from "elysia-helmet";
import { routes } from "@/controllers";
import { jwt } from "@elysiajs/jwt";

import { Elysia } from "elysia";

const helmetExec = helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false });

const swaggerConfig: ElysiaSwaggerConfig = {
  exclude: ["/swagger", "/swagger/json"],
  version: "0.1",
  theme: "dark",
  documentation: {
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
  },
};

new Elysia({ name: "Storage Manager API", strictPath: true, precompile: true, serve: { maxRequestBodySize } })
  .use(jwt({ name: "jwt", secret: jwt_secret, exp: jwt_exp ?? "365d" }))
  .use(staticPlugin({ prefix: "/files", assets: file_path }))
  .get("ping", () => "pong", { tags: ["Test"] })
  .use(swagger(swaggerConfig))
  .use(helmetExec)
  .use(routes)
  .listen(api_base_port ?? 8080, ({ url }) => console.log(`🦊 Elisya is Running on ${url}`));
