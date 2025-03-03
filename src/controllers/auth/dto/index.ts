import { type Static, t } from "elysia";

export const loginUserDTO = t.Object({
  email: t.String({ minLength: 1, format: "email" }),
  password: t.String({ minLength: 8 }),
});

export type TLoginUserDTO = Static<typeof loginUserDTO>;

export const CreateUserDTO = t.Object({
  email: t.String({ minLength: 1, examples: "test@email.com", format: "email" }),
  type: t.Enum({ Application: "1", User: "2", Maintainer: "3" }),
  password: t.String({ minLength: 8, examples: "This@@##!@" }),
  username: t.String({ minLength: 1, examples: "SadGroup" }),
});

export type TCreateUserDTO = Static<typeof CreateUserDTO>;
