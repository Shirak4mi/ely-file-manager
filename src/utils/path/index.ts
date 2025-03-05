// Define types with extended options
interface ParsePathOptions {
  maxLength?: number; // Maximum total length of the resulting path
  unicodeMap?: Uint8Array; // Custom mapping for Unicode characters
  onTruncate?: "error" | "smart" | "default"; // Truncation behavior
  onUnicodeOverflow?: "error" | "ignore"; // Behavior for unmapped Unicode chars
  seed?: number; // Seed for RNG, defaults to current timestamp
  fileTypeWords?: Record<string, string[]>; // Custom words for file types
  bufferSize?: number; // Size of processing buffers
}

interface PathParseResult {
  original_path: string; // Original input path and filename
  path: string; // Sanitized directory path with trailing slash
  file_name: string; // Sanitized full filename (with extension)
  file_type: string; // File extension without dot (e.g., "txt")
  filename_without_extension: string; // Filename without extension
  extension_with_dot: string; // Extension with dot (e.g., ".txt") or empty
}

// Core constants
const DEFAULT_MAX_LENGTH = 255;
const DEFAULT_BUFFER_SIZE = 1024;
const CHAR_CODES = {
  FORWARD_SLASH: 47,
  UNDERSCORE: 95,
  BACK_SLASH: 92,
  DOT: 46,
} as const;
const BYTE_MASK = 0xff;
const RNG_CONSTANTS = {
  MAX: 16777216,
  MULTIPLIER: 69069, // LCG multiplier for uniform distribution
  INCREMENT: 1,
} as const;

