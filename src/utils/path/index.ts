// Importing predefined lists from "names.ts" for safe random names/paths.
import { DEFAULT_FILE_TYPE_WORDS, SPACE_PATHS, YOKAI_ONI_PATHS } from "./names.ts";

// Custom Error Classes
class PathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathError";
  }
}

class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

// Constants with Type Safety
const DEFAULTS = {
  MAX_LENGTH_POSIX: 4096 as const,
  MAX_LENGTH_WIN32: 260 as const,
  BUFFER_SIZE: 1024 as const,
  BUFFER_SIZE_CATEGORIES: [256, 512, 1024, 2048, 4096] as const,
  CHAR_CODES: {
    FORWARD_SLASH: 47 as const,
    UNDERSCORE: 95 as const,
    BACK_SLASH: 92 as const,
    DOT: 46 as const,
    NULL: 0 as const,
    COLON: 58 as const,
    HYPHEN: 45 as const,
  } as const,
  BYTE_MASK: 0xff as const,
} as const;

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
]) as ReadonlySet<string>;

const ILLEGAL_CHARS = new Uint8Array(256);
const ILLEGAL_FILENAME_CHARS = new Uint8Array(256);
(() => {
  const illegalCommon = [0, 60, 62, 58, 34, 124, 63, 42, ...Array(32).keys()] as const;
  for (const char of illegalCommon) {
    ILLEGAL_CHARS[char] = ILLEGAL_FILENAME_CHARS[char] = 1;
  }
  ILLEGAL_CHARS[47] = ILLEGAL_CHARS[92] = 0;
  ILLEGAL_FILENAME_CHARS[47] = ILLEGAL_FILENAME_CHARS[92] = 1;
})();

// Branded Types for Enhanced Safety
type BufferSize = (typeof DEFAULTS.BUFFER_SIZE_CATEGORIES)[number];
type TruncateMode = "error" | "smart" | "default";
type UnicodeOverflowMode = "error" | "ignore";

// Interfaces
interface ParsePathOptions {
  maxLength?: number;
  unicodeMapper?: UnicodeMapper;
  onTruncate?: TruncateMode;
  onUnicodeOverflow?: UnicodeOverflowMode;
  seed?: Uint32Array;
  fileTypeWords?: Readonly<Record<string, readonly string[]>>;
  bufferSize?: BufferSize;
  platformHandler?: PlatformHandler;
  accessibleNames?: boolean;
}

interface PathParseResult {
  readonly original_path: string;
  readonly file_path: string;
  readonly file_name: string;
  readonly file_type: string;
  readonly filename_without_extension: string;
  readonly extension_with_dot: string;
}

interface PlatformHandler {
  readonly maxLength: number;
  normalizePath(input: string): string;
  readonly isCaseSensitive: boolean;
}

interface UnicodeMapper {
  map(char: number): number;
  compose(input: string): string;
}

// Utility Functions
function detectPlatform(): "win32" | "posix" {
  return typeof process !== "undefined" && process.platform === "win32" ? "win32" : "posix";
}

function isSpaceOnly(str: string): boolean {
  for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) > 32) return false;
  return true;
}

function containsTraversal(str: string): boolean {
  const len = str.length;
  for (let i = 0; i < len - 1; i++) {
    if (str[i] === "." && str[i + 1] === "." && (i + 2 >= len || str[i + 2] === "/" || str[i + 2] === "\\")) return true;
  }
  return false;
}

function hasExcessiveUnderscores(str: string): boolean {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === DEFAULTS.CHAR_CODES.UNDERSCORE) {
      if (++count >= 3) return true;
    } else {
      count = 0;
    }
  }
  return false;
}

function containsNullByte(str: string): boolean {
  for (let i = 0; i < str.length; i++) if (str.charCodeAt(i) === DEFAULTS.CHAR_CODES.NULL) return true;
  return false;
}

function isHiddenFile(str: string): boolean {
  return str.charCodeAt(0) === DEFAULTS.CHAR_CODES.DOT;
}

