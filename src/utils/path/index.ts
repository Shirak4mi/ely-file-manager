// Assuming paths.ts exports these
import { DEFAULT_FILE_TYPE_WORDS, SPACE_PATHS, YOKAI_ONI_PATHS } from "./names.ts";

/**
 * Options for parsing filesystem paths
 * @interface
 * @property {number} [maxLength] - Maximum allowed path length
 * @property {UnicodeMapper} [unicodeMapper] - Custom unicode character mapper
 * @property {"error" | "smart" | "default"} [onTruncate] - Truncation behavior
 * @property {"error" | "ignore"} [onUnicodeOverflow] - Unicode overflow handling
 * @property {Uint32Array} [seed] - RNG seed for deterministic output
 * @property {Record<string, string[]>} [fileTypeWords] - Custom filetype word mappings
 * @property {number} [bufferSize] - Buffer size for path operations
 * @property {PlatformHandler} [platformHandler] - Platform-specific handler
 * @property {boolean} [accessibleNames] - Use accessible naming conventions
 */
interface ParsePathOptions {
  maxLength?: number;
  unicodeMapper?: UnicodeMapper;
  onTruncate?: "error" | "smart" | "default";
  onUnicodeOverflow?: "error" | "ignore";
  seed?: Uint32Array;
  fileTypeWords?: Record<string, string[]>;
  bufferSize?: number;
  platformHandler?: PlatformHandler;
  accessibleNames?: boolean;
}

/**
 * Result of path parsing operation
 * @interface
 * @property {string} original_path - Original input path and filename
 * @property {string} file_path - Sanitized directory path
 * @property {string} file_name - Sanitized filename
 * @property {string} file_type - File extension without dot
 * @property {string} filename_without_extension - Filename without extension
 * @property {string} extension_with_dot - Extension including dot (e.g., ".txt")
 */
interface PathParseResult {
  original_path: string;
  file_path: string;
  file_name: string;
  file_type: string;
  filename_without_extension: string;
  extension_with_dot: string;
}

// Constants
const DEFAULTS = {
  MAX_LENGTH_POSIX: 4096, // Standard POSIX path limit
  MAX_LENGTH_WIN32: 260, // Windows MAX_PATH limit
  BUFFER_SIZE: 1024, // Balances memory usage and typical path lengths
  CHAR_CODES: Object.freeze({
    FORWARD_SLASH: 47,
    UNDERSCORE: 95,
    BACK_SLASH: 92,
    DOT: 46,
    NULL: 0,
    COLON: 58,
    HYPHEN: 45,
  }),
  BYTE_MASK: 0xff,
};

/** Windows reserved filenames */
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

/**
 * Manages a pool of reusable Uint8Array buffers
 * @class
 */
class BufferPool {
  private static pool: Map<number, Uint8Array[]> = new Map();
  private static readonly MAX_POOL_SIZE = 100; // Limits memory usage

  /** Retrieves or creates a buffer of specified size */
  static get(size: number): Uint8Array {
    const buffers = this.pool.get(size) || [];
    return buffers.pop() || new Uint8Array(size);
  }

  /** Returns a buffer to the pool if space allows */
  static release(buffer: Uint8Array): void {
    const buffers = this.pool.get(buffer.length) || [];
    if (buffers.length < this.MAX_POOL_SIZE) {
      buffers.push(buffer);
      this.pool.set(buffer.length, buffers);
    }
  }
}

/**
 * Secure random number generator with pooling
 * @class
 */
class SecureRNG {
  private buffer: Uint32Array;
  private index: number;
  private readonly BUFFER_SIZE = 16; // Small size for frequent refills vs memory

  constructor(seed?: Uint32Array) {
    this.buffer = seed ?? new Uint32Array(this.BUFFER_SIZE);
    this.index = seed ? 0 : this.BUFFER_SIZE;
  }

  private refillBuffer(): void {
    crypto.getRandomValues(this.buffer);
    this.index = 0;
  }

  /** Gets next random 32-bit unsigned integer */
  next(): number {
    if (this.index >= this.BUFFER_SIZE) this.refillBuffer();
    return this.buffer[this.index++] >>> 0;
  }

