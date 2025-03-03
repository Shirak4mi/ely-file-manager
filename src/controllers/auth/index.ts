import RegisterNewUser from "./methods/RegisterNewUser.ts";
import Login from "./methods/Login.ts";

import { Elysia } from "elysia";

export default new Elysia({ prefix: "Auth", normalize: true, detail: { tags: ["Authentication"] } }).use([
  RegisterNewUser,
  Login,
]);