function throwOverflow(char: number): never {
  throw new SecurityError(`Unicode character U+${char.toString(16).padStart(4, "0")} exceeds mapping range`);
}

// Classes
class SecureRNG {
  private readonly buffer: Uint32Array;
  private index: number;
  private readonly BUFFER_SIZE = 256 as const;

  constructor(seed?: Uint32Array) {
    this.buffer = seed ?? new Uint32Array(this.BUFFER_SIZE);
    this.index = seed ? 0 : this.BUFFER_SIZE;
  }

  private refillBuffer(): void {
    crypto.getRandomValues(this.buffer);
    this.index = 0;
  }

  next(): number {
    if (this.index >= this.BUFFER_SIZE) this.refillBuffer();
    return this.buffer[this.index++] >>> 0;
  }

  nextFloat(): number {
    return this.next() / 0x100000000;
  }
}

class RNGPool {
  private static readonly pool: SecureRNG[] = [];
  private static readonly MAX_POOL_SIZE = 50 as const;
  private static lock: Promise<void> = Promise.resolve();

  private static async withLock<T>(operation: () => T): Promise<T> {
    const unlock = this.lock;
    this.lock = new Promise((resolve) => setTimeout(resolve, 0)); // Microtask to prevent blocking
    await unlock;
    return operation();
  }

  static async get(seed?: Uint32Array): Promise<SecureRNG> {
    return this.withLock(() => this.pool.pop() ?? new SecureRNG(seed));
  }

  static async release(rng: SecureRNG): Promise<void> {
    await this.withLock(() => {
      if (this.pool.length < this.MAX_POOL_SIZE) {
        this.pool.push(rng);
      }
    });
  }
}

// Improved BufferPool with Robust Thread Safety
class BufferPool {
  private static readonly pools: ReadonlyMap<BufferSize, Set<Uint8Array>> = new Map(
    DEFAULTS.BUFFER_SIZE_CATEGORIES.map((size) => [size, new Set()])
  );
  private static readonly fastPathCache: Uint8Array[] = [];
  private static readonly FAST_PATH_SIZE = DEFAULTS.BUFFER_SIZE;
  private static readonly FAST_PATH_MAX = 5 as const;
  private static readonly MAX_POOL_SIZE = 50 as const;
  private static lock: Promise<void> = Promise.resolve();

  private static getBufferCategory(size: number): BufferSize {
    const category = DEFAULTS.BUFFER_SIZE_CATEGORIES.find((cat) => cat >= size);
    if (!category) {
      return DEFAULTS.BUFFER_SIZE_CATEGORIES[DEFAULTS.BUFFER_SIZE_CATEGORIES.length - 1];
    }
    return category;
  }

  private static async withLock<T>(operation: () => T): Promise<T> {
    const unlock = this.lock;
    this.lock = new Promise((resolve) => setTimeout(resolve, 0)); // Microtask for fairness
    await unlock;
    return operation();
  }

  static async get(size: number): Promise<Uint8Array> {
    return this.withLock(() => {
      const category = this.getBufferCategory(size);
      if (category === this.FAST_PATH_SIZE && this.fastPathCache.length > 0) {
        return this.fastPathCache.pop()!;
      }
      const pool = this.pools.get(category);
      if (!pool) throw new Error(`No pool for buffer size ${category}`);
      const buffer = pool.size > 0 ? pool.values().next().value : new Uint8Array(category);
      if (pool.size > 0) pool.delete(buffer);
      return buffer;
    });
  }

  static async release(buffer: Uint8Array): Promise<void> {
    await this.withLock(() => {
      const size = buffer.length as BufferSize;
      if (!DEFAULTS.BUFFER_SIZE_CATEGORIES.includes(size)) return; // Ignore invalid sizes
      if (size === this.FAST_PATH_SIZE && this.fastPathCache.length < this.FAST_PATH_MAX) {
        this.fastPathCache.push(buffer);
        return;
      }
      const pool = this.pools.get(size);
      if (pool && pool.size < this.MAX_POOL_SIZE) {
        pool.add(buffer);
      }
    });
  }

