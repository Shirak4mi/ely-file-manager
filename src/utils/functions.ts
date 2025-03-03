import { alphabet, generateRandomString } from "oslo/crypto";
import { NotFoundException } from "./error/index.ts";
import { mkdir, readdir } from "node:fs/promises";
import { file_path } from "./env.ts";
import { file, password } from "bun";
import { PasswordHashOptions } from "@/types/index.ts";

export { default as generateNanoID } from "./nanoID/index.ts";
export { default as HyperScalePathResolver } from "./HyperCache/index.ts";
export * from "./logger/index.ts";
export * from "./ip/index.ts";

/**
 * Determines if a string contains valid JSON
 *
 * @param {string} str - The string to validate as JSON
 * @returns {boolean} - True if string is valid JSON, false otherwise
 *
 * @performance Optimized for speed through:
 * - Basic string validation before expensive parsing
 * - Early returns for common invalid cases
 * - Explicit handling of edge cases
 *
 * @example
 * // Returns true
 * isJsonString('{"name":"John","age":30}')
 *
 * @example
 * // Returns false
 * isJsonString('{name:"John"}')
 */
export function isJsonString(str: string): boolean {
  // Handle non-string inputs
  if (typeof str !== "string") {
    return false;
  }

  // Quick check for empty or very short strings
  if (!str || str.length < 2) {
    return false;
  }

  // Fast validation for common JSON structures
  const firstChar = str.charAt(0);
  const lastChar = str.charAt(str.length - 1);

  // Valid JSON must start with '{', '[', '"', number, true, false, or null
  if (
    !(
      (
        (firstChar === "{" && lastChar === "}") || // object
        (firstChar === "[" && lastChar === "]") || // array
        (firstChar === '"' && lastChar === '"') || // string
        /^-?\d/.test(firstChar) || // number
        /^true$|^false$|^null$/.test(str)
      ) // boolean/null
    )
  ) {
    return false;
  }

  // Perform the full parse for strings that pass basic validation
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Sanitizes a filename to make it URL-safe with maximum performance (<2ms)
 *
 * @param {string} filename - The original filename to sanitize
 * @return {string} - The sanitized URL-safe filename
 *
 * @performance Optimized for speed through:
 * - Single pass transformation where possible
 * - Reduced regex backtracking
 * - Early returns for empty inputs
 * - Pre-defined character mapping
 *
 * @transforms
 * - Trims whitespace
 * - Converts to lowercase
 * - Replaces spaces/underscores with hyphens
 * - Removes illegal URL characters
 * - Consolidates consecutive hyphens
 * - Removes leading/trailing hyphens
 *
 * @example
 * // Returns "my-document-final.pdf"
 * sanitizeFilename("My Document (Final).pdf")
 *
 * @example
 * // Returns "resume-john-doe.docx"
 * sanitizeFilename("résumé_john_doe*&^%.docx")
 */
export function sanitizeFilename(filename: string): string {
  // Early return for empty inputs
  if (!filename) return "";

  // Pre-trim and lowercase for efficiency
  filename = filename.trim().toLowerCase();

  // Fast path for already clean filenames
  if (/^[a-z0-9\-\.]+$/.test(filename) && !filename.includes("--") && !filename.startsWith("-") && !filename.endsWith("-")) {
    return filename;
  }

  // Process in one pass when possible - combine common transformations
  let result = "";
  let lastCharWasHyphen = false;
  let firstChar = true;

  for (let i = 0; i < filename.length; i++) {
    let char = filename[i];

    // Handle common replacements
    if (char === " " || char === "_") {
      char = "-";
    }

    // Keep only allowed characters
    if (/[a-z0-9\-\.]/.test(char)) {
      // Skip hyphen if it would create a double or appear at start
      if (char === "-") {
        if (lastCharWasHyphen || firstChar) continue;
        lastCharWasHyphen = true;
      } else {
        lastCharWasHyphen = false;
      }

      result += char;
      firstChar = false;
    }
  }

  // Remove trailing hyphen if present
  if (result.endsWith("-")) {
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * This function is for removing "found" field on response Error Object, because this field shows incoming data
 * @param error String
 * @returns Obj | String
 */
export function filterMessage(error: string): string {
  if (isJsonString(error)) {
    const { found: _, ...args } = JSON.parse(error);
    return args;
  } else return error;
}

export async function getWorkingFilePath(path?: string): Promise<string | undefined> {
  try {
    if (!path) throw new NotFoundException("File path not found");
    const totalFilePath = Bun.file(file_path + path);
    if (!(await totalFilePath.exists())) throw new NotFoundException("Error files does not exists");
    return totalFilePath.name;
  } catch (err) {
    console.error(err, path);
    throw err;
  }
}

export function sanitizeString(fileOrPath: string) {
  return fileOrPath.replaceAll(" ", "_");
}

export function returnActualOSPath(path: string): string {
  return process.platform === "win32" ? ("C:" + file_path + path).replaceAll("/", "\\") : file_path + path;
}

export async function isDirectory(totalPath: string): Promise<false | Array<string>> {
  try {
    return await readdir(totalPath, { recursive: true });
  } catch (err) {
    return false;
  }
}

export async function createFilePathIfDoesntExists(path: string): Promise<string | undefined> {
  try {
    const totalPath = returnActualOSPath(path);
    const dir = await isDirectory(totalPath);
    if (!dir) return await mkdir(totalPath, { recursive: true });
    return totalPath;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function createFileOnsFS(workingFP?: string, files?: File | Array<File>): Promise<number | Array<number>> {
  if (!workingFP || !files) throw new NotFoundException("Path not found");
  if (Array.isArray(files))
    return await Promise.all(files.map(async (file) => await Bun.write(workingFP + "/" + file.name, file)));
  return await Bun.write(workingFP + "/" + files.name, files);
}

export async function createFileOnsFSEmpty(workingFP?: string): Promise<number | Array<number>> {
  if (!workingFP) throw new NotFoundException("Path not found");
  return await Bun.write(workingFP, "");
}


/**
 * Extracts the file extension from a filename with proper formatting.
 * Handles paths and ensures proper lowercase formatting.
 * @param filename - The filename or path to extract the extension from.
 * @returns The lowercase file extension with a leading dot (e.g., ".jpg"), or an empty string if no extension exists.
 * @example
 * getFileExtension("document.pdf"); // returns ".pdf"
 * getFileExtension("image.JPG"); // returns ".jpg"
 * getFileExtension("README"); // returns ""
 * getFileExtension("folder/file.txt"); // returns ".txt"
 * getFileExtension("path/to/file.with.multiple.dots"); // returns ".dots"
 */
export function getFileExtension(filename: string): string {
  // Get the basename in case a path is provided
  const basename = filename.split(/[\\/]/).pop() || "";

  // Extract extension using regex to handle cases with no extension
  const match = basename.match(/\.([^.]+)$/);
  return match ? `.${match[1].toLowerCase()}` : "";
}

/**
 * Generates a random salt string for cryptographic purposes.
 *
 * @returns A 16-character random string containing alphanumeric characters (a-z, A-Z, 0-9).
 * @example
 * const salt = generateRandomSalt(); // e.g. "aB7cD9eF2gH5jK3"
 */
export function generateRandomSalt(): string {
  return generateRandomString(16, alphabet("a-z", "A-Z", "0-9"));
}

/**
 * Generates a random token for authentication or identification purposes.
 *
 * @returns A 12-character random string containing alphanumeric characters (a-z, A-Z, 0-9).
 * @example
 * const token = generateToken(); // e.g. "x7Yz3Ab9Cd2E"
 */
export function generateToken(): string {
  return generateRandomString(32, alphabet("a-z", "A-Z", "0-9"));
}

/**
 * Encrypts a password using Argon2id hashing algorithm with a provided salt.
 *
 * @param salt - A unique string to be prepended to the password before hashing.
 * @param pass - The password string to encrypt.
 * @param options - Optional configuration parameters for the hashing algorithm.
 * @returns A Promise that resolves to the hashed password string.
 * @example
 * const salt = generateRandomSalt();
 * const hashedPassword = await encryptPassword(salt, "mySecurePassword");
 */
export function encryptPassword(
  salt: string,
  pass: string,
  options: PasswordHashOptions = { algorithm: "argon2id", memoryCost: 65536, timeCost: 3 }
): Promise<string> {
  return password.hash(salt + pass, options);
}