// Precomputed lookup tables
const ILLEGAL_PATH_CHARS = new Uint8Array(256);
const ILLEGAL_FILENAME_CHARS = new Uint8Array(256);
const RESERVED_NAMES = new Set([
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

// Camelot-themed paths for space-only inputs
const SPACE_PATHS = [
  "/camelot/",
  "/arthur/",
  "/merlin/",
  "/guinevere/",
  "/lancelot/",
  "/mordred/",
  "/morgan/",
  "/excalibur/",
  "/roundtable/",
  "/avalon/",
  "/gawain/",
  "/percival/",
  "/galahad/",
  "/tristan/",
  "/isolde/",
  "/bedivere/",
  "/kay/",
  "/bors/",
  "/lamorak/",
  "/dinadan/",
  "/uther/",
  "/igraine/",
  "/leodegrance/",
  "/lot/",
  "/pendragon/",
  "/saxons/",
  "/holygrail/",
  "/ladyofthelake/",
  "/questingbeast/",
  "/camelotcastle/",
  "/knights/",
];

// Initialize illegal characters lookup tables
function initializeIllegalChars(): void {
  const illegalChars = [60, 62, 58, 34, 124, 63, 42, ...Array(32).keys()];
  for (const char of illegalChars) {
    ILLEGAL_PATH_CHARS[char] = 1;
    ILLEGAL_FILENAME_CHARS[char] = 1;
  }
  ILLEGAL_PATH_CHARS[CHAR_CODES.FORWARD_SLASH] = 0; // Allow in paths
  ILLEGAL_PATH_CHARS[CHAR_CODES.BACK_SLASH] = 0; // Allow in paths
  ILLEGAL_FILENAME_CHARS[CHAR_CODES.FORWARD_SLASH] = 1; // Disallow in filenames
  ILLEGAL_FILENAME_CHARS[CHAR_CODES.BACK_SLASH] = 1; // Disallow in filenames
}
initializeIllegalChars();

// Default file type words for generating filenames
const DEFAULT_FILE_TYPE_WORDS = Object.freeze({
  txt: ["note", "text", "memo", "draft", "log", "journal", "script", "summary", "outline", "transcript"],
  doc: ["document", "report", "paper", "letter", "article", "proposal", "contract", "essay", "review", "minutes"],
  docx: ["document", "report", "paper", "letter", "article", "proposal", "contract", "essay", "review", "minutes"],
  pdf: ["ebook", "manual", "guide", "booklet", "form", "catalog", "handbook", "brochure", "pamphlet", "thesis"],
  jpg: ["photo", "image", "picture", "snapshot", "shot", "capture", "portrait", "landscape", "frame", "still"],
  jpeg: ["photo", "image", "picture", "snapshot", "shot", "capture", "portrait", "landscape", "frame", "still"],
  png: ["image", "graphic", "icon", "drawing", "sketch", "diagram", "illustration", "chart", "symbol", "design"],
  gif: ["animation", "clip", "frame", "motion", "loop", "sequence", "sprite", "graphic", "meme", "effect"],
  mp4: ["video", "clip", "movie", "recording", "footage", "scene", "segment", "reel", "stream", "capture"],
  mp3: ["audio", "track", "song", "recording", "sound", "music", "clip", "beat", "tune", "sample"],
  xls: ["spreadsheet", "table", "data", "chart", "ledger", "sheet", "stats", "figures", "records", "analysis"],
  xlsx: ["spreadsheet", "table", "data", "chart", "ledger", "sheet", "stats", "figures", "records", "analysis"],
  default: ["file", "data", "record", "item", "project", "entry", "object", "asset", "unit", "resource"],
});

// Unicode mapping (1280 chars for Latin-1 and Cyrillic)
const UNICODE_MAP_SIZE = 0x0500; // Covers Basic Latin, Latin-1 Supplement, Cyrillic
const DEFAULT_UNICODE_MAP = createDefaultUnicodeMap();
function createDefaultUnicodeMap(): Uint8Array {
  const map = new Uint8Array(UNICODE_MAP_SIZE);
  map.fill(CHAR_CODES.UNDERSCORE); // Default to underscore for unmapped chars
  for (let i = 32; i < 127; i++) map[i] = i; // ASCII printable chars
  const mappings: Record<number, number> = {
    0xc0: 97,
    0xc1: 97,
    0xc2: 97, // ÀÁÂ → a
    0xe0: 97,
    0xe1: 97,
    0xe2: 97, // àáâ → a
    0xc8: 101,
    0xc9: 101,
    0xca: 101, // ÈÉÊ → e
    0xe8: 101,
    0xe9: 101,
    0xea: 101, // èéê → e
    0xcc: 105,
    0xcd: 105,
    0xce: 105, // ÌÍÎ → i
    0xec: 105,
    0xed: 105,
    0xee: 105, // ìíî → i
    0xd2: 111,
    0xd3: 111,
    0xd4: 111, // ÒÓÔ → o
    0xf2: 111,
    0xf3: 111,
    0xf4: 111, // òóô → o
    0xd9: 117,
    0xda: 117,
    0xdb: 117, // ÙÚÛ → u
    0xf9: 117,
    0xfa: 117,
    0xfb: 117, // ùúû → u
    0xd7: 120, // × → x
    0xf7: 95, // ÷ → _
    0x2013: 45,
    0x2014: 45, // en/em dash → -
    0x0410: 97,
    0x0430: 97, // Аа → a
  };
  for (const [key, value] of Object.entries(mappings)) map[Number(key)] = value;
  return map;
}

// Optimized RNG using Linear Congruential Generator
class FastRNG {
  private seed: number;
  constructor(seed: number = Date.now()) {
    this.seed = seed >>> 0; // Ensure unsigned 32-bit integer
  }
  next(): number {
    this.seed = (this.seed * RNG_CONSTANTS.MULTIPLIER + RNG_CONSTANTS.INCREMENT) >>> 0;
    return (this.seed >>> 8) / RNG_CONSTANTS.MAX; // Normalize to [0, 1)
  }
}

// Pre-allocated buffers and decoder
const PATH_BUFFER = new Uint8Array(DEFAULT_BUFFER_SIZE);
const FILENAME_BUFFER = new Uint8Array(DEFAULT_BUFFER_SIZE);
const DECODER = new TextDecoder();

// Helper functions
function isSpaceOnly(str: string): boolean {
  return str.trim() === "";
}

function sanitizePath(input: string, buffer: Uint8Array, bufferSize: number, rng: FastRNG): string {
  if (isSpaceOnly(input)) return SPACE_PATHS[Math.floor(rng.next() * SPACE_PATHS.length)];
  if (input.length > bufferSize) throw new Error(`Path exceeds buffer size of ${bufferSize} bytes`);

  let writePos = 0;
  const hasInitialSlash = input.charCodeAt(0) === CHAR_CODES.FORWARD_SLASH;
  if (!hasInitialSlash) buffer[writePos++] = CHAR_CODES.FORWARD_SLASH;

  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i) & BYTE_MASK;
    buffer[writePos++] = ILLEGAL_PATH_CHARS[char]
      ? CHAR_CODES.UNDERSCORE
      : char === CHAR_CODES.BACK_SLASH
      ? CHAR_CODES.FORWARD_SLASH
      : char;
  }
  const result = writePos > (hasInitialSlash ? 0 : 1) ? DECODER.decode(buffer.subarray(0, writePos)) : "/";
  return result.endsWith("/") ? result : `${result}/`;
}