  static async getBatch(sizes: readonly number[]): Promise<Uint8Array[]> {
    return this.withLock(() => {
      return sizes.map((size) => {
        const category = this.getBufferCategory(size);
        if (category === this.FAST_PATH_SIZE && this.fastPathCache.length > 0) {
          return this.fastPathCache.pop()!;
        }
        const pool = this.pools.get(category);
        if (!pool) throw new Error(`No pool for buffer size ${category}`);
        const buffer = pool.size > 0 ? pool.values().next().value : new Uint8Array(category);
        if (pool.size > 0) pool.delete(buffer);
        return buffer;
      });
    });
  }

  static async releaseBatch(buffers: readonly Uint8Array[]): Promise<void> {
    await this.withLock(() => {
      for (const buffer of buffers) {
        const size = buffer.length as BufferSize;
        if (!DEFAULTS.BUFFER_SIZE_CATEGORIES.includes(size)) continue; // Skip invalid sizes
        if (size === this.FAST_PATH_SIZE && this.fastPathCache.length < this.FAST_PATH_MAX) {
          this.fastPathCache.push(buffer);
          continue;
        }
        const pool = this.pools.get(size);
        if (pool && pool.size < this.MAX_POOL_SIZE) {
          pool.add(buffer);
        }
      }
    });
  }

  static async clear(): Promise<void> {
    await this.withLock(() => {
      this.pools.forEach((pool) => pool.clear());
      this.fastPathCache.length = 0;
    });
  }
}

class Win32PlatformHandler implements PlatformHandler {
  readonly maxLength = DEFAULTS.MAX_LENGTH_WIN32;
  readonly isCaseSensitive = false;

  normalizePath(input: string): string {
    let path = input.replace(/\\+/g, "\\").replace(/^\.+/, "");
    if (/^[a-zA-Z]:/.test(path)) path = `/${path.charAt(0).toUpperCase()}${path.slice(2)}`;
    return path.replace(/\\/g, "/");
  }
}

class PosixPlatformHandler implements PlatformHandler {
  readonly maxLength = DEFAULTS.MAX_LENGTH_POSIX;
  readonly isCaseSensitive = true;

  normalizePath(input: string): string {
    return input.replace(/\/+/g, "/").replace(/\\/g, "/").replace(/^\.+/, "");
  }
}

namespace PlatformConfig {
  export const platform: PlatformHandler =
    detectPlatform() === "win32" ? new Win32PlatformHandler() : new PosixPlatformHandler();
  export const handler: PlatformHandler = platform;
}

class CompactUnicodeMapper implements UnicodeMapper {
  private mappingTable: Uint8Array | null = null;

  private initTable(): void {
    if (this.mappingTable) return;
    this.mappingTable = new Uint8Array(0x1000).fill(DEFAULTS.CHAR_CODES.UNDERSCORE);
    for (let i = 32; i < 127; i++) this.mappingTable[i] = i;
  }

  map(char: number): number {
    this.initTable();
    return char < 0x1000 ? this.mappingTable![char] : DEFAULTS.CHAR_CODES.UNDERSCORE;
  }

  compose(input: string): string {
    return input;
  }
}

