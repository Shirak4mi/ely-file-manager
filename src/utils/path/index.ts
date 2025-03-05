// Define types with extended options
interface ParsePathOptions {
  maxLength?: number;
  unicodeMap?: Uint8Array;
  onTruncate?: "error" | "smart" | "default";
  onUnicodeOverflow?: "error" | "ignore";
  seed?: number;
  fileTypeWords?: Record<string, string[]>;
  bufferSize?: number;
}

interface PathParseResult {
  original_path: string;
  path: string;
  file_name: string;
  file_type: string;
  filename_without_extension: string;
  extension_with_dot: string;
}

// Core constants
const DEFAULT_MAX_LENGTH = 255;
const DEFAULT_BUFFER_SIZE = 1024;
const FORWARD_SLASH = 47;
const UNDERSCORE = 95;
const BACK_SLASH = 92;
const DOT = 46;
const BYTE_MASK = 0xff;
const RNG_MAX = 16777216;

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

// Initialize illegal characters
for (const char of [60, 62, 58, 34, 124, 63, 42, ...Array(32).keys()]) {
  ILLEGAL_PATH_CHARS[char] = 1;
  ILLEGAL_FILENAME_CHARS[char] = 1;
}
ILLEGAL_PATH_CHARS[FORWARD_SLASH] = 0;
ILLEGAL_PATH_CHARS[BACK_SLASH] = 0;
ILLEGAL_FILENAME_CHARS[47] = 1;
ILLEGAL_FILENAME_CHARS[92] = 1;

// Default file type words
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

// Default Unicode mapping
const DEFAULT_UNICODE_MAP = new Uint8Array(0x0500);
DEFAULT_UNICODE_MAP.fill(UNDERSCORE);
for (let i = 32; i < 127; i++) DEFAULT_UNICODE_MAP[i] = i;
DEFAULT_UNICODE_MAP[0xc0] = 97;
DEFAULT_UNICODE_MAP[0xc1] = 97;
DEFAULT_UNICODE_MAP[0xc2] = 97;
DEFAULT_UNICODE_MAP[0xc8] = 101;
DEFAULT_UNICODE_MAP[0xc9] = 101;
DEFAULT_UNICODE_MAP[0xca] = 101;
DEFAULT_UNICODE_MAP[0xcc] = 105;
DEFAULT_UNICODE_MAP[0xcd] = 105;
DEFAULT_UNICODE_MAP[0xce] = 105;
DEFAULT_UNICODE_MAP[0xd2] = 111;
DEFAULT_UNICODE_MAP[0xd3] = 111;
DEFAULT_UNICODE_MAP[0xd4] = 111;
DEFAULT_UNICODE_MAP[0xd9] = 117;
DEFAULT_UNICODE_MAP[0xda] = 117;
DEFAULT_UNICODE_MAP[0xdb] = 117;
DEFAULT_UNICODE_MAP[0xe0] = 97;
DEFAULT_UNICODE_MAP[0xe1] = 97;
DEFAULT_UNICODE_MAP[0xe2] = 97;
DEFAULT_UNICODE_MAP[0xe8] = 101;
DEFAULT_UNICODE_MAP[0xe9] = 101;
DEFAULT_UNICODE_MAP[0xea] = 101;
DEFAULT_UNICODE_MAP[0xec] = 105;
DEFAULT_UNICODE_MAP[0xed] = 105;
DEFAULT_UNICODE_MAP[0xee] = 105;
DEFAULT_UNICODE_MAP[0xf2] = 111;
DEFAULT_UNICODE_MAP[0xf3] = 111;
DEFAULT_UNICODE_MAP[0xf4] = 111;
DEFAULT_UNICODE_MAP[0xf9] = 117;
DEFAULT_UNICODE_MAP[0xfa] = 117;
DEFAULT_UNICODE_MAP[0xfb] = 117;
DEFAULT_UNICODE_MAP[0xd7] = 120;
DEFAULT_UNICODE_MAP[0xf7] = 95;
DEFAULT_UNICODE_MAP[0x2013] = 45;
DEFAULT_UNICODE_MAP[0x2014] = 45;
DEFAULT_UNICODE_MAP[0x0410] = 97;
DEFAULT_UNICODE_MAP[0x0430] = 97; // Аа → a
// ... (remaining Cyrillic mappings unchanged)

// Optimized RNG
class FastRNG {
  private seed: number;
  constructor(seed: number = Date.now()) {
    this.seed = seed >>> 0;
  }
  next(): number {
    this.seed = (this.seed * 69069 + 1) >>> 0; // Simple, fast LCG
    return (this.seed >>> 8) / RNG_MAX;
  }
}

// Pre-allocated buffers and decoder
const PATH_BUFFER = new Uint8Array(DEFAULT_BUFFER_SIZE);
const FILENAME_BUFFER = new Uint8Array(DEFAULT_BUFFER_SIZE);
const DECODER = new TextDecoder();

