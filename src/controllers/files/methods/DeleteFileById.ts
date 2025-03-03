import { Elysia } from "elysia";

export default new Elysia()
  .decorate("api_key", "" as string)
  .delete("delete-file-by-id", async ({ body, set, api_key }) => {});