// Core Functions
function generateYokaiPath(rng: SecureRNG, asFilename: boolean = false): string {
  const idx1 = rng.next() % YOKAI_ONI_PATHS.length;
  const idx2 = rng.next() % YOKAI_ONI_PATHS.length;
  const base = YOKAI_ONI_PATHS[idx1] + YOKAI_ONI_PATHS[idx2].slice(1);
  return asFilename ? base.replace(/\//g, "_") : base;
}

function sanitizePath(input: string, buffer: Uint8Array, rng: SecureRNG, platform: PlatformHandler): string {
  if (containsNullByte(input)) throw new SecurityError("Path contains null byte, security risk");
  if (input.length > platform.maxLength) throw new PathError("Path exceeds max length, overflow risk");

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
  return result.endsWith("/") ? result : result + "/";
}

async function sanitizeFilename(
  input: string,
  buffer: Uint8Array,
  mapper: UnicodeMapper,
  onOverflow: UnicodeOverflowMode,
  platform: PlatformHandler
): Promise<string> {
  if (containsNullByte(input)) throw new SecurityError("Filename contains null byte, potential security risk");
  if (isHiddenFile(input)) throw new SecurityError("Hidden filenames (starting with '.') are not allowed for security");
  if (input.length > buffer.length || containsTraversal(input)) {
    const rng = await RNGPool.get();
    try {
      return generateYokaiPath(rng, true).slice(1);
    } finally {
      await RNGPool.release(rng);
    }
  }

  const normalized = mapper.compose(platform.normalizePath(input));
  let position = 0;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    const mapped =
      char >= 0xffff ? (onOverflow === "error" ? throwOverflow(char) : DEFAULTS.CHAR_CODES.UNDERSCORE) : mapper.map(char);
    buffer[position++] =
      (mapped < 256 && ILLEGAL_FILENAME_CHARS[mapped]) || mapped > 255 ? DEFAULTS.CHAR_CODES.UNDERSCORE : mapped;
  }

  return new TextDecoder().decode(buffer.subarray(0, position)) || "file";
}

function generateSafeFilename(
  extension: string,
  fileTypeWords: Readonly<Record<string, readonly string[]>>,
  rng: SecureRNG,
  accessible: boolean
): string {
  const words = fileTypeWords[extension.toLowerCase()] ?? fileTypeWords["default"] ?? ["file"];
  const word = words[rng.next() % words.length];
  const number = rng.next() % 10000;
  return accessible ? `${word}-${number}` : `${word}${number}`;
}

function truncateFilename(
  baseName: string,
  extension: string,
  available: number,
  onTruncate: TruncateMode,
  accessible: boolean
): string {
  if (onTruncate === "error") throw new PathError(`Path exceeds maxLength of ${available}`);
  const extPart = extension ? `.${extension}` : "";
  if (available <= 1) return `f${extPart}`;
  const cutPoint =
    onTruncate === "smart" && available > 3
      ? Math.min(
          baseName.indexOf(accessible ? "-" : "_") > -1 ? baseName.indexOf(accessible ? "-" : "_") : available,
          available
        )
      : available;
  return `${baseName.slice(0, cutPoint)}${extPart}`;
}