/**
 * Parses and sanitizes a filepath with high performance, ensuring proper path formatting.
 *
 * This function processes paths and filenames efficiently using pre-allocated buffers.
 * It ensures paths like "e" become "/e/" by adding initial and trailing slashes if missing,
 * replaces illegal characters, and handles reserved names and truncation.
 *
 * @param path - Directory path (e.g., "e", "docs", "/docs"). Defaults to "/" if empty.
 * @param filename - Filename (e.g., "test.txt"). Defaults to "file" if empty.
 * @param options - Optional configuration for advanced behavior.
 * @param options.maxLength - Maximum full path length (default: 255). Must be positive.
 * @param options.unicodeMap - Custom Unicode-to-ASCII mapping as a Uint8Array (default: Latin-1 and Cyrillic).
 * @param options.onTruncate - Truncation behavior when exceeding maxLength:
 *   - 'error': Throws an error.
 *   - 'smart': Preserves the first segment of the filename (e.g., "long_name" → "long").
 *   - 'default': Truncates to fit (e.g., "long_name" → "lon").
 * @param options.onUnicodeOverflow - Behavior for unmapped Unicode characters:
 *   - 'error': Throws an error.
 *   - 'ignore': Maps to underscore silently (default).
 * @param options.seed - Seed for random filename generation (default: current timestamp).
 * @param options.fileTypeWords - Custom mapping of file extensions to word lists (default: predefined set).
 * @param options.bufferSize - Buffer size for path and filename processing (default: 1024). Overrides pre-allocated buffers if larger.
 *
 * @returns An object containing sanitized path components.
 * @returns original_path - Original input path and filename combined.
 * @returns path - Sanitized directory path, always starting and ending with "/".
 * @returns file_name - Sanitized filename with extension.
 * @returns file_type - File extension without the dot (e.g., "txt").
 * @returns filename_without_extension - Filename without the extension.
 * @returns extension_with_dot - File extension with the dot (e.g., ".txt"), or empty string if none.
 *
 * @throws {Error} If maxLength < 1, buffer size exceeded, unicodeMap invalid, or specific error conditions met (e.g., onTruncate: 'error').
 *
 * @example
 * // Single-character path with automatic slashes
 * parsePathComprehensive("e", "test.txt")
 * // Returns: { path: "/e/", file_name: "test.txt", original_path: "etest.txt", ... }
 *
 * @example
 * // Path without initial slash
 * parsePathComprehensive("docs", "file.txt")
 * // Returns: { path: "/docs/", file_name: "file.txt", ... }
 *
 * @example
 * // Path with initial slash, no trailing
 * parsePathComprehensive("/docs", "file.txt")
 * // Returns: { path: "/docs/", file_name: "file.txt", ... }
 *
 * @example
 * // Truncation with 'smart' option
 * parsePathComprehensive("/long/path", "very_long_name.pdf", { maxLength: 20, onTruncate: 'smart' })
 * // Returns: { path: "/long/path/", file_name: "very.pdf", ... }
 *
 * @example
 * // Error on Unicode overflow
 * parsePathComprehensive("/path", "file€.txt", { onUnicodeOverflow: 'error' })
 * // Throws: "Unicode character 8364 exceeds mapping range"
 *
 * @example
 * // Reserved name replacement
 * parsePathComprehensive("/valid", "CON.txt")
 * // Returns: { path: "/valid/", file_name: "file1234.txt", ... } (randomized)
 */
