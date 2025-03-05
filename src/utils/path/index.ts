import type { ParsePathOptions, PathParseResult } from "@/types/index.ts";

// Core constants
const ILLEGAL_CHARS = new Uint8Array([60, 62, 58, 34, 124, 63, 42, 0]);
const DEFAULT_MAX_LENGTH = 255;
const FORWARD_SLASH = 47;
const UNDERSCORE = 95;
const BACK_SLASH = 92;
const DOT = 46;

// Frozen object for FILE_TYPE_WORDS
const FILE_TYPE_WORDS = Object.freeze({
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

// Compact Unicode mapping using Uint8Array (0-255 range) with pre-computed values
const UNICODE_MAP = new Uint8Array(0x0500);
UNICODE_MAP.fill(95); // Default to underscore
for (let i = 32; i < 127; i++) UNICODE_MAP[i] = i; // ASCII printable characters
UNICODE_MAP[0xc0] = 97;
UNICODE_MAP[0xc1] = 97;
UNICODE_MAP[0xc2] = 97; // Latin-1 a
UNICODE_MAP[0xc8] = 101;
UNICODE_MAP[0xc9] = 101;
UNICODE_MAP[0xca] = 101; // e
UNICODE_MAP[0xcc] = 105;
UNICODE_MAP[0xcd] = 105;
UNICODE_MAP[0xce] = 105; // i
UNICODE_MAP[0xd2] = 111;
UNICODE_MAP[0xd3] = 111;
UNICODE_MAP[0xd4] = 111; // o
UNICODE_MAP[0xd9] = 117;
UNICODE_MAP[0xda] = 117;
UNICODE_MAP[0xdb] = 117; // u
UNICODE_MAP[0xe0] = 97;
UNICODE_MAP[0xe1] = 97;
UNICODE_MAP[0xe2] = 97; // a
UNICODE_MAP[0xe8] = 101;
UNICODE_MAP[0xe9] = 101;
UNICODE_MAP[0xea] = 101; // e
UNICODE_MAP[0xec] = 105;
UNICODE_MAP[0xed] = 105;
UNICODE_MAP[0xee] = 105; // i
UNICODE_MAP[0xf2] = 111;
UNICODE_MAP[0xf3] = 111;
UNICODE_MAP[0xf4] = 111; // o
UNICODE_MAP[0xf9] = 117;
UNICODE_MAP[0xfa] = 117;
UNICODE_MAP[0xfb] = 117; // u
UNICODE_MAP[0xd7] = 120;
UNICODE_MAP[0xf7] = 95;
UNICODE_MAP[0x2013] = 45;
UNICODE_MAP[0x2014] = 45;
// Cyrillic
UNICODE_MAP[0x0410] = 97;
UNICODE_MAP[0x0430] = 97; // Аа → a
UNICODE_MAP[0x0411] = 98;
UNICODE_MAP[0x0431] = 98; // Бб → b
UNICODE_MAP[0x0412] = 118;
UNICODE_MAP[0x0432] = 118; // Вв → v
UNICODE_MAP[0x0413] = 103;
UNICODE_MAP[0x0433] = 103; // Гг → g
UNICODE_MAP[0x0414] = 100;
UNICODE_MAP[0x0434] = 100; // Дд → d
UNICODE_MAP[0x0415] = 101;
UNICODE_MAP[0x0435] = 101; // Ее → e
UNICODE_MAP[0x0416] = 122;
UNICODE_MAP[0x0436] = 122; // Жж → z
UNICODE_MAP[0x0417] = 122;
UNICODE_MAP[0x0437] = 122; // Зз → z
UNICODE_MAP[0x0418] = 105;
UNICODE_MAP[0x0438] = 105; // Ии → i
UNICODE_MAP[0x0419] = 121;
UNICODE_MAP[0x0439] = 121; // Йй → y
UNICODE_MAP[0x041a] = 107;
UNICODE_MAP[0x043a] = 107; // Кк → k
UNICODE_MAP[0x041b] = 108;
UNICODE_MAP[0x043b] = 108; // Лл → l
UNICODE_MAP[0x041c] = 109;
UNICODE_MAP[0x043c] = 109; // Мм → m
UNICODE_MAP[0x041d] = 110;
UNICODE_MAP[0x043d] = 110; // Нн → n
UNICODE_MAP[0x041e] = 111;
UNICODE_MAP[0x043e] = 111; // Оо → o
UNICODE_MAP[0x041f] = 112;
UNICODE_MAP[0x043f] = 112; // Пп → p
UNICODE_MAP[0x0420] = 114;
UNICODE_MAP[0x0440] = 114; // Рр → r
UNICODE_MAP[0x0421] = 115;
UNICODE_MAP[0x0441] = 115; // Сс → s
UNICODE_MAP[0x0422] = 116;
UNICODE_MAP[0x0442] = 116; // Тт → t
UNICODE_MAP[0x0423] = 117;
UNICODE_MAP[0x0443] = 117; // Уу → u
UNICODE_MAP[0x0424] = 102;
UNICODE_MAP[0x0444] = 102; // Фф → f
UNICODE_MAP[0x0425] = 104;
UNICODE_MAP[0x0445] = 104; // Хх → h
UNICODE_MAP[0x0426] = 116;
UNICODE_MAP[0x0446] = 116; // Цц → t
UNICODE_MAP[0x0427] = 99;
UNICODE_MAP[0x0447] = 99; // Чч → c
UNICODE_MAP[0x0428] = 115;
UNICODE_MAP[0x0448] = 115; // Шш → s
UNICODE_MAP[0x0429] = 115;
UNICODE_MAP[0x0449] = 115; // Щщ → s
UNICODE_MAP[0x042a] = 95;
UNICODE_MAP[0x044a] = 95; // Ъъ → _
UNICODE_MAP[0x042b] = 121;
UNICODE_MAP[0x044b] = 121; // Ыы → y
UNICODE_MAP[0x042c] = 95;
UNICODE_MAP[0x044c] = 95; // Ьь → _
UNICODE_MAP[0x042d] = 101;
UNICODE_MAP[0x044d] = 101; // Ээ → e
UNICODE_MAP[0x042e] = 117;
UNICODE_MAP[0x044e] = 117; // Юю → u
UNICODE_MAP[0x042f] = 121;
UNICODE_MAP[0x044f] = 121; // Яя → y

// Fast RNG
class FastRNG {
  private seed: number;
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0;
  }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return (this.seed >>> 8) / 16777216;
  }
}
const rng = new FastRNG();