function validateOptions(options: ParsePathOptions): {
  readonly platform: PlatformHandler;
  readonly maxLength: number;
  readonly bufferSize: BufferSize;
  readonly unicodeMapper: UnicodeMapper;
  readonly config: {
    readonly onTruncate: TruncateMode;
    readonly onUnicodeOverflow: UnicodeOverflowMode;
    readonly fileTypeWords: Readonly<Record<string, readonly string[]>>;
    readonly rng: Promise<SecureRNG>;
    readonly accessibleNames: boolean;
  };
} {
  const platform = options.platformHandler ?? PlatformConfig.handler;
  const maxLength = options.maxLength ?? platform.maxLength;
  if (maxLength < 1) throw new PathError("maxLength must be positive");
  if (maxLength > platform.maxLength) throw new SecurityError("maxLength exceeds platform limit, potential security risk");
  const bufferSize = (options.bufferSize ?? DEFAULTS.BUFFER_SIZE) as BufferSize;
  if (!DEFAULTS.BUFFER_SIZE_CATEGORIES.includes(bufferSize)) {
    throw new PathError(`bufferSize must be one of ${DEFAULTS.BUFFER_SIZE_CATEGORIES.join(", ")}`);
  }
  const unicodeMapper = options.unicodeMapper ?? getCachedUnicodeMapper();
  if (options.unicodeMapper && (typeof unicodeMapper.map !== "function" || typeof unicodeMapper.compose !== "function")) {
    throw new PathError("unicodeMapper must implement map() and compose() functions");
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

function extractFileComponents(sanitizedBase: string): { readonly baseName: string; readonly extension: string } {
  const extIndex = sanitizedBase.lastIndexOf(".");
  const baseName = extIndex > 0 ? sanitizedBase.slice(0, extIndex) : sanitizedBase;
  const extension = extIndex > 0 && extIndex < sanitizedBase.length - 1 ? sanitizedBase.slice(extIndex + 1) : "";
  return { baseName, extension };
}

async function ensureSafeBaseName(
  baseName: string,
  extension: string,
  platform: PlatformHandler,
  config: ReturnType<typeof validateOptions>["config"]
): Promise<string> {
  const checkName = platform.isCaseSensitive ? baseName : baseName.toUpperCase();
  if (
    RESERVED_NAMES.has(checkName) ||
    RESERVED_NAMES.has(`${checkName}.${extension.toUpperCase()}`) ||
    hasExcessiveUnderscores(baseName)
  ) {
    const rng = await config.rng;
    return generateSafeFilename(extension, config.fileTypeWords, rng, config.accessibleNames);
  }
  return baseName;
}

function constructFinalFileName(
  sanitizedPath: string,
  baseName: string,
  extension: string,
  maxLength: number,
  config: ReturnType<typeof validateOptions>["config"]
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

// Cached Utilities
const getCachedUnicodeMapper = (() => {
  let cached: UnicodeMapper | null = null;
  return (): UnicodeMapper => {
    if (!cached) cached = new CompactUnicodeMapper();
    return cached;
  };
})();

// Main Export
export async function parsePathComprehensive(
  path: string = "/",
  filename: string = "file",
  options: ParsePathOptions = {}
): Promise<PathParseResult> {
  const { platform, maxLength, bufferSize, unicodeMapper, config } = validateOptions(options);

  const fullInput = `${path}${filename}`;
  if (fullInput.length > maxLength) {
    throw new PathError("Combined path and filename exceed maxLength, potential overflow risk");
  }

  const [pathBuffer, filenameBuffer] = await BufferPool.getBatch([bufferSize, bufferSize]);

  try {
    const rng = await config.rng;
    const sanitizedPath = sanitizePath(path, pathBuffer, rng, platform);
    const sanitizedBase = await sanitizeFilename(
      filename,
      filenameBuffer,
      unicodeMapper,
      config.onUnicodeOverflow,
      platform
    );
    const { baseName, extension } = extractFileComponents(sanitizedBase);

    if (!extension) {
      throw new PathError("File does not have an extension, cannot process");
    }

    const safeBaseName = await ensureSafeBaseName(baseName, extension, platform, config);
    const fileName = constructFinalFileName(sanitizedPath, safeBaseName, extension, maxLength, config);

    if (containsNullByte(fileName)) {
      throw new SecurityError("Generated filename contains null byte, security violation");
    }

    return buildResult(path, filename, sanitizedPath, fileName, safeBaseName, extension);
  } finally {
    await BufferPool.releaseBatch([pathBuffer, filenameBuffer]);
    await RNGPool.release(await config.rng);
  }
}

// Tests
async function runTests(): Promise<void> {
  const tests: ReadonlyArray<readonly [string, string, ParsePathOptions | undefined]> = [
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
    ["/", "a".repeat(5000) + ".txt", { maxLength: 4096 }],
    ["/", "file%00hack.txt", undefined],
    ["/", ".hidden.txt", undefined],
  ];

  for (let i = 0; i < tests.length; i++) {
    const [path, filename, options] = tests[i];
    try {
      const result = await parsePathComprehensive(path, filename, options);
      console.log(`Test ${i + 1}:`, JSON.stringify(result, null, 2));
    } catch (e) {
      console.log(`Test ${i + 1} failed:`, e instanceof Error ? e.message : String(e));
    }
  }
}

if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
  void runTests();
}
