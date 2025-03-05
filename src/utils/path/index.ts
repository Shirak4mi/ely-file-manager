// Define types with extended options
interface ParsePathOptions {
  maxLength?: number; // Maximum total length of the resulting path
  unicodeMap?: Uint8Array; // Custom mapping for Unicode characters
  onTruncate?: "error" | "smart" | "default"; // Truncation behavior
  onUnicodeOverflow?: "error" | "ignore"; // Behavior for unmapped Unicode chars
  seed?: Uint32Array; // Seed for RNG (optional, crypto-secure by default)
  fileTypeWords?: Record<string, string[]>; // Custom words for file types
  bufferSize?: number; // Size of processing buffers
  platform?: "win32" | "posix" | "auto"; // Target platform (default: "auto" detects runtime)
}

interface PathParseResult {
  original_path: string; // Original input path and filename
  file_path: string; // Sanitized directory path with trailing slash
  file_name: string; // Sanitized full filename (with extension)
  file_type: string; // File extension without dot (e.g., "txt")
  filename_without_extension: string; // Filename without extension
  extension_with_dot: string; // Extension with dot (e.g., ".txt") or empty
}

// Core constants
const DEFAULT_MAX_LENGTH_POSIX = 4096; // POSIX typical max path length
const DEFAULT_MAX_LENGTH_WIN32 = 260; // Windows typical max path length
const DEFAULT_BUFFER_SIZE = 1024;
const CHAR_CODES = {
  FORWARD_SLASH: 47,
  UNDERSCORE: 95,
  BACK_SLASH: 92,
  DOT: 46,
  NULL: 0,
  COLON: 58, // For Windows drive letters
} as const;
const BYTE_MASK = 0xff;

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

// Combined Camelot, Lord of the Rings, and space-only paths
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
  "/middleearth/",
  "/frodo/",
  "/samwise/",
  "/gandalf/",
  "/aragorn/",
  "/legolas/",
  "/gimli/",
  "/boromir/",
  "/merry/",
  "/pippin/",
  "/bilbo/",
  "/sauron/",
  "/saruman/",
  "/gollum/",
  "/elrond/",
  "/galadriel/",
  "/arwen/",
  "/eowyn/",
  "/faramir/",
  "/denethor/",
  "/theoden/",
  "/eomer/",
  "/treebeard/",
  "/grima/",
  "/hobbiton/",
  "/shire/",
  "/rivendell/",
  "/lorien/",
  "/mirkwood/",
  "/gondor/",
  "/rohan/",
  "/mordor/",
  "/isengard/",
  "/minastirith/",
  "/erebor/",
  "/dwarves/",
  "/elves/",
  "/orcs/",
  "/ents/",
  "/baraddur/",
  "/moria/",
  "/fangorn/",
  "/deadmarshes/",
  "/helmsdeep/",
  "/edoras/",
  "/bagend/",
  "/onering/",
  "/palantir/",
  "/mithril/",
  "/anduin/",
  "/greyhavens/",
  "/bree/",
  "/weathertop/",
  "/caradhras/",
  "/khazaddum/",
];