/**
 * Generates a random filename based on the provided file extension.
 * Combines a type-specific word with a random number.
 * @param {string} fileExtension - File extension (without dot, e.g., "txt")
 * @returns {string} A generated filename (e.g., "note1234")
 */
function generateRandomFilename(fileExtension: string): string {
  const ext = fileExtension.toLowerCase();
  const words = FILE_TYPE_WORDS[ext as keyof typeof FILE_TYPE_WORDS] || FILE_TYPE_WORDS["default"];
  const wordIndex = (rng.next() * words.length) | 0;
  const number = (rng.next() * 10000) | 0;
  return words[wordIndex] + number;
}

// Pre-allocated buffer
const BUFFER_POOL = new Uint8Array(1024);

/**
 * Parses and sanitizes a filepath into its components efficiently.
 * Uses a single-pass approach with bulk processing to minimize character-by-character operations.
 * @param {string} filepath - The input filepath to parse and sanitize (e.g., "/docs/тест.pdf")
 * @param {ParsePathOptions} [options] - Optional configuration object
 * @param {number} [options.maxLength=255] - Maximum allowed length of the full path
 * @returns {PathParseResult} Parsed and sanitized path components
 * @throws {Error} If filepath is empty or undefined
 * @throws {Error} If maxLength is less than 1
 * @example
 * parsePathComprehensive("/docs/тест.pdf")
 * // Returns {
 * //   original_path: "/docs/тест.pdf",
 * //   path: "/docs/",
 * //   file_name: "test.pdf",
 * //   file_type: "pdf",
 * //   filename_without_extension: "test",
 * //   extension_with_dot: ".pdf"
 * // }
 * @example
 * parsePathComprehensive("/long/path/тест.pdf", { maxLength: 20 })
 * // Returns {
 * //   original_path: "/long/path/тест.pdf",
 * //   path: "/long/path/",
 * //   file_name: "t.pdf",
 * //   file_type: "pdf",
 * //   filename_without_extension: "t",
 * //   extension_with_dot: ".pdf"
 * // }
 */