function mapUnicodeChar(char: number, unicodeMap: Uint8Array, onOverflow: "error" | "ignore"): number {
  if (char < unicodeMap.length) return unicodeMap[char];
  if (onOverflow === "error") throw new Error(`Unicode char ${char} exceeds map range`);
  return CHAR_CODES.UNDERSCORE;
}

function sanitizeFilenameCore(
  input: string,
  buffer: Uint8Array,
  bufferSize: number,
  unicodeMap: Uint8Array,
  onOverflow: "error" | "ignore"
): string {
  if (input.length > bufferSize) throw new Error(`Filename exceeds buffer size of ${bufferSize} bytes`);
  let writePos = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    const mapped = mapUnicodeChar(char, unicodeMap, onOverflow);
    buffer[writePos++] = ILLEGAL_FILENAME_CHARS[mapped & BYTE_MASK] ? CHAR_CODES.UNDERSCORE : mapped;
  }
  return writePos > 0 ? DECODER.decode(buffer.subarray(0, writePos)) : "file";
}

function removeExcessiveUnderscores(input: string): string {
  let result = "";
  let lastChar = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    if (char !== CHAR_CODES.UNDERSCORE || lastChar !== CHAR_CODES.UNDERSCORE) {
      result += String.fromCharCode(char);
      lastChar = char;
    }
  }
  return result || "file";
}

function sanitizeFilename(
  input: string,
  buffer: Uint8Array,
  bufferSize: number,
  unicodeMap: Uint8Array,
  onOverflow: "error" | "ignore"
): string {
  const raw = sanitizeFilenameCore(input, buffer, bufferSize, unicodeMap, onOverflow);
  return removeExcessiveUnderscores(raw);
}

function generateSafeFilename(extension: string, fileTypeWords: Record<string, string[]>, rng: FastRNG): string {
  const ext = extension.toLowerCase() as keyof typeof fileTypeWords;
  const words = fileTypeWords[ext] || fileTypeWords["default"];
  const word = words[Math.floor(rng.next() * words.length)];
  const number = Math.floor(rng.next() * 10000);
  return `${word}${number}`;
}

function truncateFilename(
  filename: string,
  extension: string,
  maxLength: number,
  pathLength: number,
  onTruncate: "error" | "smart" | "default"
): string {
  const extPart = extension ? `.${extension}` : "";
  const fullLength = pathLength + filename.length + extPart.length;
  if (fullLength <= maxLength) return `${filename}${extPart}`;

  if (onTruncate === "error") throw new Error(`Path exceeds maxLength of ${maxLength}`);
  const available = maxLength - pathLength - extPart.length;
  if (available <= 1) return `f${extPart}`;

  if (onTruncate === "smart" && available > 3) {
    const firstWordEnd = filename.indexOf("_") === -1 ? available : Math.min(filename.indexOf("_"), available);
    return `${filename.substring(0, firstWordEnd)}${extPart}`;
  }
  return `${filename.substring(0, available)}${extPart}`;
}

/**
 * Parses and sanitizes a file path with high performance, flexibility, and robust error handling.
 * Ensures compatibility with common file system constraints (e.g., illegal characters, reserved names).
 * Supports Camelot-themed random paths for space-only inputs and smart truncation for long paths.
 *
 * @param path - Directory path (e.g., "/docs", "e", " "). Defaults to "/". Space-only inputs yield a random Camelot-themed path (e.g., "/arthur/").
 * @param filename - Filename (e.g., "test.txt"). Defaults to "file". Empty or invalid inputs are replaced with a safe name.
 * @param options - Configuration options:
 *   - `maxLength`: Maximum total path length (default: 255).
 *   - `unicodeMap`: Custom Unicode-to-ASCII mapping (default: Latin-1 and Cyrillic support).
 *   - `onTruncate`: Behavior for long paths: "error" (throw), "smart" (keep first word), "default" (simple cut) (default: "default").
 *   - `onUnicodeOverflow`: Behavior for unmapped Unicode chars: "error" (throw), "ignore" (use "_") (default: "ignore").
 *   - `seed`: RNG seed for reproducibility (default: current timestamp).
 *   - `fileTypeWords`: Custom word lists for generating filenames by extension (default: predefined lists).
 *   - `bufferSize`: Size of internal buffers (default: 1024).
 * @returns A `PathParseResult` object with sanitized path components:
 *   - `original_path`: Original input.
 *   - `path`: Sanitized directory path with trailing slash.
 *   - `file_name`: Sanitized full filename.
 *   - `file_type`: Extension without dot.
 *   - `filename_without_extension`: Filename without extension.
 *   - `extension_with_dot`: Extension with dot or empty string.
 * @throws {Error} If:
 *   - `maxLength` is less than 1.
 *   - `unicodeMap` is not a Uint8Array.
 *   - Input exceeds `bufferSize`.
 *   - `onTruncate` is "error" and path exceeds `maxLength`.
 *   - `onUnicodeOverflow` is "error" and a Unicode char exceeds the map range.
 * @example
 * parsePathComprehensive("e", "test.txt")
 * // => { path: "/e/", file_name: "test.txt", ... }
 * parsePathComprehensive(" ", "file.pdf")
 * // => { path: "/camelot/", file_name: "file.pdf", ... }
 * parsePathComprehensive("/long/path", "very_long_name.pdf", { maxLength: 20, onTruncate: "smart" })
 * // => { path: "/long/path/", file_name: "very.pdf", ... }
 */