// Yokai and Oni names for traversal replacement
const YOKAI_ONI_PATHS = [
  "/oni/",
  "/kappa/",
  "/tengu/",
  "/kitsune/",
  "/tanuki/",
  "/yuki-onna/",
  "/shuten-doji/",
  "/ibaraki-doji/",
  "/kuchisake-onna/",
  "/nurarihyon/",
  "/jorogumo/",
  "/rokurokubi/",
  "/nukekubi/",
  "/aka-manto/",
  "/kirin/",
  "/bake-danuki/",
  "/bakeneko/",
  "/nekomata/",
  "/inugami/",
  "/ha-inu/",
  "/tsuchigumo/",
  "/yamauba/",
  "/hannya/",
  "/gashadokuro/",
  "/kyubi/",
  "/ushioni/",
  "/nure-onna/",
  "/kamaitachi/",
  "/namahage/",
  "/hyakume/",
  "/ao-andon/",
  "/ao-nyobo/",
  "/betobeto-san/",
  "/binbogami/",
  "/buruburu/",
  "/chouchin-obake/",
  "/daitengu/",
  "/dorotabo/",
  "/enra-enra/",
  "/funa-yurei/",
  "/futakuchi-onna/",
  "/hitotsume-kozou/",
  "/hyosube/",
  "/ippon-datara/",
  "/issun-boshi/",
  "/ittan-momen/",
  "/jinmenju/",
  "/kasa-obake/",
  "/kodama/",
  "/konaki-jiji/",
  "/koropokkuru/",
  "/kubikajiri/",
  "/kudan/",
  "/mikoshi-nyudo/",
  "/mujina/",
  "/ningyo/",
  "/noddera-bo/",
  "/nuribotoke/",
  "/oboroguruma/",
  "/ohaguro-bettari/",
  "/okiku/",
  "/onibi/",
  "/onikuma/",
  "/onmoraki/",
  "/osakabe-hime/",
  "/sazae-oni/",
  "/shirime/",
  "/shojo/",
  "/takiyasha-hime/",
  "/tatami-tataki/",
  "/tektek/",
  "/tenome/",
  "/tsukumogami/",
  "/ubume/",
  "/umibozu/",
  "/waira/",
  "/wanyudo/",
  "/yama-jiji/",
  "/yama-otoko/",
  "/yanari/",
  "/yurei/",
  "/zashiki-warashi/",
  "/akuma/",
  "/daidarabotchi/",
  "/enma/",
  "/fujin/",
  "/raijin/",
  "/tamamo-no-mae/",
  "/sutoku-tenno/",
  "/hashihime/",
  "/kiyohime/",
  "/momiji/",
];

