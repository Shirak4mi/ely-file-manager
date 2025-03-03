/** A value that can be a string, number, boolean, or a nested object with MetaValue properties */
type MetaValue = string | number | boolean | { [key: string]: MetaValue };

/** An object with string keys and MetaValue values, allowing nested structures */
type Meta = { [key: string]: MetaValue };

/**
 * Normalizes text by trimming, lowercasing, and cleaning non-alphanumeric chars.
 * @param {string | number | boolean} text - Input to normalize
 * @returns {string} - Normalized string
 */
function normalizeText(text: string | number | boolean): string {
  const str = typeof text !== "string" ? String(text) : text;
  if (str[0] === "h" && (str[4] === ":" || str[5] === ":")) return str.trim();
  return str
    .trim()
    .toLowerCase()
    .replace(/[^\sa-z0-9:.-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Centers text within a given width using padding.
 * @param {string} text - Text to center
 * @param {number} width - Total width to fit text into
 * @returns {string} - Centered text
 */
function centerText(text: string, width: number): string {
  const normalized = normalizeText(text);
  const len = normalized.length;
  if (len >= width) return normalized;
  const padding = Math.floor((width - len) / 2);
  return " ".repeat(padding) + normalized + " ".repeat(width - len - padding);
}

/**
 * Converts a key to PascalCase with spaces for readability.
 * @param {string} key - Key to convert
 * @returns {string} - PascalCase string
 */
function toPascalCase(key: string): string {
  let result = "";
  let capitalizeNext = true;
  for (let i = 0; i < key.length; i++) {
    const char = key[i];
    if (char >= "A" && char <= "Z") {
      result += " " + char;
      capitalizeNext = false;
    } else if (char === " " || char === "_") {
      capitalizeNext = true;
    } else if (capitalizeNext) {
      result += char.toUpperCase();
      capitalizeNext = false;
    } else {
      result += char.toLowerCase();
    }
  }
  return result.trim();
}

/**
 * Formats metadata into aligned lines with nesting support, preserving "N/A" as-is.
 * @param {Meta} meta - Metadata object to format
 * @returns {string} - Formatted metadata string
 */
function formatMetaLines(meta: Meta): string {
  const lines: string[] = [];
  const keyLengths: Map<string, number> = new Map();

  // Precompute key lengths
  function computeKeyLengths(obj: Meta): void {
    for (const key in obj) {
      const formattedKey = toPascalCase(key);
      keyLengths.set(formattedKey, formattedKey.length);
      const value = obj[key];
      if (typeof value === "object" && value !== null) {
        computeKeyLengths(value as Meta);
      }
    }
  }

  computeKeyLengths(meta);

  const maxKeyLength = Math.max(...keyLengths.values()) || 0;

  // Process entries, skipping normalization for "N/A"
  function processEntry(key: string, value: MetaValue, indent: number): void {
    const formattedKey = toPascalCase(key);
    const padding = " ".repeat(maxKeyLength - formattedKey.length + 5);
    const indentStr = "  ".repeat(indent);

    if (typeof value === "object" && value !== null) {
      lines.push(indentStr + "~ " + formattedKey + ": [obj]");
      for (const k in value as Meta) processEntry(k, (value as Meta)[k], indent + 1);
    } else {
      const valueStr = value === "N/A" ? "N/A" : normalizeText(value);
      lines.push(indentStr + "~ " + formattedKey + ":" + padding + valueStr);
    }
  }

  for (const key in meta) processEntry(key, meta[key], 0);

  return lines.join("\n");
}

/**
 * Creates a formatted log entry with timestamp, level, message, and optional metadata.
 * @param {string} timestamp - Log timestamp
 * @param {string} level - Log level (e.g., "info", "error")
 * @param {string} message - Log message
 * @param {Meta} [meta] - Optional metadata object
 * @returns {string} - Formatted log entry
 */
export default function logEntry(timestamp: string, level: string, message: string, meta?: Meta): string {
  const width = 125;
  const separator = "═".repeat(width);
  const dashLine = "─".repeat(width);

  const lines: Array<string> = [
    "\n",
    separator,
    centerText(level, width).toUpperCase(),
    centerText("[" + timestamp + "]", width),
    separator,
    centerText("Message", width).toUpperCase(),
    dashLine,
  ];

  const messageLines = message.split("\n");

  for (let i = 0; i < messageLines.length; i++) lines.push(centerText(messageLines[i].trim(), width));

  if (meta) lines.push("", centerText("Metadata", width).toUpperCase(), dashLine, formatMetaLines(meta));

  lines.push(separator, "", "");
  lines.push("\n\n\n");
  return lines.join("\n");
}
