import { createZipResponse } from "@/utils/zip";
import { Elysia } from "elysia";

export default new Elysia()
  .decorate("api_key", "" as string)
  .delete("delete-multiple-by-id", async ({ body, set, api_key }) => {
    const { data, headers } = createZipResponse(
      {
        "hello.txt": "This is a test file",
        "data.json": JSON.stringify({ name: "Test", date: new Date().toISOString() }),
        "binary.dat": new Uint8Array([1, 2, 3, 4, 5]),
      },
      "example.zip"
    );

    set.headers = headers;

    return data;
  });