  /** Gets next random float between 0 and 1 */
  nextFloat(): number {
    return this.next() / 0x100000000;
  }
}

/**
 * Manages a pool of SecureRNG instances for concurrent use
 * @class
 */
class RNGPool {
  private static pool: SecureRNG[] = [];
  private static readonly MAX_POOL_SIZE = 50; // Limits RNG instance count

  /** Gets an RNG instance from pool or creates new */
  static get(seed?: Uint32Array): SecureRNG {
    return this.pool.pop() || new SecureRNG(seed);
  }

  /** Returns RNG to pool if space allows */
  static release(rng: SecureRNG): void {
    if (this.pool.length < this.MAX_POOL_SIZE) {
      this.pool.push(rng);
    }
  }
}

/**
 * Platform-specific path handling interface
 * @interface
 */
interface PlatformHandler {
  maxLength: number;
  normalizePath(input: string): string;
  isCaseSensitive: boolean;
}

/** Windows-specific path handler */
class Win32PlatformHandler implements PlatformHandler {
  readonly maxLength = DEFAULTS.MAX_LENGTH_WIN32;
  readonly isCaseSensitive = false;
  normalizePath(input: string): string {
    let path = input.replace(/\\+/g, "\\").replace(/^\.+/, "");
    if (/^[a-zA-Z]:/.test(path)) path = `/${path.charAt(0).toUpperCase()}${path.slice(2)}`;
    return path.replace(/\\/g, "/");
  }
}

/** POSIX-specific path handler */
class PosixPlatformHandler implements PlatformHandler {
  readonly maxLength = DEFAULTS.MAX_LENGTH_POSIX;
  readonly isCaseSensitive = true;
  normalizePath(input: string): string {
    return input.replace(/\/+/g, "/").replace(/\\/g, "/").replace(/^\.+/, "");
  }
}

/**
 * Unicode character mapping interface
 * @interface
 */
interface UnicodeMapper {
  map(char: number): number;
  compose?(input: string): string;
}

/** Default unicode to ASCII mapper */
class CompactUnicodeMapper implements UnicodeMapper {
  private readonly mappingTable: Uint16Array;
  constructor() {
    this.mappingTable = new Uint16Array(0x1000).fill(DEFAULTS.CHAR_CODES.UNDERSCORE);
    const mappings: [number, number][] = [
      ...Array.from({ length: 95 }, (_, i) => [32 + i, 32 + i] as [number, number]),
      // Simplified for brevity; expand as needed
    ];
    for (const [src, dst] of mappings) if (src < 0x1000) this.mappingTable[src] = dst;
  }
  map(char: number): number {
    return char < 0x1000 ? this.mappingTable[char] : DEFAULTS.CHAR_CODES.UNDERSCORE;
  }
  compose(input: string): string {
    return input;
  }
}

// Precomputed Lookups
const ILLEGAL_CHARS = new Uint8Array(256);
const ILLEGAL_FILENAME_CHARS = new Uint8Array(256);
(() => {
  const illegalCommon = [DEFAULTS.CHAR_CODES.NULL, 60, 62, 58, 34, 124, 63, 42, ...Array(32).keys()];
  for (const char of illegalCommon) {
    ILLEGAL_CHARS[char] = ILLEGAL_FILENAME_CHARS[char] = 1;
  }
  ILLEGAL_CHARS[DEFAULTS.CHAR_CODES.FORWARD_SLASH] = ILLEGAL_CHARS[DEFAULTS.CHAR_CODES.BACK_SLASH] = 0;
  ILLEGAL_FILENAME_CHARS[DEFAULTS.CHAR_CODES.FORWARD_SLASH] = ILLEGAL_FILENAME_CHARS[DEFAULTS.CHAR_CODES.BACK_SLASH] = 1;
})();

/** Checks if string is only whitespace */
const isSpaceOnly = (str: string): boolean => str.split("").every((char) => char.charCodeAt(0) <= 32);

/** Checks for path traversal attempts */
const containsTraversal = (str: string): boolean => /\.\.(?:\/|\\|$)/.test(str);

/**
 * Generates a yokai-inspired name
 * @param rng Random number generator
 * @param asFilename If true, generates flat filename without slashes
 */
