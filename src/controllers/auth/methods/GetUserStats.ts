import { Elysia } from "elysia";

export default new Elysia().decorate("api_key", "" as string).get("get-user-stats", () => {});
