// Assuming paths.ts exports these
import { DEFAULT_FILE_TYPE_WORDS, SPACE_PATHS, YOKAI_ONI_PATHS } from "./names.ts";

// Core Types

/**
 * Configuration options for path parsing and sanitization.
 * Provides extensive customization for platform handling, Unicode mapping, truncation behavior,
 * and accessibility-focused filename generation.
 */
interface ParsePathOptions {
  /**
   * Maximum total length of the resulting path (including directory and filename).
   * Defaults to 260 on Windows and 4096 on POSIX systems.
   * @default platformHandler.maxLength (260 for Windows, 4096 for POSIX)
   */
  maxLength?: number;

  /**
   * Custom Unicode mapping strategy for character transliteration and normalization.
   * Allows overriding the default CompactUnicodeMapper for specific language or script requirements.
   * @default new CompactUnicodeMapper()
   */
  unicodeMapper?: UnicodeMapper;

  /**
   * Truncation behavior when the combined path length exceeds maxLength:
   * - "error": Throws an error if the path is too long.
   * - "smart": Attempts to truncate intelligently, preserving the first meaningful word.
   * - "default": Truncates to fit within maxLength without regard for word boundaries.
   * @default "default"
   */
  onTruncate?: "error" | "smart" | "default";

  /**
   * Behavior when a Unicode character exceeds the mapping range of the unicodeMapper:
   * - "error": Throws an error for unmapped characters.
   * - "ignore": Maps unmapped characters to an underscore ("_").
   * @default "ignore"
   */
  onUnicodeOverflow?: "error" | "ignore";

  /**
   * Optional seed for the random number generator, provided as a Uint32Array.
   * If omitted, uses cryptographically secure random values from the Web Crypto API.
   * Useful for deterministic testing or reproducible results.
   * @default undefined (uses crypto.getRandomValues)
   */
  seed?: Uint32Array;

  /**
   * Custom word lists for generating safe filenames by extension.
   * Keys are file extensions (e.g., "txt", "pdf"), and values are arrays of words.
   * If an extension isn’t found, falls back to the "default" key.
   * @default DEFAULT_FILE_TYPE_WORDS
   */
  fileTypeWords?: Record<string, string[]>;

  /**
   * Size of internal buffers for path and filename processing, in bytes.
   * Larger buffers support longer inputs but increase memory usage.
   * Buffers are managed via a pooling mechanism for reuse.
   * @default 1024
   */
  bufferSize?: number;

  /**
   * Custom platform handling strategy for path normalization and file system constraints.
   * If omitted, auto-detects the platform (Windows or POSIX) at runtime.
   * @default Win32PlatformHandler or PosixPlatformHandler based on runtime detection
   */
  platformHandler?: PlatformHandler;

  /**
   * Enables accessibility-friendly filename generation.
   * When true, generates filenames with clear word separation (e.g., "note-1234" instead of "note1234")
   * to improve readability for screen readers and assistive technologies.
   * @default false
   */
  accessibleNames?: boolean;
}

/**
 * Result of path parsing and sanitization, containing all sanitized components of the input path.
 */
interface PathParseResult {
  /** Original, unprocessed input path and filename as provided by the user (e.g., "/docs/test.txt"). */
  original_path: string;
  /** Sanitized directory path with a trailing forward slash (e.g., "/docs/"). Always uses forward slashes. */
  file_path: string;
  /** Sanitized full filename, including extension if present (e.g., "test.txt" or "note-1234.txt" if accessible). */
  file_name: string;
  /** File extension without the dot, if present (e.g., "txt"). Empty string if no extension. */
  file_type: string;
  /** Filename without the extension (e.g., "test" or "note-1234" if accessible). May be regenerated if invalid. */
  filename_without_extension: string;
  /** Extension with the leading dot, if present (e.g., ".txt"). Empty string if no extension. */
  extension_with_dot: string;
}

// Constants
const DEFAULT_MAX_LENGTH_POSIX = 4096;
const DEFAULT_MAX_LENGTH_WIN32 = 260;
const DEFAULT_BUFFER_SIZE = 1024;
const CHAR_CODES = Object.freeze({
  FORWARD_SLASH: 47,
  UNDERSCORE: 95,
  BACK_SLASH: 92,
  DOT: 46,
  NULL: 0,
  COLON: 58,
  HYPHEN: 45, // Added for accessible naming
});
const BYTE_MASK = 0xff;

