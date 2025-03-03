/** A value that can be a string, number, boolean, or a nested object with MetaValue properties */
export type MetaValue = string | number | boolean | { [key: string]: MetaValue };

/** An object with string keys and MetaValue values, allowing nested structures */
export type Meta = { [key: string]: MetaValue };

/** The log level indicating severity */
export type LogLevel = "INFO" | "ERROR" | "DEBUG" | "WARN";

/**
 * Configuration options for password hashing.
 */
export interface PasswordHashOptions {
  /**
   * The hashing algorithm to use.
   * @default "argon2id"
   */
  algorithm: "argon2id" | "argon2i" | "argon2d";

  /**
   * Memory usage in KiB.
   * @default 65536
   */
  memoryCost?: number;

  /**
   * Number of iterations.
   * @default 3
   */
  timeCost?: number;

  /**
   * Degree of parallelism.
   * @default 4
   */
  parallelism?: number;
}
