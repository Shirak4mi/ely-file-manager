import { Elysia } from "elysia";

export default new Elysia()
  .decorate("api_key", "" as string)
  .delete("delete-multiple-by-id", async ({ body, set, api_key }) => {});