export function parsePathComprehensive(filepath: string, options: ParsePathOptions = {}): PathParseResult {
  if (!filepath) throw new Error("Filepath cannot be empty or undefined");
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  if (maxLength < 1) throw new Error("maxLength must be a positive number");

  const len = Math.min(filepath.length, BUFFER_POOL.length);
  BUFFER_POOL.fill(0, 0, len); // Clear buffer

  // Bulk convert characters to normalized form
  let underscoreCount = 0;
  let letterCount = 0;
  let nameStart = 0;
  let extStart = -1;
  let lastChar = 0;
  let pathEnd = 0;
  let outPos = 0;

  // Process in chunks where possible
  for (let i = 0; i < len; i++) {
    const char = filepath.charCodeAt(i);
    let normalized = char < UNICODE_MAP.length ? UNICODE_MAP[char] : 95;

    // Handle separators
    if (char === FORWARD_SLASH || char === BACK_SLASH) {
      if (outPos > 0 && lastChar !== FORWARD_SLASH) {
        BUFFER_POOL[outPos++] = FORWARD_SLASH;
        pathEnd = outPos;
        nameStart = outPos;
      }
      lastChar = FORWARD_SLASH;
      continue;
    }

    // Detect extension
    if (char === DOT && extStart === -1 && outPos > pathEnd) {
      extStart = outPos;
    }

    // Replace illegal characters
    for (let j = 0; j < ILLEGAL_CHARS.length; j++) {
      if (char === ILLEGAL_CHARS[j]) {
        normalized = UNDERSCORE;
        break;
      }
    }

    // Track underscores and letters
    if (normalized === UNDERSCORE && lastChar === UNDERSCORE) {
      underscoreCount++;
      continue;
    }
    if ((char >= 65 && char <= 90) || (char >= 97 && char <= 122) || (char >= 0x0410 && char <= 0x044f)) {
      letterCount++;
    }

    BUFFER_POOL[outPos++] = normalized;
    lastChar = normalized;
  }

  // Extract components using TextDecoder for efficiency
  const decoder = new TextDecoder();
  let path = "/";
  let fileName = "file";
  let fileExtension = "";

  if (pathEnd > 0) path = decoder.decode(BUFFER_POOL.subarray(0, pathEnd));

  if (extStart !== -1 && extStart > nameStart) {
    fileName = decoder.decode(BUFFER_POOL.subarray(nameStart, extStart));
    fileExtension = decoder.decode(BUFFER_POOL.subarray(extStart + 1, outPos));
  } else if (outPos > nameStart) fileName = decoder.decode(BUFFER_POOL.subarray(nameStart, outPos));

  if (underscoreCount > letterCount) fileName = generateRandomFilename(fileExtension);

  let file_name = fileExtension ? `${fileName}.${fileExtension}` : fileName;
  const fullPath = path + file_name;

  if (fullPath.length > maxLength) {
    const extLength = fileExtension.length + 1;
    const available = maxLength - path.length - extLength;
    file_name = available > 1 ? `${fileName.slice(0, available)}.${fileExtension}` : `f.${fileExtension}`;
  }

  if (file_name.endsWith(".")) file_name = file_name.slice(0, -1);

  return {
    original_path: filepath,
    path,
    file_name,
    file_type: fileExtension,
    filename_without_extension: fileName,
    extension_with_dot: fileExtension ? `.${fileExtension}` : "",
  };
}