const generateYokaiPath = (rng: SecureRNG, asFilename: boolean = false): string => {
  const idx1 = rng.next() % YOKAI_ONI_PATHS.length;
  const idx2 = rng.next() % YOKAI_ONI_PATHS.length;
  const base = YOKAI_ONI_PATHS[idx1] + YOKAI_ONI_PATHS[idx2].slice(1);
  return asFilename ? base.replace(/\//g, "_") : base;
};

/** Checks for excessive consecutive underscores */
const hasExcessiveUnderscores = (str: string): boolean => /_{4,}/.test(str);

/**
 * Sanitizes a filesystem path
 * @param input Raw path input
 * @param buffer Working buffer
 * @param rng Random number generator
 * @param platform Platform-specific handler
 * @returns Sanitized path with trailing slash
 */
function sanitizePath(input: string, buffer: Uint8Array, rng: SecureRNG, platform: PlatformHandler): string {
  if (isSpaceOnly(input)) return SPACE_PATHS[rng.next() % SPACE_PATHS.length];
  if (input.length > buffer.length || containsTraversal(input)) return generateYokaiPath(rng);

  const normalized = platform.normalizePath(input);
  let position = 0;
  if ((normalized.charCodeAt(0) & DEFAULTS.BYTE_MASK) !== DEFAULTS.CHAR_CODES.FORWARD_SLASH) {
    buffer[position++] = DEFAULTS.CHAR_CODES.FORWARD_SLASH;
  }

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i) & DEFAULTS.BYTE_MASK;
    buffer[position++] = ILLEGAL_CHARS[char]
      ? DEFAULTS.CHAR_CODES.UNDERSCORE
      : char === DEFAULTS.CHAR_CODES.BACK_SLASH
      ? DEFAULTS.CHAR_CODES.FORWARD_SLASH
      : char;
  }

  const result = new TextDecoder().decode(buffer.subarray(0, position));
  return result.endsWith("/") ? result : `${result}/`;
}

/**
 * Sanitizes a filename
 * @param input Raw filename input
 * @param buffer Working buffer
 * @param mapper Unicode character mapper
 * @param onOverflow Overflow handling strategy
 * @param platform Platform-specific handler
 * @returns Sanitized filename
 */
function sanitizeFilename(
  input: string,
  buffer: Uint8Array,
  mapper: UnicodeMapper,
  onOverflow: "error" | "ignore",
  platform: PlatformHandler
): string {
  if (input.length > buffer.length || containsTraversal(input)) {
    const rng = RNGPool.get();
    try {
      return generateYokaiPath(rng, true).slice(1);
    } finally {
      RNGPool.release(rng);
    }
  }

  const normalized = mapper.compose ? mapper.compose(platform.normalizePath(input)) : platform.normalizePath(input);
  let position = 0;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    const mapped =
      char >= 0xffff ? (onOverflow === "error" ? throwOverflow(char) : DEFAULTS.CHAR_CODES.UNDERSCORE) : mapper.map(char);
    buffer[position++] =
      ILLEGAL_FILENAME_CHARS[mapped & DEFAULTS.BYTE_MASK] || mapped > 255 ? DEFAULTS.CHAR_CODES.UNDERSCORE : mapped;
  }

  return new TextDecoder().decode(buffer.subarray(0, position)) || "file";
}

/**
 * Throws error for unicode overflow
 * @param char Unicode character code
 * @throws {Error} Detailed overflow error
 */
function throwOverflow(char: number): never {
  throw new Error(`Unicode character U+${char.toString(16).padStart(4, "0")} exceeds mapping range`);
}

/**
 * Generates a safe random filename
 * @param extension File extension
 * @param fileTypeWords Word mappings by filetype
 * @param rng Random number generator
 * @param accessible Use accessible naming
 * @returns Generated filename
 */
function generateSafeFilename(
  extension: string,
  fileTypeWords: Record<string, string[]>,
  rng: SecureRNG,
  accessible: boolean
): string {
  const words = fileTypeWords[extension.toLowerCase()] || fileTypeWords["default"];
  const word = words[rng.next() % words.length];
  const number = rng.next() % 10000;
  return accessible ? `${word}-${number}` : `${word}${number}`;
}

