import Login from "./methods/Login.ts";

import { Elysia } from "elysia";

export default new Elysia({ prefix: "Auth", normalize: true, detail: { tags: ["Authentication"] } }).use([Login]);