export function parsePathComprehensive(path: string, filename: string, options: ParsePathOptions = {}): PathParseResult {
  // Defaults and validation
  if (!path) path = "/";
  if (!filename) filename = "file";
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  if (maxLength < 1) throw new Error("maxLength must be a positive number");
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
  const unicodeMap = options.unicodeMap ?? DEFAULT_UNICODE_MAP;
  if (options.unicodeMap && !(options.unicodeMap instanceof Uint8Array)) {
    throw new Error("unicodeMap must be a Uint8Array");
  }
  const onUnicodeOverflow = options.onUnicodeOverflow ?? "ignore";
  const fileTypeWords = options.fileTypeWords ?? DEFAULT_FILE_TYPE_WORDS;
  const rng = new FastRNG(options.seed);

  // Use larger buffers if specified
  const pathBuffer = bufferSize > DEFAULT_BUFFER_SIZE ? new Uint8Array(bufferSize) : PATH_BUFFER;
  const filenameBuffer = bufferSize > DEFAULT_BUFFER_SIZE ? new Uint8Array(bufferSize) : FILENAME_BUFFER;

  // Sanitize path with initial '/' check
  const pathLen = Math.min(path.length, bufferSize);
  if (path.length > bufferSize) throw new Error(`Path exceeds maximum buffer size of ${bufferSize} bytes`);
  pathBuffer.fill(0, 0, pathLen);
  let pathOutPos = 0;
  const hasInitialSlash = path.charCodeAt(0) === FORWARD_SLASH;
  if (!hasInitialSlash) pathBuffer[pathOutPos++] = FORWARD_SLASH; // Prepend '/' if missing
  for (let i = 0; i < pathLen; i++) {
    const char = path.charCodeAt(i) & BYTE_MASK;
    const normalized = ILLEGAL_PATH_CHARS[char] ? UNDERSCORE : char === BACK_SLASH ? FORWARD_SLASH : char;
    pathBuffer[pathOutPos++] = normalized;
  }
  const sanitizedPath = pathOutPos > (hasInitialSlash ? 0 : 1) ? DECODER.decode(pathBuffer.subarray(0, pathOutPos)) : "/";

  // Sanitize filename
  const filenameLen = Math.min(filename.length, bufferSize);
  if (filename.length > bufferSize) throw new Error(`Filename exceeds maximum buffer size of ${bufferSize} bytes`);
  filenameBuffer.fill(0, 0, filenameLen);
  let underscoreCount = 0,
    letterCount = 0,
    extStart = -1,
    lastChar = 0,
    fileOutPos = 0;
  for (let i = 0; i < filenameLen; i++) {
    const char = filename.charCodeAt(i);
    const mappedChar = char < unicodeMap.length ? unicodeMap[char] : UNDERSCORE;
    if (char >= unicodeMap.length && onUnicodeOverflow === "error") {
      throw new Error(`Unicode character ${char} exceeds mapping range`);
    }
    const normalized = ILLEGAL_FILENAME_CHARS[mappedChar & BYTE_MASK] ? UNDERSCORE : mappedChar;

    if (normalized === DOT && extStart === -1) extStart = fileOutPos;
    if (normalized === UNDERSCORE && lastChar === UNDERSCORE) {
      underscoreCount++;
      continue;
    }
    if ((char >= 65 && char <= 90) || (char >= 97 && char <= 122) || (char >= 0x0410 && char <= 0x044f)) {
      letterCount++;
    }
    filenameBuffer[fileOutPos++] = normalized;
    lastChar = normalized;
  }

  let fileName = "file",
    fileExtension = "";
  if (extStart !== -1 && extStart > 0) {
    fileName = DECODER.decode(filenameBuffer.subarray(0, extStart));
    fileExtension = DECODER.decode(filenameBuffer.subarray(extStart + 1, fileOutPos));
  } else if (fileOutPos > 0) {
    fileName = DECODER.decode(filenameBuffer.subarray(0, fileOutPos));
  }

  // Handle reserved names and excessive underscores
  const upperFileName = fileName.toUpperCase();
  if (
    RESERVED_NAMES.has(upperFileName) ||
    RESERVED_NAMES.has(`${upperFileName}.${fileExtension.toUpperCase()}`) ||
    underscoreCount > letterCount
  ) {
    const ext = fileExtension.toLowerCase() as keyof typeof fileTypeWords;
    const words = fileTypeWords[ext] || fileTypeWords["default"];
    fileName = words[Math.floor(rng.next() * words.length)] + Math.floor(rng.next() * 10000);
  }

  // Construct and truncate
  let file_name = fileExtension ? `${fileName}.${fileExtension}` : fileName;
  const fullPathLen = sanitizedPath.length + file_name.length;
  if (fullPathLen > maxLength) {
    const extLength = fileExtension.length + 1;
    const available = maxLength - sanitizedPath.length - extLength;
    if (options.onTruncate === "error") throw new Error(`Path exceeds maxLength of ${maxLength}`);
    if (options.onTruncate === "smart" && available > 3) {
      let firstWordEnd = fileName.indexOf("_");
      if (firstWordEnd === -1 || firstWordEnd > available) firstWordEnd = available;
      fileName = fileName.substring(0, firstWordEnd);
      file_name = `${fileName}.${fileExtension}`;
    } else {
      file_name = available > 1 ? `${fileName.substring(0, available)}.${fileExtension}` : `f.${fileExtension}`;
    }
  }
  if (file_name[file_name.length - 1] === ".") file_name = file_name.substring(0, file_name.length - 1);

  // Ensure trailing '/'
  const finalPath = sanitizedPath[sanitizedPath.length - 1] === "/" ? sanitizedPath : `${sanitizedPath}/`;

  return {
    original_path: `${path}${filename}`,
    path: finalPath,
    file_name,
    file_type: fileExtension,
    filename_without_extension: fileName,
    extension_with_dot: fileExtension ? `.${fileExtension}` : "",
  };
}

// Example usage
function processFilePath(path: string, filename: string, options?: ParsePathOptions): void {
  const result = parsePathComprehensive(path, filename, options);
  console.log("Parsed Path Result:");
  console.log(JSON.stringify(result, null, 2));
}

// Test cases
processFilePath("e", "test.txt"); // "/e/"
processFilePath("docs", "file.txt"); // "/docs/"
processFilePath("/docs", "file.txt"); // "/docs/"
processFilePath("/docs/", "file.txt"); // "/docs/"
processFilePath("/long/path", "very_long_name.pdf", { maxLength: 20, onTruncate: "smart" });