/**
 * Truncates filename to fit length constraints
 * @param baseName Base filename
 * @param extension File extension
 * @param available Available length
 * @param onTruncate Truncation strategy
 * @param accessible Use accessible naming
 * @returns Truncated filename
 */
function truncateFilename(
  baseName: string,
  extension: string,
  available: number,
  onTruncate: "error" | "smart" | "default",
  accessible: boolean
): string {
  if (onTruncate === "error") throw new Error(`Path exceeds maxLength of ${available}`);
  const extPart = extension ? `.${extension}` : "";
  if (available <= 1) return `f${extPart}`;
  return onTruncate === "smart" && available > 3
    ? `${baseName.substring(
        0,
        Math.min(
          baseName.indexOf(accessible ? "-" : "_") > -1 ? baseName.indexOf(accessible ? "-" : "_") : available,
          available
        )
      )}${extPart}`
    : `${baseName.substring(0, available)}${extPart}`;
}

/**
 * Validates and normalizes parsing options
 * @param options Input options
 * @returns Validated configuration
 */
function validateOptions(options: ParsePathOptions): {
  platform: PlatformHandler;
  maxLength: number;
  bufferSize: number;
  unicodeMapper: UnicodeMapper;
  config: any;
} {
  const platform =
    options.platformHandler ?? (detectPlatform() === "win32" ? new Win32PlatformHandler() : new PosixPlatformHandler());
  const maxLength = options.maxLength ?? platform.maxLength;
  if (maxLength < 1) throw new Error("maxLength must be positive");
  const bufferSize = options.bufferSize ?? DEFAULTS.BUFFER_SIZE;
  if (bufferSize < 256) throw new Error("bufferSize must be at least 256");
  const unicodeMapper = options.unicodeMapper ?? new CompactUnicodeMapper();
  if (options.unicodeMapper && typeof unicodeMapper.map !== "function") {
    throw new Error("unicodeMapper must implement map() function");
  }

  return {
    platform,
    maxLength,
    bufferSize,
    unicodeMapper,
    config: {
      onTruncate: options.onTruncate ?? "default",
      onUnicodeOverflow: options.onUnicodeOverflow ?? "ignore",
      fileTypeWords: options.fileTypeWords ?? DEFAULT_FILE_TYPE_WORDS,
      rng: RNGPool.get(options.seed),
      accessibleNames: options.accessibleNames ?? false,
    },
  };
}

/**
 * Parses and sanitizes a full path with filename
 * @param path Directory path (default: "/")
 * @param filename Filename (default: "file")
 * @param options Configuration options
 * @returns Sanitized path components
 */
export function parsePathComprehensive(
  path: string = "/",
  filename: string = "file",
  options: ParsePathOptions = {}
): PathParseResult {
  const { platform, maxLength, bufferSize, unicodeMapper, config } = validateOptions(options);

  const pathBuffer = BufferPool.get(bufferSize);
  const filenameBuffer = BufferPool.get(bufferSize);

  try {
    const sanitizedPath = sanitizePath(path, pathBuffer, config.rng, platform);
    const sanitizedBase = sanitizeFilename(filename, filenameBuffer, unicodeMapper, config.onUnicodeOverflow, platform);

    const { baseName, extension } = extractFileComponents(sanitizedBase);
    const safeBaseName = ensureSafeBaseName(baseName, extension, platform, config);

    const fileName = constructFinalFileName(sanitizedPath, safeBaseName, extension, maxLength, config);

    return buildResult(path, filename, sanitizedPath, fileName, safeBaseName, extension);
  } finally {
    BufferPool.release(pathBuffer);
    BufferPool.release(filenameBuffer);
    RNGPool.release(config.rng);
  }
}

/**
 * Extracts filename components
 * @param sanitizedBase Sanitized filename
 * @returns Base name and extension
 */
function extractFileComponents(sanitizedBase: string): { baseName: string; extension: string } {
  const extIndex = sanitizedBase.lastIndexOf(".");
  const baseName = extIndex > 0 ? sanitizedBase.substring(0, extIndex) : sanitizedBase;
  const extension = extIndex > 0 && extIndex < sanitizedBase.length - 1 ? sanitizedBase.substring(extIndex + 1) : "";
  return { baseName, extension };
}

