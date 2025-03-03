import { Elysia } from "elysia";

export default new Elysia().decorate("api_key", "" as string).post("upload-multiple", async ({ body, set, api_key }) => {});
