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

/**
 * Represents the parsed components of a filepath.
 * @interface PathParseResult
 */
export interface PathParseResult {
  /** The original input filepath, unprocessed */
  original_path: string;
  /** Sanitized directory path, always ends with a forward slash (e.g., "/docs/") */
  path: string;
  /** Complete filename including extension (e.g., "test.pdf") */
  file_name: string;
  /** File extension without the dot (e.g., "pdf") */
  file_type: string;

  /** Filename without the extension (e.g., "test") */
  filename_without_extension: string;
  /** Extension with leading dot, or empty string if none (e.g., ".pdf" or "") */
  extension_with_dot: string;
}

/**
 * Options for configuring path parsing behavior.
 * @interface ParsePathOptions
 */
export interface ParsePathOptions {
  /** Maximum length of the full path (path + filename), defaults to 255 */
  maxLength?: number;
  ensureTrailingSlash?: boolean;
}
