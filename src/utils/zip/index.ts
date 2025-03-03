/**
 * Ultra-fast ZIP file creation implementation
 * Optimized specifically for performance in Bun
 */

// ZIP format constants
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const VERSION_NEEDED = 20; // 2.0
const FLAGS = 0;
const COMPRESSION_METHOD_STORE = 0; // No compression for maximum speed
const DATETIME = new Uint8Array([0, 0, 0, 0]); // Fixed date/time for speed

/**
 * File entry for ZIP generation
 */
interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Writes a 32-bit integer to a buffer at the specified position, little-endian
 */
function writeUint32LE(buffer: Uint8Array, value: number, offset: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Writes a 16-bit integer to a buffer at the specified position, little-endian
 */
function writeUint16LE(buffer: Uint8Array, value: number, offset: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

/**
 * Calculates CRC32 of data using a precomputed table for maximum speed
 */
function calculateCRC32Fast(data: Uint8Array): number {
  // Precomputed CRC32 table for polynomial 0xEDB88320
  const crcTable = new Uint32Array(256);

  // Generate the table on first use
  if (crcTable[1] === 0) {
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
      crcTable[i] = crc;
    }
  }

  // Calculate CRC32
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return ~crc >>> 0; // Finalize CRC-32 value
}

/**
 * Creates a ZIP file from a list of entries with maximum performance
 * Uses direct buffer manipulation for speed with no compression (STORE method)
 *
 * @param entries - Array of entries to include in the ZIP
 * @returns Uint8Array containing the ZIP data
 */
function createZipFastInternal(entries: ZipEntry[]): Uint8Array {
  // Pre-calculate total size to allocate a single buffer
  let totalSize = 0;
  const centralDirSize = 46; // Fixed size of central directory entry, not including filenames
  const localHeaderSize = 30; // Fixed size of local file header, not including filename
  const endOfCentralDirSize = 22; // Fixed size of end of central directory record

  // Calculate size for each entry
  const entrySizes: { localHeaderOffset: number; fileSize: number; nameSize: number }[] = [];

  for (const entry of entries) {
    const nameSize = entry.name.length;
    const fileSize = entry.data.length;

    // Local file header + filename + file data
    const entrySize = localHeaderSize + nameSize + fileSize;
    entrySizes.push({
      localHeaderOffset: totalSize,
      fileSize,
      nameSize,
    });

    totalSize += entrySize;
  }

  // Add central directory size
  let centralDirOffset = totalSize;
  for (const entry of entries) {
    totalSize += centralDirSize + entry.name.length;
  }

  // Add end of central directory record
  totalSize += endOfCentralDirSize;

  // Allocate a single buffer for the entire ZIP file
  const buffer = new Uint8Array(totalSize);
  const encoder = new TextEncoder();

  // Write each file entry
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { localHeaderOffset, fileSize, nameSize } = entrySizes[i];
    const nameBytes = encoder.encode(entry.name);
    const crc32 = calculateCRC32Fast(entry.data);
    let offset = localHeaderOffset;

    // Local file header signature
    writeUint32LE(buffer, LOCAL_FILE_HEADER_SIGNATURE, offset);
    offset += 4;

    // Version needed to extract
    writeUint16LE(buffer, VERSION_NEEDED, offset);
    offset += 2;

    // General purpose bit flag
    writeUint16LE(buffer, FLAGS, offset);
    offset += 2;

    // Compression method (STORE = no compression)
    writeUint16LE(buffer, COMPRESSION_METHOD_STORE, offset);
    offset += 2;

    // Last modification time and date (using fixed values for speed)
    buffer.set(DATETIME, offset);
    offset += 4;

    // CRC-32
    writeUint32LE(buffer, crc32, offset);
    offset += 4;

    // Compressed size (same as uncompressed for STORE)
    writeUint32LE(buffer, fileSize, offset);
    offset += 4;

    // Uncompressed size
    writeUint32LE(buffer, fileSize, offset);
    offset += 4;

    // Filename length
    writeUint16LE(buffer, nameSize, offset);
    offset += 2;

    // Extra field length (0)
    writeUint16LE(buffer, 0, offset);
    offset += 2;

    // Filename
    buffer.set(nameBytes, offset);
    offset += nameSize;

    // File data
    buffer.set(entry.data, offset);
  }

  // Write central directory
  let centralOffset = centralDirOffset;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { localHeaderOffset, fileSize, nameSize } = entrySizes[i];
    const nameBytes = encoder.encode(entry.name);
    const crc32 = calculateCRC32Fast(entry.data);

    // Central directory header signature
    writeUint32LE(buffer, CENTRAL_DIRECTORY_SIGNATURE, centralOffset);
    centralOffset += 4;

    // Version made by
    writeUint16LE(buffer, VERSION_NEEDED, centralOffset);
    centralOffset += 2;

    // Version needed to extract
    writeUint16LE(buffer, VERSION_NEEDED, centralOffset);
    centralOffset += 2;

    // General purpose bit flag
    writeUint16LE(buffer, FLAGS, centralOffset);
    centralOffset += 2;

    // Compression method
    writeUint16LE(buffer, COMPRESSION_METHOD_STORE, centralOffset);
    centralOffset += 2;

    // Last modification time and date
    buffer.set(DATETIME, centralOffset);
    centralOffset += 4;

    // CRC-32
    writeUint32LE(buffer, crc32, centralOffset);
    centralOffset += 4;

    // Compressed size
    writeUint32LE(buffer, fileSize, centralOffset);
    centralOffset += 4;

    // Uncompressed size
    writeUint32LE(buffer, fileSize, centralOffset);
    centralOffset += 4;

    // Filename length
    writeUint16LE(buffer, nameSize, centralOffset);
    centralOffset += 2;

    // Extra field length (0)
    writeUint16LE(buffer, 0, centralOffset);
    centralOffset += 2;

    // File comment length (0)
    writeUint16LE(buffer, 0, centralOffset);
    centralOffset += 2;

    // Disk number start (0)
    writeUint16LE(buffer, 0, centralOffset);
    centralOffset += 2;

    // Internal file attributes (0)
    writeUint16LE(buffer, 0, centralOffset);
    centralOffset += 2;

    // External file attributes (0)
    writeUint32LE(buffer, 0, centralOffset);
    centralOffset += 4;

    // Relative offset of local header
    writeUint32LE(buffer, localHeaderOffset, centralOffset);
    centralOffset += 4;

    // Filename
    buffer.set(nameBytes, centralOffset);
    centralOffset += nameSize;
  }

  // End of central directory record
  const endOffset = centralOffset;

  // End of central directory signature
  writeUint32LE(buffer, END_OF_CENTRAL_DIR_SIGNATURE, endOffset);

  // Number of this disk (0)
  writeUint16LE(buffer, 0, endOffset + 4);

  // Disk where central directory starts (0)
  writeUint16LE(buffer, 0, endOffset + 6);

  // Number of central directory records on this disk
  writeUint16LE(buffer, entries.length, endOffset + 8);

  // Total number of central directory records
  writeUint16LE(buffer, entries.length, endOffset + 10);

  // Size of central directory
  writeUint32LE(buffer, centralOffset - centralDirOffset, endOffset + 12);

  // Offset of start of central directory
  writeUint32LE(buffer, centralDirOffset, endOffset + 16);

  // Comment length (0)
  writeUint16LE(buffer, 0, endOffset + 20);

  return buffer;
}

