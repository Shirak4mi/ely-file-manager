import type { Elysia } from "elysia";

export default function loggerMiddleware(app: Elysia) {
  return app.derive(() => {});
}