/**
 * Ensures filename base is safe
 * @param baseName Base filename
 * @param extension File extension
 * @param platform Platform handler
 * @param config Configuration
 * @returns Safe base name
 */
function ensureSafeBaseName(baseName: string, extension: string, platform: PlatformHandler, config: any): string {
  const checkName = platform.isCaseSensitive ? baseName : baseName.toUpperCase();
  if (
    RESERVED_NAMES.has(checkName) ||
    RESERVED_NAMES.has(`${checkName}.${extension.toUpperCase()}`) ||
    hasExcessiveUnderscores(baseName)
  ) {
    return generateSafeFilename(extension, config.fileTypeWords, config.rng, config.accessibleNames);
  }
  return baseName;
}

/**
 * Constructs final filename
 * @param sanitizedPath Sanitized path
 * @param baseName Base filename
 * @param extension File extension
 * @param maxLength Maximum length
 * @param config Configuration
 * @returns Final filename
 */
function constructFinalFileName(
  sanitizedPath: string,
  baseName: string,
  extension: string,
  maxLength: number,
  config: any
): string {
  const extPart = extension ? `.${extension}` : "";
  const cleanBaseName = baseName.replace(/\//g, "_");
  const fullLength = sanitizedPath.length + cleanBaseName.length + extPart.length;
  return fullLength > maxLength
    ? truncateFilename(
        cleanBaseName,
        extension,
        maxLength - sanitizedPath.length - extPart.length,
        config.onTruncate,
        config.accessibleNames
      )
    : `${cleanBaseName}${extPart}`;
}

/**
 * Builds result object
 * @param originalPath Original path
 * @param originalFilename Original filename
 * @param sanitizedPath Sanitized path
 * @param fileName Final filename
 * @param baseName Base filename
 * @param extension File extension
 * @returns Parse result
 */
function buildResult(
  originalPath: string,
  originalFilename: string,
  sanitizedPath: string,
  fileName: string,
  baseName: string,
  extension: string
): PathParseResult {
  return {
    original_path: `${originalPath}${originalFilename}`,
    file_path: sanitizedPath,
    file_name: fileName,
    file_type: extension,
    filename_without_extension: baseName,
    extension_with_dot: extension ? `.${extension}` : "",
  };
}

/** Detects current platform */
function detectPlatform(): "win32" | "posix" {
  return typeof process !== "undefined" && process.platform === "win32" ? "win32" : "posix";
}

/** Runs comprehensive test suite */
function runTests(): void {
  const tests: [string, string, ParsePathOptions | undefined][] = [
    ["e", "test.txt", undefined],
    [" ", "file.txt", undefined],
    ["/long/path", "very_long_name.pdf", { maxLength: 20, onTruncate: "smart" }],
    ["../evil", "file.txt", undefined],
    ["/path", "test___doc.txt", undefined],
    ["/path", "test____doc.txt", undefined],
    ["/path", "test____doc.txt", { accessibleNames: true }],
    ["C:\\Users\\Docs", "テスト.txt", { platformHandler: new Win32PlatformHandler() }],
    ["/home/user", "人山.pdf", { platformHandler: new PosixPlatformHandler() }],
    ["/path", "ملف.txt", { platformHandler: new PosixPlatformHandler() }],
    ["/path", "🦁test.txt", { onUnicodeOverflow: "error" }],
    ["/path", "🦁test.txt", { onUnicodeOverflow: "ignore", accessibleNames: true }],
    ["/", "", undefined],
    ["/", "CON", undefined],
    ["/path with spaces/", "file.txt", undefined],
    ["/", "a".repeat(5000), { maxLength: 4096 }],
  ];

  tests.forEach(([path, filename, options], i) => {
    try {
      console.log(`Test ${i + 1}:`, JSON.stringify(parsePathComprehensive(path, filename, options), null, 2));
    } catch (e) {
      console.log(`Test ${i + 1} failed:`, e);
    }
  });
}

runTests();
