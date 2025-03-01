import { z } from "zod";

const envSchema = z.object({
  PORT: z.string().nonempty().min(4),
  BODY_SIZE: z.string().nonempty().min(1),
  FILE_ROUTE: z.string().nonempty().min(4),
  JWT_SECRET: z.string().nonempty().min(10),
  JWT_EXPIRES_IN: z.string().nonempty().min(2),
});

const { success, error, data } = envSchema.safeParse(Bun.env);

if (!success) {
  console.error("❌ Error loading env variables, please verify .env file", error.format());
  process.exit(1);
}

export const {
  BODY_SIZE,
  PORT: api_base_port,
  FILE_ROUTE: file_path,
  JWT_SECRET: jwt_secret,
  JWT_EXPIRES_IN: jwt_exp,
} = data;

export const maxRequestBodySize = 1024 * 1024 * parseInt(BODY_SIZE ?? 0);