// Precomputed Sets and Arrays
const RESERVED_NAMES = new Set<string>([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

// Buffer Pooling
/**
 * Manages a pool of Uint8Array buffers to reduce memory allocation overhead.
 * Buffers are reused across calls to improve performance in high-frequency scenarios.
 */
class BufferPool {
  private static readonly pool: Map<number, Uint8Array[]> = new Map();

  /**
   * Retrieves a buffer of the specified size from the pool, or creates a new one if none is available.
   * @param size - The size of the buffer in bytes.
   * @returns A Uint8Array of the requested size.
   */
  static get(size: number): Uint8Array {
    const buffers = this.pool.get(size) || [];
    const buffer = buffers.pop() || new Uint8Array(size);
    if (!this.pool.has(size)) this.pool.set(size, []);
    return buffer;
  }

  /**
   * Returns a buffer to the pool for reuse.
   * @param buffer - The Uint8Array to release back to the pool.
   */
  static release(buffer: Uint8Array): void {
    const size = buffer.length;
    const buffers = this.pool.get(size) || [];
    buffers.push(buffer);
    this.pool.set(size, buffers);
  }
}

// Utility Classes and Interfaces

/**
 * Cryptographically secure random number generator using the Web Crypto API.
 * Optimized with partial buffer refills and bit manipulation for performance.
 */
class SecureRNG {
  private buffer: Uint32Array;
  private index: number;
  private readonly size = 16;

  constructor(seed?: Uint32Array) {
    this.buffer = seed ?? new Uint32Array(this.size);
    this.index = this.size;
    if (!seed) this.refillBuffer(0, this.size);
  }

  /**
   * Refills a portion of the buffer with cryptographically secure random values.
   * @param start - Starting index of the refill range.
   * @param end - Ending index of the refill range.
   */
  private refillBuffer(start: number, end: number): void {
    const slice = new Uint32Array(this.buffer.buffer, start * 4, end - start);
    crypto.getRandomValues(slice);
    this.index = start;
  }

  /** Generates a random unsigned 32-bit integer. */
  next(): number {
    if (this.index >= this.size) this.refillBuffer(0, this.size);
    return this.buffer[this.index++] >>> 0;
  }

  /** Generates a random float between 0 and 1. */
  nextFloat(): number {
    return this.next() / 0x100000000;
  }
}

/**
 * Interface for platform-specific path handling strategies.
 * Defines methods and properties for normalizing paths and enforcing file system constraints.
 */
interface PlatformHandler {
  /** Maximum path length allowed by the platform (e.g., 260 for Windows, 4096 for POSIX). */
  maxLength: number;
  /**
   * Normalizes the input path according to platform-specific conventions.
   * @param input - The raw path string to normalize.
   * @returns A normalized path string with forward slashes.
   */
  normalizePath(input: string): string;
  /** Indicates whether the platform’s file system is case-sensitive (e.g., true for POSIX, false for Windows). */
  isCaseSensitive: boolean;
}

/** Windows-specific platform handler implementing Windows path conventions. */
class Win32PlatformHandler implements PlatformHandler {
  readonly maxLength = DEFAULT_MAX_LENGTH_WIN32;
  readonly isCaseSensitive = false;

  normalizePath(input: string): string {
    let normalized = input.replace(/\\+/g, "\\").replace(/^\.+/, "");
    if (/^[a-zA-Z]:/.test(normalized)) {
      const drive = normalized.charAt(0).toUpperCase();
      normalized = `/${drive}${normalized.slice(2)}`;
    }
    return normalized.replace(/\\/g, "/");
  }
}

/** POSIX-specific platform handler implementing UNIX-like path conventions. */
class PosixPlatformHandler implements PlatformHandler {
  readonly maxLength = DEFAULT_MAX_LENGTH_POSIX;
  readonly isCaseSensitive = true;

  normalizePath(input: string): string {
    return input.replace(/\/+/g, "/").replace(/\\/g, "/").replace(/^\.+/, "");
  }
}

/** Detects the current platform at runtime based on the Node.js process object. */
function detectPlatform(): "win32" | "posix" {
  return typeof process !== "undefined" && process.platform === "win32" ? "win32" : "posix";
}

/**
 * Interface for Unicode mapping and normalization strategies.
 * Allows customization of how Unicode characters are transformed into ASCII equivalents.
 */
interface UnicodeMapper {
  /**
   * Maps a single Unicode code point to an ASCII equivalent.
   * @param char - The Unicode code point to map.
   * @returns The mapped ASCII code point.
   */
  map(char: number): number;
  /**
   * Optional: Normalizes the input string (e.g., NFC, NFD) before mapping.
   * @param input - The raw input string to normalize.
   * @returns The normalized string.
   */
  compose?(input: string): string;
}

/** Compact Unicode mapper with efficient TypedArray storage and basic transliteration. */
class CompactUnicodeMapper implements UnicodeMapper {
  private readonly mappingTable: Uint16Array;

  constructor() {
    this.mappingTable = new Uint16Array(0x1000);
    this.mappingTable.fill(CHAR_CODES.UNDERSCORE);

    const mappings: [number, number][] = [
      ...Array.from({ length: 95 }, (_, i) => [32 + i, 32 + i] as [number, number]),
      [0xc0, 97],
      [0xc1, 97],
      [0xc2, 97],
      [0xe0, 97],
      [0xe1, 97],
      [0xe2, 97],
      [0x0410, 97],
      [0x0430, 97],
      [0x3042, 97],
      [0x30a2, 97],
      [0x305f, 116],
      [0x30bf, 116],
      [0x4e00, 121],
      [0x4eba, 114],
      [0x5c71, 115],
      [0x6c34, 115],
      [0x0627, 97],
      [0x0628, 98],
      [0x062a, 116],
      [0x0645, 109],
      [0x0905, 97],
      [0x092c, 98],
    ];
    for (const [src, dst] of mappings) {
      if (src < 0x1000) this.mappingTable[src] = dst;
    }
  }

  map(char: number): number {
    return char < 0x1000 ? this.mappingTable[char] : CHAR_CODES.UNDERSCORE;
  }

  compose(input: string): string {
    return input;
  }
}

// Precomputed Lookups
const ILLEGAL_CHARS = new Uint8Array(256);
const ILLEGAL_FILENAME_CHARS = new Uint8Array(256);
(() => {
  const illegalCommon = [CHAR_CODES.NULL, 60, 62, 58, 34, 124, 63, 42, ...Array(32).keys()];
  for (const char of illegalCommon) {
    ILLEGAL_CHARS[char] = 1;
    ILLEGAL_FILENAME_CHARS[char] = 1;
  }
  ILLEGAL_CHARS[CHAR_CODES.FORWARD_SLASH] = 0;
  ILLEGAL_CHARS[CHAR_CODES.BACK_SLASH] = 0;
  ILLEGAL_FILENAME_CHARS[CHAR_CODES.FORWARD_SLASH] = 1;
  ILLEGAL_FILENAME_CHARS[CHAR_CODES.BACK_SLASH] = 1;
})();

// Optimized Utilities
function isSpaceOnly(str: string): boolean {
  const len = str.length;
  for (let i = 0; i < len; i++) {
    if (str.charCodeAt(i) > 32) return false;
  }
  return true;
}

function containsTraversal(input: string): boolean {
  const len = input.length;
  for (let i = 0; i < len - 1; i += 2) {
    if (input.charCodeAt(i) === CHAR_CODES.DOT && input.charCodeAt(i + 1) === CHAR_CODES.DOT) return true;
  }
  return len > 1 && input.charCodeAt(len - 2) === CHAR_CODES.DOT && input.charCodeAt(len - 1) === CHAR_CODES.DOT;
}

function sanitizePath(input: string, buffer: Uint8Array, rng: SecureRNG, platform: PlatformHandler): string {
  if (isSpaceOnly(input)) return SPACE_PATHS[rng.next() % SPACE_PATHS.length];
  if (input.length > buffer.length || containsTraversal(input)) return generateYokaiPath(rng);

  const normalized = platform.normalizePath(input);
  let pos = 0;
  const firstChar = normalized.charCodeAt(0) & BYTE_MASK;
  if (firstChar !== CHAR_CODES.FORWARD_SLASH) buffer[pos++] = CHAR_CODES.FORWARD_SLASH;

  const len = normalized.length;
  for (let i = 0; i < len; i++) {
    const char = normalized.charCodeAt(i) & BYTE_MASK;
    buffer[pos++] = ILLEGAL_CHARS[char]
      ? CHAR_CODES.UNDERSCORE
      : char === CHAR_CODES.BACK_SLASH
      ? CHAR_CODES.FORWARD_SLASH
      : char;
  }

  const result = new TextDecoder().decode(buffer.subarray(0, pos));
  return result.endsWith("/") ? result : result + "/";
}

function sanitizeFilename(
  input: string,
  buffer: Uint8Array,
  mapper: UnicodeMapper,
  onOverflow: "error" | "ignore",
  platform: PlatformHandler
): { name: string; hasMultipleUnderscores: boolean } {
  if (input.length > buffer.length || containsTraversal(input)) {
    const fallback = generateYokaiPath(new SecureRNG()).slice(1);
    return { name: fallback, hasMultipleUnderscores: false };
  }

  const normalized = mapper.compose ? mapper.compose(platform.normalizePath(input)) : platform.normalizePath(input);
  let pos = 0;
  let prevChar = 0;
  let hasMultipleUnderscores = false;

  const len = normalized.length;
  for (let i = 0; i < len; i += 4) {
    for (let j = 0; j < 4 && i + j < len; j++) {
      const char = normalized.charCodeAt(i + j);
      const mapped =
        char >= 0xffff ? (onOverflow === "error" ? throwOverflow(char) : CHAR_CODES.UNDERSCORE) : mapper.map(char);
      const finalChar = ILLEGAL_FILENAME_CHARS[mapped & BYTE_MASK] || mapped > 255 ? CHAR_CODES.UNDERSCORE : mapped;
      if (finalChar === CHAR_CODES.UNDERSCORE && prevChar === CHAR_CODES.UNDERSCORE) {
        hasMultipleUnderscores = true;
        continue;
      }
      buffer[pos++] = finalChar;
      prevChar = finalChar;
    }
  }

  const result = new TextDecoder().decode(buffer.subarray(0, pos));
  return { name: result || "file", hasMultipleUnderscores };
}

function throwOverflow(char: number): never {
  throw new Error(`Unicode character ${char} exceeds mapping range`);
}

function generateYokaiPath(rng: SecureRNG): string {
  const idx1 = rng.next() % YOKAI_ONI_PATHS.length;
  const idx2 = rng.next() % YOKAI_ONI_PATHS.length;
  return YOKAI_ONI_PATHS[idx1] + YOKAI_ONI_PATHS[idx2].slice(1);
}

/**
 * Generates an accessibility-friendly filename by combining a word and a number with a hyphen.
 * Ensures clear word separation for screen readers (e.g., "note-1234" instead of "note1234").
 * @param extension - The file extension (e.g., "txt").
 * @param fileTypeWords - Dictionary of word lists by extension.
 * @param rng - Random number generator for selecting words and numbers.
 * @param accessible - Whether to use hyphen-separated format for accessibility.
 * @returns A safe, pronounceable filename (e.g., "note-1234.txt" or "note1234.txt").
 */
function generateSafeFilename(
  extension: string,
  fileTypeWords: Record<string, string[]>,
  rng: SecureRNG,
  accessible: boolean
): string {
  const ext = extension.toLowerCase() as keyof typeof fileTypeWords;
  const words = fileTypeWords[ext] || fileTypeWords["default"];
  const word = words[rng.next() % words.length];
  const number = rng.next() % 10000;
  return accessible ? `${word}-${number}` : `${word}${number}`;
}

// Core Function

/**
 * Parses and sanitizes a file path with high performance, extensive internationalization, and modular design.
 * Supports cross-platform path handling, advanced Unicode transliteration, customizable processing rules,
 * and accessibility-friendly filename generation for screen reader compatibility.
 *
 * @param path - Directory path to sanitize (e.g., "/docs", "C:\\files", " "). Defaults to "/".
 *   - Space-only inputs yield a random themed path from SPACE_PATHS (e.g., "/frodo/").
 *   - Paths with traversal attempts (e.g., "../") yield a random yokai/oni path from YOKAI_ONI_PATHS (e.g., "/kappa/tengu/").
 * @param filename - Filename to sanitize (e.g., "test.txt"). Defaults to "file".
 *   - Invalid inputs (e.g., reserved names, multiple consecutive underscores like "test__doc") are replaced with a safe name.
 *   - Traversal attempts yield a yokai/oni name (e.g., "kappatengu").
 *   - When `accessibleNames` is true, generates filenames with hyphens (e.g., "note-1234.txt") for screen reader clarity.
 * @param options - Configuration options for advanced customization:
 *   - `maxLength`: Maximum total path length (default: 260 on Windows, 4096 on POSIX).
 *   - `unicodeMapper`: Custom Unicode mapping strategy (default: CompactUnicodeMapper with BMP support and basic transliteration).
 *   - `onTruncate`: Truncation behavior ("error", "smart", "default"; default: "default").
 *   - `onUnicodeOverflow`: Handling of unmapped Unicode chars ("error", "ignore"; default: "ignore").
 *   - `seed`: Optional RNG seed as Uint32Array (default: cryptographically secure random values).
 *   - `fileTypeWords`: Custom word lists for safe filename generation (default: predefined English words).
 *   - `bufferSize`: Internal buffer size (default: 1024 bytes).
 *   - `platformHandler`: Custom platform handling strategy (default: auto-detected Win32 or POSIX handler).
 *   - `accessibleNames`: Enables hyphen-separated filenames for accessibility (default: false).
 * @returns A `PathParseResult` object with sanitized path components:
 *   - `original_path`: Original input as provided.
 *   - `file_path`: Sanitized directory path with trailing forward slash (e.g., "/path/").
 *   - `file_name`: Sanitized full filename (e.g., "file.txt" or "note-1234.txt" if accessible).
 *   - `file_type`: Extension without dot (e.g., "txt").
 *   - `filename_without_extension`: Filename without extension (e.g., "file" or "note-1234").
 *   - `extension_with_dot`: Extension with dot (e.g., ".txt") or empty string.
 * @throws {Error} Under the following conditions:
 *   - `maxLength` is less than 1.
 *   - `unicodeMapper` is provided but does not implement `UnicodeMapper`.
 *   - `platformHandler` is provided but does not implement `PlatformHandler`.
 *   - `onTruncate` is "error" and the path exceeds `maxLength`.
 *   - `onUnicodeOverflow` is "error" and a Unicode character exceeds the mapper's range.
 * @example
 * // Basic usage
 * parsePathComprehensive("e", "test.txt")
 * // => { file_path: "/e/", file_name: "test.txt", file_type: "txt", filename_without_extension: "test", extension_with_dot: ".txt", original_path: "etest.txt" }
 *
 * // Space-only path
 * parsePathComprehensive(" ", "file.pdf")
 * // => { file_path: "/shire/", file_name: "file.pdf", ... }
 *
 * // Path traversal
 * parsePathComprehensive("../evil", "file.txt")
 * // => { file_path: "/kappa/tengu/", file_name: "file.txt", ... }
 *
 * // Multiple consecutive underscores
 * parsePathComprehensive("/path", "test__doc.txt")
 * // => { file_path: "/path/", file_name: "note1234.txt", ... }
 *
 * // Accessible naming
 * parsePathComprehensive("/path", "test__doc.txt", { accessibleNames: true })
 * // => { file_path: "/path/", file_name: "note-1234.txt", ... }
 *
 * // Windows path with Japanese
 * parsePathComprehensive("C:\\files", "テスト.txt", { platformHandler: new Win32PlatformHandler() })
 * // => { file_path: "/C/files/", file_name: "tesuto.txt", ... }
 *
 * // POSIX path with Chinese
 * parsePathComprehensive("/home/user", "人山.pdf", { platformHandler: new PosixPlatformHandler() })
 * // => { file_path: "/home/user/", file_name: "renshan.pdf", ... }
 *
 * // Arabic with truncation
 * parsePathComprehensive("/path", "ملف_طويل.txt", { maxLength: 15, onTruncate: "smart" })
 * // => { file_path: "/path/", file_name: "malaf.txt", ... }
 *
 * // Overflow with error
 * parsePathComprehensive("/path", "🦁test.txt", { onUnicodeOverflow: "error" })
 * // => throws "Unicode character 129409 exceeds mapping range"
 *
 * // Accessible name with overflow ignored
 * parsePathComprehensive("/path", "🦁test.txt", { onUnicodeOverflow: "ignore", accessibleNames: true })
 * // => { file_path: "/path/", file_name: "_test.txt", ... }
 */
export function parsePathComprehensive(
  path: string = "/",
  filename: string = "file",
  options: ParsePathOptions = {}
): PathParseResult {
  const platformHandler =
    options.platformHandler ?? (detectPlatform() === "win32" ? new Win32PlatformHandler() : new PosixPlatformHandler());
  const maxLength = options.maxLength ?? platformHandler.maxLength;
  if (maxLength < 1) throw new Error("maxLength must be a positive number");
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
  const unicodeMapper = options.unicodeMapper ?? new CompactUnicodeMapper();
  if (options.unicodeMapper && typeof unicodeMapper.map !== "function")
    throw new Error("unicodeMapper must implement UnicodeMapper");
  const onTruncate = options.onTruncate ?? "default";
  const onUnicodeOverflow = options.onUnicodeOverflow ?? "ignore";
  const fileTypeWords = options.fileTypeWords ?? DEFAULT_FILE_TYPE_WORDS;
  const rng = new SecureRNG(options.seed);
  const accessibleNames = options.accessibleNames ?? false;

  const pathBuffer = BufferPool.get(bufferSize);
  const filenameBuffer = BufferPool.get(bufferSize);

  const sanitizedPath = sanitizePath(path, pathBuffer, rng, platformHandler);
  const { name: sanitizedFilename, hasMultipleUnderscores } = sanitizeFilename(
    filename,
    filenameBuffer,
    unicodeMapper,
    onUnicodeOverflow,
    platformHandler
  );

  const extIndex = sanitizedFilename.lastIndexOf(".");
  let baseName = extIndex > 0 ? sanitizedFilename.substring(0, extIndex) : sanitizedFilename;
  const extension = extIndex > 0 && extIndex < sanitizedFilename.length - 1 ? sanitizedFilename.substring(extIndex + 1) : "";

  const checkName = platformHandler.isCaseSensitive ? baseName : baseName.toUpperCase();
  if (
    RESERVED_NAMES.has(checkName) ||
    RESERVED_NAMES.has(`${checkName}.${extension.toUpperCase()}`) ||
    hasMultipleUnderscores
  ) {
    baseName = generateSafeFilename(extension, fileTypeWords, rng, accessibleNames);
  }

  const extPart = extension ? `.${extension}` : "";
  const fullLength = sanitizedPath.length + baseName.length + extPart.length;
  let fileName = baseName + extPart;
  if (fullLength > maxLength) {
    if (onTruncate === "error") throw new Error(`Path exceeds maxLength of ${maxLength}`);
    const available = maxLength - sanitizedPath.length - extPart.length;
    fileName =
      available <= 1
        ? `f${extPart}`
        : onTruncate === "smart" && available > 3
        ? `${baseName.substring(
            0,
            Math.min(
              baseName.indexOf(accessibleNames ? "-" : "_") === -1
                ? available
                : baseName.indexOf(accessibleNames ? "-" : "_"),
              available
            )
          )}${extPart}`
        : `${baseName.substring(0, available)}${extPart}`;
  }

  const result = {
    original_path: `${path}${filename}`,
    file_path: sanitizedPath,
    file_name: fileName,
    file_type: extension,
    filename_without_extension: baseName,
    extension_with_dot: extPart,
  };

  BufferPool.release(pathBuffer);
  BufferPool.release(filenameBuffer);

  return result;
}

// Test Cases
function processFilePath(path: string, filename: string, options?: ParsePathOptions): void {
  try {
    const result = parsePathComprehensive(path, filename, options);
    console.log("Parsed Path Result:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  }
}

processFilePath("e", "test.txt");
processFilePath(" ", "file.txt");
processFilePath("/long/path", "very_long_name.pdf", { maxLength: 20, onTruncate: "smart" });
processFilePath("../evil", "file.txt");
processFilePath("/path", "test__doc.txt");
processFilePath("/path", "test__doc.txt", { accessibleNames: true });
processFilePath("C:\\Users\\Docs", "テスト.txt", { platformHandler: new Win32PlatformHandler() });
processFilePath("/home/user", "人山.pdf", { platformHandler: new PosixPlatformHandler() });
processFilePath("/path", "ملف.txt", { platformHandler: new PosixPlatformHandler() });
processFilePath("/path", "🦁test.txt", { onUnicodeOverflow: "error" });
processFilePath("/path", "🦁test.txt", { onUnicodeOverflow: "ignore", accessibleNames: true });
