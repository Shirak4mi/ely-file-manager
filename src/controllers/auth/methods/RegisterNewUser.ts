import { CreateUserDTO } from "../dto";

import { Elysia } from "elysia";

export default new Elysia().post(
  "Login",
  async ({ body }) => {
    try {
     




    } catch (err) {
      console.error(err);
      throw err;
    }
  },
  { body: CreateUserDTO }
);