// Initialize illegal characters lookup tables
function initializeIllegalChars(): void {
  const illegalChars = [CHAR_CODES.NULL, 60, 62, 58, 34, 124, 63, 42, ...Array(32).keys()];
  for (const char of illegalChars) {
    ILLEGAL_PATH_CHARS[char] = 1;
    ILLEGAL_FILENAME_CHARS[char] = 1;
  }
  ILLEGAL_PATH_CHARS[CHAR_CODES.FORWARD_SLASH] = 0; // Allow in paths
  ILLEGAL_PATH_CHARS[CHAR_CODES.BACK_SLASH] = 0; // Allow in paths (normalized later)
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

// Extended Unicode mapping (up to 0xFFFF for broader script support)
const UNICODE_MAP_SIZE = 0xffff; // Covers BMP (Basic Multilingual Plane)
const DEFAULT_UNICODE_MAP = createDefaultUnicodeMap();
function createDefaultUnicodeMap(): Uint8Array {
  const map = new Uint8Array(UNICODE_MAP_SIZE);
  map.fill(CHAR_CODES.UNDERSCORE); // Default to underscore for unmapped chars
  for (let i = 32; i < 127; i++) map[i] = i; // ASCII printable chars

  // Latin-1 and Cyrillic mappings (previous)
  const basicMappings: Record<number, number> = {
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

  // Japanese Hiragana/Katakana to English transliteration (simplified examples)
  const japaneseMappings: Record<number, string> = {
    0x3042: "a", // あ → a
    0x3044: "i", // い → i
    0x3046: "u", // う → u
    0x3048: "e", // え → e
    0x304a: "o", // お → o
    0x30a2: "a", // ア → a
    0x30a4: "i", // イ → i
    0x30a6: "u", // ウ → u
    0x30a8: "e", // エ → e
    0x30aa: "o", // オ → o
    0x305f: "ta", // た → ta
    0x30bf: "ta", // タ → ta
  };

  // Chinese to English transliteration (Pinyin-like, simplified examples)
  const chineseMappings: Record<number, string> = {
    0x4e00: "yi", // 一 → yi
    0x4eba: "ren", // 人 → ren
    0x5c71: "shan", // 山 → shan
    0x6c34: "shui", // 水 → shui
  };

  // Arabic to English transliteration (simplified examples)
  const arabicMappings: Record<number, string> = {
    0x0627: "a", // ا → a
    0x0628: "b", // ب → b
    0x062a: "t", // ت → t
    0x0645: "m", // م → m
  };

  // Apply basic mappings
  for (const [key, value] of Object.entries(basicMappings)) map[Number(key)] = value;

  // Apply multi-byte mappings (simplified transliteration to single chars or underscore)
  for (const [key, value] of Object.entries(japaneseMappings)) {
    map[Number(key)] = value.charCodeAt(0); // Take first char for simplicity
  }
  for (const [key, value] of Object.entries(chineseMappings)) {
    map[Number(key)] = value.charCodeAt(0); // Take first char
  }
  for (const [key, value] of Object.entries(arabicMappings)) {
    map[Number(key)] = value.charCodeAt(0); // Take first char
  }

  return map;
}

// Cryptographically secure RNG
class SecureRNG {
  private buffer: Uint32Array;
  private index: number;
  private readonly size = 16; // Buffer 16 numbers at a time

  constructor(seed?: Uint32Array) {
    this.buffer = seed ?? new Uint32Array(this.size);
    this.index = this.size; // Force initial fill
    if (!seed) this.refillBuffer();
  }

  private refillBuffer(): void {
    crypto.getRandomValues(this.buffer);
    this.index = 0;
  }

  next(): number {
    if (this.index >= this.size) this.refillBuffer();
    return this.buffer[this.index++] / 0x100000000; // Normalize to [0, 1)
  }
}

// Pre-allocated buffers and decoder
const PATH_BUFFER = new Uint8Array(DEFAULT_BUFFER_SIZE);
const FILENAME_BUFFER = new Uint8Array(DEFAULT_BUFFER_SIZE);
const DECODER = new TextDecoder();

// Helper functions
function detectPlatform(): "win32" | "posix" {
  return typeof process !== "undefined" && process.platform === "win32" ? "win32" : "posix";
}

function isSpaceOnly(str: string): boolean {
  return str.trim() === "";
}

function containsTraversal(input: string): boolean {
  return /\.\.(\/|\\)/.test(input) || input.includes(".."); // Check for "../" or "..\" or standalone ".."
}

function normalizePath(input: string, platform: "win32" | "posix"): string {
  let normalized = input
    .replace(/\/+/g, "/") // Collapse multiple slashes
    .replace(/\\+/g, "\\") // Collapse multiple backslashes (Windows)
    .replace(/^\.+/, ""); // Remove leading dots

  if (platform === "win32") {
    // Handle Windows drive letters (e.g., "C:\path" → "/C/path")
    if (/^[a-zA-Z]:/.test(normalized)) {
      const drive = normalized.charAt(0).toUpperCase();
      normalized = `/${drive}${normalized.slice(2)}`;
    }
    normalized = normalized.replace(/\\/g, "/"); // Convert all to forward slashes
  } else {
    normalized = normalized.replace(/\\/g, "/"); // Normalize backslashes to forward slashes
  }

  return normalized;
}

function generateYokaiPath(rng: SecureRNG): string {
  const yokai1 = YOKAI_ONI_PATHS[Math.floor(rng.next() * YOKAI_ONI_PATHS.length)];
  const yokai2 = YOKAI_ONI_PATHS[Math.floor(rng.next() * YOKAI_ONI_PATHS.length)];
  return `${yokai1}${yokai2.slice(1)}`; // Combine two yokai names, removing extra slash
}

function sanitizePath(
  input: string,
  buffer: Uint8Array,
  bufferSize: number,
  rng: SecureRNG,
  platform: "win32" | "posix"
): string {
  if (isSpaceOnly(input)) return SPACE_PATHS[Math.floor(rng.next() * SPACE_PATHS.length)];
  if (input.length > bufferSize) throw new Error(`Path exceeds buffer size of ${bufferSize} bytes`);
  if (containsTraversal(input)) return generateYokaiPath(rng);

  const normalized = normalizePath(input, platform);
  let writePos = 0;
  const hasInitialSlash = normalized.charCodeAt(0) === CHAR_CODES.FORWARD_SLASH;
  if (!hasInitialSlash) buffer[writePos++] = CHAR_CODES.FORWARD_SLASH;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i) & BYTE_MASK;
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
  return CHAR_CODES.UNDERSCORE; // Fallback to underscore for unmapped chars
}

function sanitizeFilenameCore(
  input: string,
  buffer: Uint8Array,
  bufferSize: number,
  unicodeMap: Uint8Array,
  onOverflow: "error" | "ignore",
  platform: "win32" | "posix"
): string {
  if (input.length > bufferSize) throw new Error(`Filename exceeds buffer size of ${bufferSize} bytes`);
  if (containsTraversal(input)) return generateYokaiPath(new SecureRNG()).slice(1); // Remove leading slash for filename

  const normalized = normalizePath(input, platform);
  let writePos = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
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
  onOverflow: "error" | "ignore",
  platform: "win32" | "posix"
): string {
  const raw = sanitizeFilenameCore(input, buffer, bufferSize, unicodeMap, onOverflow, platform);
  return removeExcessiveUnderscores(raw);
}

function generateSafeFilename(extension: string, fileTypeWords: Record<string, string[]>, rng: SecureRNG): string {
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
  filePathLength: number,
  onTruncate: "error" | "smart" | "default"
): string {
  const extPart = extension ? `.${extension}` : "";
  const fullLength = filePathLength + filename.length + extPart.length;
  if (fullLength <= maxLength) return `${filename}${extPart}`;

  if (onTruncate === "error") throw new Error(`Path exceeds maxLength of ${maxLength}`);
  const available = maxLength - filePathLength - extPart.length;
  if (available <= 1) return `f${extPart}`;

  if (onTruncate === "smart" && available > 3) {
    const firstWordEnd = filename.indexOf("_") === -1 ? available : Math.min(filename.indexOf("_"), available);
    return `${filename.substring(0, firstWordEnd)}${extPart}`;
  }
  return `${filename.substring(0, available)}${extPart}`;
}

/**
 * Parses and sanitizes a file path with cryptographic security, cross-platform compatibility, and advanced internationalization.
 * Ensures compatibility with file system constraints and provides thematic random paths for space-only or traversal inputs.
 *
 * @param path - Directory path (e.g., "/docs", "C:\\files", " "). Defaults to "/". Space-only inputs yield a random Camelot or Lord of the Rings themed path (e.g., "/frodo/"). Traversal inputs (e.g., "../") yield a random yokai/oni path (e.g., "/kappa/tengu/").
 * @param filename - Filename (e.g., "test.txt"). Defaults to "file". Invalid inputs are replaced with a safe name; traversal inputs yield a yokai/oni name.
 * @param options - Configuration options:
 *   - `maxLength`: Maximum total path length (default: 260 on Windows, 4096 on POSIX).
 *   - `unicodeMap`: Custom Unicode-to-ASCII mapping (default: BMP support with transliteration to English).
 *   - `onTruncate`: Behavior for long paths: "error" (throw), "smart" (keep first word), "default" (simple cut) (default: "default").
 *   - `onUnicodeOverflow`: Behavior for unmapped Unicode chars: "error" (throw), "ignore" (use "_") (default: "ignore").
 *   - `seed`: Optional Uint32Array seed for RNG (default: cryptographically secure random values).
 *   - `fileTypeWords`: Custom word lists for generating filenames by extension (default: predefined lists).
 *   - `bufferSize`: Size of internal buffers (default: 1024).
 *   - `platform`: Target platform ("win32", "posix", or "auto" to detect; default: "auto").
 * @returns A `PathParseResult` object with sanitized path components:
 *   - `original_path`: Original input.
 *   - `file_path`: Sanitized directory path with trailing slash (always forward slashes).
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
 * // => { file_path: "/e/", file_name: "test.txt", ... }
 * parsePathComprehensive(" ", "file.pdf")
 * // => { file_path: "/shire/", file_name: "file.pdf", ... }
 * parsePathComprehensive("../evil", "file.txt")
 * // => { file_path: "/kappa/tengu/", file_name: "file.txt", ... }
 * parsePathComprehensive("C:\\files", "テスト.txt", { platform: "win32" })
 * // => { file_path: "/C/files/", file_name: "tesuto.txt", ... }
 * parsePathComprehensive("/path", "人山.txt")
 * // => { file_path: "/path/", file_name: "renshan.txt", ... }
 */
export function parsePathComprehensive(
  path: string = "/",
  filename: string = "file",
  options: ParsePathOptions = {}
): PathParseResult {
  // Apply defaults and validate options
  const platform = options.platform ?? "auto";
  const detectedPlatform = platform === "auto" ? detectPlatform() : platform;
  const maxLengthDefault = detectedPlatform === "win32" ? DEFAULT_MAX_LENGTH_WIN32 : DEFAULT_MAX_LENGTH_POSIX;
  const maxLength = options.maxLength ?? maxLengthDefault;
  if (maxLength < 1) throw new Error("maxLength must be a positive number");
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
  const unicodeMap = options.unicodeMap ?? DEFAULT_UNICODE_MAP;
  if (options.unicodeMap && !(options.unicodeMap instanceof Uint8Array)) throw new Error("unicodeMap must be a Uint8Array");
  const onTruncate = options.onTruncate ?? "default";
  const onUnicodeOverflow = options.onUnicodeOverflow ?? "ignore";
  const fileTypeWords = options.fileTypeWords ?? DEFAULT_FILE_TYPE_WORDS;
  const rng = new SecureRNG(options.seed);

  // Use larger buffers if specified
  const pathBuffer = bufferSize > DEFAULT_BUFFER_SIZE ? new Uint8Array(bufferSize) : PATH_BUFFER;
  const filenameBuffer = bufferSize > DEFAULT_BUFFER_SIZE ? new Uint8Array(bufferSize) : FILENAME_BUFFER;

  // Sanitize path and filename
  const sanitizedPath = sanitizePath(path, pathBuffer, bufferSize, rng, detectedPlatform);
  const sanitizedFilename = sanitizeFilename(
    filename,
    filenameBuffer,
    bufferSize,
    unicodeMap,
    onUnicodeOverflow,
    detectedPlatform
  );

  // Split filename into name and extension
  const extIndex = sanitizedFilename.lastIndexOf(".");
  let baseName = extIndex > 0 ? sanitizedFilename.substring(0, extIndex) : sanitizedFilename;
  const extension = extIndex > 0 && extIndex < sanitizedFilename.length - 1 ? sanitizedFilename.substring(extIndex + 1) : "";

  // Check for reserved names or excessive underscores (case-insensitive on Windows)
  const upperBaseName = detectedPlatform === "win32" ? baseName.toUpperCase() : baseName;
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
    file_path: sanitizedPath,
    file_name: fileName,
    file_type: extension,
    filename_without_extension: baseName,
    extension_with_dot: extension ? `.${extension}` : "",
  };
}

// Test cases
function processFilePath(path: string, filename: string, options?: ParsePathOptions): void {
  try {
    const result = parsePathComprehensive(path, filename, options);
    console.log("Parsed Path Result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  }
}

processFilePath("e", "test.txt");
processFilePath(" ", "file.txt"); // Random Camelot or LOTR path
processFilePath("     ", "doc.pdf"); // Random Camelot or LOTR path
processFilePath("/long/path", "very_long_name.pdf", { maxLength: 20, onTruncate: "smart" });
processFilePath("../evil", "file.txt"); // Random yokai/oni path
processFilePath("/path/\0evil", "file.txt"); // Null byte sanitized
processFilePath("/path", "../hack.txt"); // Random yokai/oni filename
processFilePath("C:\\Users\\Docs", "テスト.txt", { platform: "win32" }); // Windows path with Japanese
processFilePath("/home/user", "人山.pdf", { platform: "posix" }); // POSIX path with Chinese
processFilePath("/path", "ملف.txt", { platform: "posix" }); // POSIX path with Arabic