export function parsePathComprehensive(
  path: string = "/",
  filename: string = "file",
  options: ParsePathOptions = {}
): PathParseResult {
  // Apply defaults and validate options
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  if (maxLength < 1) throw new Error("maxLength must be a positive number");
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
  const unicodeMap = options.unicodeMap ?? DEFAULT_UNICODE_MAP;
  if (options.unicodeMap && !(options.unicodeMap instanceof Uint8Array)) throw new Error("unicodeMap must be a Uint8Array");
  const onTruncate = options.onTruncate ?? "default";
  const onUnicodeOverflow = options.onUnicodeOverflow ?? "ignore";
  const fileTypeWords = options.fileTypeWords ?? DEFAULT_FILE_TYPE_WORDS;
  const rng = new FastRNG(options.seed);

  // Use larger buffers if specified
  const pathBuffer = bufferSize > DEFAULT_BUFFER_SIZE ? new Uint8Array(bufferSize) : PATH_BUFFER;
  const filenameBuffer = bufferSize > DEFAULT_BUFFER_SIZE ? new Uint8Array(bufferSize) : FILENAME_BUFFER;

  // Sanitize path and filename
  const sanitizedPath = sanitizePath(path, pathBuffer, bufferSize, rng);
  const sanitizedFilename = sanitizeFilename(filename, filenameBuffer, bufferSize, unicodeMap, onUnicodeOverflow);

  // Split filename into name and extension
  const extIndex = sanitizedFilename.lastIndexOf(".");
  let baseName = extIndex > 0 ? sanitizedFilename.substring(0, extIndex) : sanitizedFilename;
  const extension = extIndex > 0 && extIndex < sanitizedFilename.length - 1 ? sanitizedFilename.substring(extIndex + 1) : "";

  // Check for reserved names or excessive underscores
  const upperBaseName = baseName.toUpperCase();
  const hasExcessiveUnderscores =
    sanitizedFilename.split("_").length - 1 > (sanitizedFilename.match(/[a-zA-ZА-я]/g)?.length || 0);
  if (
    RESERVED_NAMES.has(upperBaseName) ||
    RESERVED_NAMES.has(`${upperBaseName}.${extension.toUpperCase()}`) ||
    hasExcessiveUnderscores
  ) {
    baseName = generateSafeFilename(extension, fileTypeWords, rng);
  }

  // Truncate if necessary
  const fileName = truncateFilename(baseName, extension, maxLength, sanitizedPath.length, onTruncate);

  return {
    original_path: `${path}${filename}`,
    path: sanitizedPath,
    file_name: fileName,
    file_type: extension,
    filename_without_extension: baseName,
    extension_with_dot: extension ? `.${extension}` : "",
  };
}

// Test cases
function processFilePath(path: string, filename: string, options?: ParsePathOptions): void {
  const result = parsePathComprehensive(path, filename, options);
  console.log("Parsed Path Result:");
  console.log(JSON.stringify(result, null, 2));
}

processFilePath("e", "test.txt");
processFilePath(" ", "file.txt"); // Random Camelot path
processFilePath("     ", "doc.pdf"); // Random Camelot path
processFilePath("/long/path", "very_long_name.pdf", { maxLength: 20, onTruncate: "smart" });
