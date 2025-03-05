// Mocked imports from "names.ts" for testing
const DEFAULT_FILE_TYPE_WORDS = {
  txt: ["document", "note", "text"],
  default: ["file"],
} as const;

const SPACE_PATHS = ["/space1/", "/space2/", "/space3/"] as const;
const YOKAI_ONI_PATHS = ["/yokai/oni1", "/yokai/oni2", "/yokai/oni3"] as const;

// === Custom Error Classes ===
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

// === Constants with Type Safety ===
const DEFAULTS = {
  MAX_LENGTH_POSIX: 4096 as const,
  MAX_LENGTH_WIN32: 260 as const,
  BUFFER_SIZE: 1024 as const,
  MAX_EXTENSION_LENGTH: 10 as const,
  DEFAULT_EXTENSION: "txt" as const,
  CHAR_CODES: {
    FORWARD_SLASH: 47 as const,
    UNDERSCORE: 95 as const,
    BACK_SLASH: 92 as const,
    DOT: 46 as const,
    NULL: 0 as const,
    COLON: 58 as const,
    HYPHEN: 45 as const,
    RTL_OVERRIDE: 8238 as const,
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

const ILLEGAL_CHARS_SET = new Set<number>([
  0,
  60,
  62,
  58,
  34,
  124,
  63,
  42,
  DEFAULTS.CHAR_CODES.RTL_OVERRIDE,
  ...Array(32).keys(),
]);
const ILLEGAL_FILENAME_CHARS_SET = new Set<number>([
  0,
  60,
  62,
  58,
  34,
  124,
  63,
  42,
  47,
  92,
  DEFAULTS.CHAR_CODES.RTL_OVERRIDE,
  ...Array(32).keys(),
]);

// === Types and Interfaces ===
type TruncateMode = "error" | "smart" | "default";
type UnicodeOverflowMode = "error" | "ignore";

interface ParsePathOptions {
  maxLength?: number;
  unicodeMapper?: UnicodeMapper;
  onTruncate?: TruncateMode;
  onUnicodeOverflow?: UnicodeOverflowMode;
  seed?: Uint32Array;
  fileTypeWords?: Readonly<Record<string, readonly string[]>>;
  bufferSize?: number;
  platformHandler?: PlatformHandler;
  accessibleNames?: boolean;
  defaultExtension?: string;
  cacheSize?: number;
  trailingSlash?: boolean;
  allowHiddenFiles?: boolean;
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

// === Custom LRU Cache Implementation ===
class LRUCache<K, V> {
  private readonly maxSize: number;
  private readonly map: Map<K, CacheNode<K, V>>;
  private head: CacheNode<K, V> | null = null;
  private tail: CacheNode<K, V> | null = null;
  private size: number = 0;

  constructor(maxSize: number) {
    if (maxSize < 1) throw new RangeError("maxSize must be positive");
    this.maxSize = maxSize;
    this.map = new Map<K, CacheNode<K, V>>();
  }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    this.moveToFront(node);
    return node.value;
  }

  set(key: K, value: V): void {
    let node = this.map.get(key);
    if (node) {
      node.value = value;
      this.moveToFront(node);
    } else {
      node = { key, value, prev: null, next: null };
      this.map.set(key, node);
      this.addToFront(node);
      this.size++;
      if (this.size > this.maxSize) this.evict();
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  private moveToFront(node: CacheNode<K, V>): void {
    if (node === this.head) return;
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.tail) this.tail = node.prev;
    node.next = this.head;
    node.prev = null;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private addToFront(node: CacheNode<K, V>): void {
    node.next = this.head;
    node.prev = null;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private evict(): void {
    if (!this.tail) return;
    const key = this.tail.key;
    if (this.tail.prev) this.tail.prev.next = null;
    this.tail = this.tail.prev;
    this.map.delete(key);
    this.size--;
    if (this.size === 0) this.head = null;
  }
}

interface CacheNode<K, V> {
  key: K;
  value: V;
  prev: CacheNode<K, V> | null;
  next: CacheNode<K, V> | null;
}

// === Resource Management ===
class SecureRNG {
  private readonly buffer: Uint32Array;
  private index: number;
  private readonly BUFFER_SIZE = 256;

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
}

class ResourceFactory {
  private static bufferPoolSize = 50;
  private static rngPoolSize = 50;

  static createBufferPool(loadFactor: number = 1): BufferPool {
    this.adjustPoolSize(loadFactor);
    return new BufferPool(this.bufferPoolSize);
  }

  static createRNGPool(loadFactor: number = 1): RNGPool {
    this.adjustPoolSize(loadFactor);
    return new RNGPool(this.rngPoolSize);
  }

  static adjustPoolSize(loadFactor: number): void {
    this.bufferPoolSize = Math.min(1000, Math.max(10, Math.floor(loadFactor * 50)));
    this.rngPoolSize = this.bufferPoolSize;
  }
}

class RNGPool {
  private readonly pool: SecureRNG[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(seed?: Uint32Array): SecureRNG {
    return this.pool.pop() ?? new SecureRNG(seed);
  }

  release(rng: SecureRNG): void {
    if (this.pool.length < this.maxSize) this.pool.push(rng);
  }
}

class BufferPool {
  private readonly pool: Uint8Array[];
  private readonly usedBuffers: Set<Uint8Array> = new Set();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.pool = [256, 512, 1024, 2048, 4096].map((size) => new Uint8Array(size));
  }

  get(size: number): Uint8Array {
    const available = this.pool.filter((b) => !this.usedBuffers.has(b) && b.length >= size);
    let buffer =
      available.length > 0
        ? available.reduce((a, b) => (a.length < b.length ? a : b))
        : new Uint8Array(Math.max(size, DEFAULTS.BUFFER_SIZE));
    this.usedBuffers.add(buffer);
    this.pool.push(buffer);
    this.trimPool();
    return buffer;
  }

  release(buffer: Uint8Array): void {
    this.usedBuffers.delete(buffer);
  }

  encode(str: string): Uint8Array {
    return this.encoder.encode(str);
  }

  decode(buffer: Uint8Array, start: number, end: number): string {
    return this.decoder.decode(buffer.subarray(start, end));
  }

  private trimPool(): void {
    if (this.pool.length > this.maxSize) {
      this.pool.length = this.maxSize;
    }
  }
}

// === Platform Handlers ===
class Win32PlatformHandler implements PlatformHandler {
  readonly maxLength = DEFAULTS.MAX_LENGTH_WIN32;
  readonly isCaseSensitive = false;
  private readonly normalizeCache: LRUCache<string, string>;

  constructor(cacheSize?: number, inputLength: number = 0) {
    const defaultCacheSize = Math.min(1000, Math.max(10, Math.ceil(inputLength / 10)));
    this.normalizeCache = new LRUCache<string, string>(cacheSize ?? defaultCacheSize);
  }

  normalizePath(input: string): string {
    if (this.normalizeCache.has(input)) return this.normalizeCache.get(input)!;
    const normalized = input.replace(/\\+/g, "/").replace(/^([a-zA-Z]):/, (_, drive) => `${drive.toUpperCase()}:`);
    this.normalizeCache.set(input, normalized);
    return normalized;
  }
}

class PosixPlatformHandler implements PlatformHandler {
  readonly maxLength = DEFAULTS.MAX_LENGTH_POSIX;
  readonly isCaseSensitive = true;
  private readonly normalizeCache: LRUCache<string, string>;

  constructor(cacheSize?: number, inputLength: number = 0) {
    const defaultCacheSize = Math.min(1000, Math.max(10, Math.ceil(inputLength / 10)));
    this.normalizeCache = new LRUCache<string, string>(cacheSize ?? defaultCacheSize);
  }

  normalizePath(input: string): string {
    if (this.normalizeCache.has(input)) return this.normalizeCache.get(input)!;
    const normalized = input.replace(/\/+/g, "/");
    this.normalizeCache.set(input, normalized);
    return normalized;
  }
}

// === Unicode Handling ===
class CompactUnicodeMapper implements UnicodeMapper {
  private readonly mappingTable: Map<number, number>;

  constructor() {
    this.mappingTable = new Map();
    for (let i = 32; i < 127; i++) this.mappingTable.set(i, i);
  }

  map(char: number): number {
    return this.mappingTable.get(char) ?? (char <= 0x10ffff ? char : DEFAULTS.CHAR_CODES.UNDERSCORE);
  }

  compose(input: string): string {
    return input.normalize("NFC");
  }
}

// === Utility Functions ===
const detectPlatform = (): "win32" | "posix" =>
  typeof process !== "undefined" && process.platform === "win32" ? "win32" : "posix";

const isSpaceOnly = (str: string): boolean => str.trim() === "";

const containsTraversal = (str: string): boolean => {
  for (let i = 0; i < str.length - 1; i++) {
    if (
      str.charCodeAt(i) === DEFAULTS.CHAR_CODES.DOT &&
      str.charCodeAt(i + 1) === DEFAULTS.CHAR_CODES.DOT &&
      (i + 2 >= str.length ||
        str.charCodeAt(i + 2) === DEFAULTS.CHAR_CODES.FORWARD_SLASH ||
        str.charCodeAt(i + 2) === DEFAULTS.CHAR_CODES.BACK_SLASH)
    ) {
      return true;
    }
  }
  return false;
};

const hasExcessiveUnderscores = (str: string): boolean => {
  let underscoreCount = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === DEFAULTS.CHAR_CODES.UNDERSCORE) {
      underscoreCount++;
      if (underscoreCount >= 3) return true;
    } else {
      underscoreCount = 0;
    }
  }
  return false;
};

const containsNullByte = (str: string): boolean => str.includes("\0");

const isHiddenFile = (str: string): boolean => str.charCodeAt(0) === DEFAULTS.CHAR_CODES.DOT;

const containsRTLOverride = (str: string): boolean => /\u202E/.test(str);

const isValidExtension = (ext: string): boolean => {
  return ext.length > 0 && ext.length <= DEFAULTS.MAX_EXTENSION_LENGTH && /^[a-zA-Z0-9]+$/.test(ext);
};

// === Core Functions ===
const generateYokaiPath = (rng: SecureRNG, asFilename: boolean = false): string => {
  const idx1 = rng.next() % YOKAI_ONI_PATHS.length;
  const idx2 = rng.next() % YOKAI_ONI_PATHS.length;
  const base = YOKAI_ONI_PATHS[idx1] + YOKAI_ONI_PATHS[idx2].slice(1);
  return asFilename ? base.replace(/\//g, "_") : base;
};

function sanitizePath(
  input: string,
  buffer: Uint8Array,
  rng: SecureRNG,
  platform: PlatformHandler,
  bufferPool: BufferPool,
  trailingSlash: boolean
): string {
  if (containsNullByte(input)) throw new SecurityError(`Path "${input}" contains null byte`);
  if (input.length > platform.maxLength) throw new PathError(`Path "${input}" exceeds max length`);

  const neutralizedInput = input.replace(/\u202E/g, "_");
  if (isSpaceOnly(neutralizedInput)) return SPACE_PATHS[rng.next() % SPACE_PATHS.length];
  if (containsTraversal(neutralizedInput)) return generateYokaiPath(rng);

  const normalized = platform.normalizePath(neutralizedInput);
  const encoded = bufferPool.encode(normalized);
  let position = 0;

  if (normalized.charCodeAt(0) !== DEFAULTS.CHAR_CODES.FORWARD_SLASH) {
    if (position >= buffer.length) throw new PathError("Buffer too small for path");
    buffer[position++] = DEFAULTS.CHAR_CODES.FORWARD_SLASH;
  }

  for (let i = 0; i < encoded.length && position < buffer.length; i++) {
    const char = encoded[i];
    buffer[position++] = ILLEGAL_CHARS_SET.has(char)
      ? DEFAULTS.CHAR_CODES.UNDERSCORE
      : char === DEFAULTS.CHAR_CODES.BACK_SLASH
      ? DEFAULTS.CHAR_CODES.FORWARD_SLASH
      : char;
  }

  const result = bufferPool.decode(buffer, 0, position);
  return trailingSlash && !result.endsWith("/") ? `${result}/` : result;
}

function sanitizeFilename(
  input: string,
  buffer: Uint8Array,
  mapper: UnicodeMapper,
  onOverflow: UnicodeOverflowMode,
  platform: PlatformHandler,
  bufferPool: BufferPool,
  defaultExtension: string,
  allowHiddenFiles: boolean
): string {
  if (containsNullByte(input)) throw new SecurityError(`Filename "${input}" contains null byte`);
  if (!allowHiddenFiles && isHiddenFile(input)) throw new SecurityError(`Hidden filename "${input}" not allowed`);
  if (input.length > buffer.length || containsTraversal(input)) return generateYokaiPath(new SecureRNG(), true).slice(1);

  let neutralizedInput = input.replace(/\u202E/g, "_");
  if (neutralizedInput === "") neutralizedInput = `file.${defaultExtension}`;
  const extIndex = neutralizedInput.lastIndexOf(".");
  if (extIndex === -1 || extIndex === neutralizedInput.length - 1) {
    neutralizedInput += `.${defaultExtension}`;
  }

  const normalized = mapper.compose(neutralizedInput);
  const encoded = bufferPool.encode(normalized);
  let position = 0;

  for (let i = 0; i < normalized.length && position < buffer.length; i++) {
    const char = normalized.charCodeAt(i);
    const mapped =
      char >= 0xffff && onOverflow === "error"
        ? (() => {
            throw new SecurityError(`Unicode character U+${char.toString(16).padStart(4, "0")} exceeds mapping range`);
          })()
        : mapper.map(char);
    // Preserve dot for hidden files if allowed
    buffer[position++] =
      (ILLEGAL_FILENAME_CHARS_SET.has(mapped) && !(allowHiddenFiles && mapped === DEFAULTS.CHAR_CODES.DOT && i === 0)) ||
      mapped > 255
        ? DEFAULTS.CHAR_CODES.UNDERSCORE
        : mapped;
  }

  return bufferPool.decode(buffer, 0, position) || `file.${defaultExtension}`;
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
  return accessible ? `${word}-${number}.${extension}` : `${word}${number}.${extension}`;
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
  if (available <= extPart.length + 1) return `f${extPart}`;
  const cutPoint =
    onTruncate === "smart" && available > extPart.length + 3
      ? Math.min(
          baseName.indexOf(accessible ? "-" : "") > -1
            ? baseName.indexOf(accessible ? "-" : "")
            : available - extPart.length,
          available - extPart.length
        )
      : available - extPart.length;
  return `${baseName.slice(0, cutPoint)}${extPart}`;
}

function extractFileComponents(sanitizedBase: string): { baseName: string; extension: string } {
  const extIndex = sanitizedBase.lastIndexOf(".");
  const baseName = extIndex > 0 ? sanitizedBase.slice(0, extIndex) : sanitizedBase;
  const extension = extIndex > 0 && extIndex < sanitizedBase.length - 1 ? sanitizedBase.slice(extIndex + 1) : "";
  return { baseName, extension };
}

function ensureSafeBaseName(
  baseName: string,
  extension: string,
  platform: PlatformHandler,
  config: ReturnType<typeof validateOptions>["config"]
): string {
  const checkName = platform.isCaseSensitive ? baseName : baseName.toUpperCase();
  const fullCheckName = extension ? `${checkName}.${extension.toUpperCase()}` : checkName;
  if (
    RESERVED_NAMES.has(checkName) ||
    (extension && RESERVED_NAMES.has(fullCheckName)) ||
    hasExcessiveUnderscores(baseName)
  ) {
    return generateSafeFilename(extension, config.fileTypeWords, config.rng, config.accessibleNames);
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
    ? `${sanitizedPath}${truncateFilename(
        cleanBaseName,
        extension,
        maxLength - sanitizedPath.length,
        config.onTruncate,
        config.accessibleNames
      )}`
    : `${sanitizedPath}${cleanBaseName}${extPart}`;
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

// === Main Exports ===
export function parsePathComprehensive(
  path: string = "/",
  filename: string = "file",
  options: ParsePathOptions = {}
): PathParseResult {
  if (typeof path !== "string" || typeof filename !== "string") {
    throw new TypeError("Both 'path' and 'filename' must be strings");
  }

  const fullInput = `${path}${filename}`;
  const { platform, maxLength, unicodeMapper, config } = validateOptions(options, fullInput.length);
  const defaultExtension = options.defaultExtension ?? DEFAULTS.DEFAULT_EXTENSION;
  if (fullInput.length > maxLength) throw new PathError("Combined path and filename exceed maxLength");

  const loadFactor = Math.max(1, Math.ceil(fullInput.length / DEFAULTS.BUFFER_SIZE));
  const bufferPool = ResourceFactory.createBufferPool(loadFactor);
  const rngPool = ResourceFactory.createRNGPool(loadFactor);
  const buffer = bufferPool.get(Math.max(path.length, filename.length) * 2);
  const rng = rngPool.get(options.seed);

  try {
    const sanitizedPath = sanitizePath(path, buffer, rng, platform, bufferPool, options.trailingSlash ?? true);
    const sanitizedBase = sanitizeFilename(
      filename,
      buffer,
      unicodeMapper,
      config.onUnicodeOverflow,
      platform,
      bufferPool,
      defaultExtension,
      options.allowHiddenFiles ?? platform.isCaseSensitive
    );
    const { baseName, extension } = extractFileComponents(sanitizedBase);
    if (!isValidExtension(extension)) {
      throw new PathError(`Invalid extension "${extension}" in filename "${filename}"`);
    }

    const safeBaseName = ensureSafeBaseName(baseName, extension, platform, config);
    const fileName = constructFinalFileName(sanitizedPath, safeBaseName, extension, maxLength, config);
    if (containsNullByte(fileName)) throw new SecurityError("Generated filename contains null byte");

    return buildResult(path, filename, sanitizedPath, fileName, safeBaseName, extension);
  } finally {
    bufferPool.release(buffer);
    rngPool.release(rng);
  }
}

export function sanitizePathArray(inputs: [string, string][], options: ParsePathOptions = {}): PathParseResult[] {
  if (
    !Array.isArray(inputs) ||
    !inputs.every(
      (item): item is [string, string] =>
        Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && typeof item[1] === "string"
    )
  ) {
    throw new TypeError("Input must be an array of [string, string] tuples");
  }

  const maxInputLength = Math.max(...inputs.flatMap(([p, f]) => [`${p}${f}`.length]));
  const { platform, maxLength, unicodeMapper, config } = validateOptions(options, maxInputLength);
  const defaultExtension = options.defaultExtension ?? DEFAULTS.DEFAULT_EXTENSION;
  const loadFactor = Math.max(1, Math.ceil(maxInputLength / DEFAULTS.BUFFER_SIZE));
  const bufferPool = ResourceFactory.createBufferPool(loadFactor);
  const rngPool = ResourceFactory.createRNGPool(loadFactor);
  const buffer = bufferPool.get(Math.max(...inputs.flatMap(([p, f]) => [p.length, f.length])) * 2);
  const rng = rngPool.get(options.seed);
  const results = new Array<PathParseResult>(inputs.length);

  try {
    for (let i = 0; i < inputs.length; i++) {
      const [path, filename] = inputs[i];
      const fullInput = `${path}${filename}`;
      if (fullInput.length > maxLength) throw new PathError(`Input "${fullInput}" exceeds maxLength`);

      const sanitizedPath = sanitizePath(path, buffer, rng, platform, bufferPool, options.trailingSlash ?? true);
      const sanitizedBase = sanitizeFilename(
        filename,
        buffer,
        unicodeMapper,
        config.onUnicodeOverflow,
        platform,
        bufferPool,
        defaultExtension,
        options.allowHiddenFiles ?? platform.isCaseSensitive
      );
      const { baseName, extension } = extractFileComponents(sanitizedBase);
      if (!isValidExtension(extension)) {
        throw new PathError(`Invalid extension "${extension}" in filename "${filename}"`);
      }

      const safeBaseName = ensureSafeBaseName(baseName, extension, platform, config);
      const fileName = constructFinalFileName(sanitizedPath, safeBaseName, extension, maxLength, config);
      if (containsNullByte(fileName)) throw new SecurityError(`Generated filename "${fileName}" contains null byte`);

      results[i] = buildResult(path, filename, sanitizedPath, fileName, safeBaseName, extension);
    }
    return results;
  } finally {
    bufferPool.release(buffer);
    rngPool.release(rng);
  }
}

export function sanitizePaths(...args: [string, ...string[]] | [ParsePathOptions, ...string[]]): string[] {
  const hasOptions = typeof args[0] === "object" && args[0] !== null && !Array.isArray(args[0]);
  const options: ParsePathOptions = hasOptions ? (args[0] as ParsePathOptions) : {};
  const paths = hasOptions ? (args.slice(1) as string[]) : (args as string[]);

  if (!paths.every((path) => typeof path === "string")) throw new TypeError("All paths must be strings");

  const maxInputLength = Math.max(...paths.map((p) => p.length));
  const { platform, maxLength } = validateOptions(options, maxInputLength);
  const loadFactor = Math.max(1, Math.ceil(maxInputLength / DEFAULTS.BUFFER_SIZE));
  const bufferPool = ResourceFactory.createBufferPool(loadFactor);
  const rngPool = ResourceFactory.createRNGPool(loadFactor);
  const buffer = bufferPool.get(maxInputLength * 2);
  const rng = rngPool.get(options.seed);
  const results = new Array<string>(paths.length);

  try {
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (containsNullByte(path)) throw new SecurityError(`Path "${path}" contains null byte`);
      if (path.length > maxLength) throw new PathError(`Path "${path}" exceeds max length ${maxLength}`);

      results[i] = sanitizePath(path, buffer, rng, platform, bufferPool, options.trailingSlash ?? true);
    }
    return results;
  } finally {
    bufferPool.release(buffer);
    rngPool.release(rng);
  }
}

function validateOptions(
  options: ParsePathOptions,
  inputLength: number = 0
): {
  platform: PlatformHandler;
  maxLength: number;
  unicodeMapper: UnicodeMapper;
  config: {
    onTruncate: TruncateMode;
    onUnicodeOverflow: UnicodeOverflowMode;
    fileTypeWords: Readonly<Record<string, readonly string[]>>;
    rng: SecureRNG;
    accessibleNames: boolean;
  };
} {
  const platform =
    options.platformHandler ??
    (detectPlatform() === "win32"
      ? new Win32PlatformHandler(options.cacheSize, inputLength)
      : new PosixPlatformHandler(options.cacheSize, inputLength));
  const maxLength = options.maxLength ?? platform.maxLength;
  if (maxLength < 1 || maxLength > platform.maxLength) throw new PathError("Invalid maxLength");

  const unicodeMapper = options.unicodeMapper ?? new CompactUnicodeMapper();
  if (options.unicodeMapper && (typeof unicodeMapper.map !== "function" || typeof unicodeMapper.compose !== "function")) {
    throw new PathError("unicodeMapper must implement map() and compose()");
  }

  const defaultExtension = options.defaultExtension ?? DEFAULTS.DEFAULT_EXTENSION;
  if (!isValidExtension(defaultExtension)) {
    throw new PathError(`Invalid default extension "${defaultExtension}"`);
  }

  return {
    platform,
    maxLength,
    unicodeMapper,
    config: {
      onTruncate: options.onTruncate ?? "default",
      onUnicodeOverflow: options.onUnicodeOverflow ?? "ignore",
      fileTypeWords: options.fileTypeWords ?? DEFAULT_FILE_TYPE_WORDS,
      rng: new SecureRNG(options.seed),
      accessibleNames: options.accessibleNames ?? false,
    },
  };
}

// === Test Suite ===
function runTests() {
  console.log("Running tests...");

  const assertEqual = (actual: any, expected: any, message: string) => {
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(
      `${passed ? "✅" : "❌"} ${message}: ${
        passed ? "Passed" : `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      }`
    );
    return passed;
  };

  const assertThrows = (fn: () => any, errorType: any, message: string) => {
    try {
      fn();
      console.log(`❌ ${message}: Expected ${errorType.name} but no error thrown`);
      return false;
    } catch (e) {
      const passed = e instanceof errorType;
      console.log(`${passed ? "✅" : "❌"} ${message}: ${passed ? "Passed" : `Expected ${errorType.name}, got ${e}`}`);
      return passed;
    }
  };

  let allPassed = true;

  // Test 1: Basic path and filename sanitization (POSIX)
  const result1 = parsePathComprehensive("/test/path/", "file.txt");
  allPassed = assertEqual(result1.file_name, "/test/path/file.txt", "Test 1: Basic POSIX path and filename") && allPassed;

  // Test 2: Empty path and filename
  const result2 = parsePathComprehensive("", "");
  allPassed =
    assertEqual(result2.file_path.startsWith("/space"), true, "Test 2: Empty path uses SPACE_PATHS") &&
    assertEqual(result2.file_name.includes("file.txt"), true, "Test 2: Empty filename gets default extension") &&
    allPassed;

  // Test 3: Path traversal
  const result3 = parsePathComprehensive("/../evil/", "hack.exe");
  allPassed =
    assertEqual(result3.file_path.startsWith("/yokai/oni"), true, "Test 3: Path traversal replaced with Yokai path") &&
    allPassed;

  // Test 4: Null byte rejection
  allPassed =
    assertThrows(
      () => parsePathComprehensive("/path\0/", "file.txt"),
      SecurityError,
      "Test 4: Null byte in path throws SecurityError"
    ) && allPassed;

  // Test 5: Reserved name handling (Win32)
  const result5 = parsePathComprehensive("\\test\\", "CON.txt", { platformHandler: new Win32PlatformHandler() });
  allPassed =
    assertEqual(
      result5.filename_without_extension.match(/^file\d+$/) !== null,
      true,
      "Test 5: Reserved name CON replaced with safe name"
    ) && allPassed;

  // Test 6: Hidden file allowed on POSIX
  const result6 = parsePathComprehensive("/hidden/", ".secret", { allowHiddenFiles: true });
  allPassed = assertEqual(result6.file_name, "/hidden/.secret", "Test 6: Hidden file allowed with option") && allPassed;

  // Test 7: Max length exceeded
  allPassed =
    assertThrows(
      () => parsePathComprehensive("/a".repeat(5000), "file.txt", { maxLength: 4096 }),
      PathError,
      "Test 7: Path exceeding maxLength throws PathError"
    ) && allPassed;

  // Test 8: sanitizePathArray
  const result8 = sanitizePathArray([
    ["/test/", "file1.txt"],
    ["/path/", "file2.txt"],
  ]);
  allPassed =
    assertEqual(result8.length, 2, "Test 8: sanitizePathArray processes multiple inputs") &&
    assertEqual(result8[0].file_name, "/test/file1.txt", "Test 8: First array item sanitized correctly") &&
    allPassed;

  // Test 9: sanitizePaths with no trailing slash
  const result9 = sanitizePaths({ trailingSlash: false }, "/path1/", "/path2/");
  allPassed = assertEqual(result9, ["/path1", "/path2"], "Test 9: sanitizePaths respects no trailing slash") && allPassed;

  // Test 10: RTL override sanitization
  const result10 = parsePathComprehensive("/path\u202E/", "file.txt");
  allPassed = assertEqual(result10.file_path, "/path_/", "Test 10: RTL override replaced with underscore") && allPassed;

  // Test 11: Unicode overflow with error mode
  allPassed =
    assertThrows(
      () => parsePathComprehensive("/path/", "\u{1F600}.txt", { onUnicodeOverflow: "error" }),
      SecurityError,
      "Test 11: Unicode overflow throws SecurityError"
    ) && allPassed;

  console.log(`\n${allPassed ? "✅ All tests passed!" : "❌ Some tests failed."}`);
}

// Run the tests
runTests();