/**
 * File content that can be added to a ZIP archive
 */
type ZipContent = string | Uint8Array | ArrayBuffer;

/**
 * Object mapping file paths to their contents
 */
interface ZipFileMap {
  [path: string]: ZipContent;
}

/**
 * Creates a ZIP file from a map of filenames to contents
 * Optimized for maximum performance with no compression
 *
 * @param files - Map of file paths to their contents
 * @returns Uint8Array containing the ZIP data
 *
 * @example
 * ```ts
 * const zipData = createZipFast({
 *   'hello.txt': 'Hello World!',
 *   'data.json': JSON.stringify({ name: 'test' })
 * });
 *
 * // Write to file
 * await Bun.write('output.zip', zipData);
 *
 * // Or use in HTTP response
 * return new Response(zipData, {
 *   headers: {
 *     'Content-Type': 'application/zip',
 *     'Content-Disposition': 'attachment; filename="download.zip"'
 *   }
 * });
 * ```
 */
export function createZipFast(files: ZipFileMap): Uint8Array {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [];

  // Convert input files to ZipEntry array
  for (const [name, content] of Object.entries(files)) {
    let data: Uint8Array;

    if (content instanceof Uint8Array) {
      data = content;
    } else if (content instanceof ArrayBuffer) {
      data = new Uint8Array(content);
    } else if (typeof content === "string") {
      data = encoder.encode(content);
    } else {
      // Invalid input, skip
      continue;
    }

    entries.push({ name, data });
  }

  return createZipFastInternal(entries);
}

/**
 * Creates a ZIP file from an array of file paths
 * Will read files directly from disk
 *
 * @param filePaths - Array of file paths to include
 * @param baseDir - Base directory for file path resolution
 * @returns Uint8Array containing the ZIP data
 *
 * @example
 * ```ts
 * const zipData = await createZipFromFilesFast([
 *   'index.html',
 *   'styles.css',
 *   'script.js'
 * ], './public');
 * ```
 */
export async function createZipFromFilesFast(filePaths: string[], baseDir: string = process.cwd()): Promise<Uint8Array> {
  const { join, relative } = await import("node:path");
  const entries: ZipEntry[] = [];

  for (const filePath of filePaths) {
    try {
      const fullPath = join(baseDir, filePath);
      const data = await Bun.file(fullPath).arrayBuffer();
      const relativePath = relative(baseDir, fullPath).replace(/\\/g, "/");

      entries.push({
        name: relativePath,
        data: new Uint8Array(data),
      });
    } catch {
      // Skip files that can't be read for maximum speed
      continue;
    }
  }

  return createZipFastInternal(entries);
}

/**
 * Creates a ZIP file and prepares it for HTTP download
 *
 * @param files - Map of file paths to their contents
 * @param filename - Name for the downloaded file
 * @returns Object with ZIP data and headers for serving as a download
 *
 * @example
 * ```ts
 * const { data, headers } = createZipResponse({
 *   'readme.txt': 'This is a readme file',
 *   'config.json': JSON.stringify({ version: '1.0.0' })
 * }, 'download.zip');
 *
 * return new Response(data, { headers });
 * ```
 */
export function createZipResponse(
  files: ZipFileMap,
  filename: string = "download.zip"
): { data: Uint8Array; headers: Record<string, string> } {
  const data = createZipFast(files);

  const headers: Record<string, string> = {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": String(data.length),
  };

  return { data: data, headers };
}
