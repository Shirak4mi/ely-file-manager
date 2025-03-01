import { NotFoundException } from "./error/index.ts";
import { mkdir, readdir } from "node:fs/promises";
import { file_path } from "./env.ts";
import { file } from "bun";

export function isJsonString(str: string): boolean {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

/**
 * This function is for removing "found" field on response Error Object, because this field shows incoming data
 * @param error String
 * @returns Obj | String
 */
export function filterMessage(error: string): string {
  if (isJsonString(error)) {
    const { found: _, ...args } = JSON.parse(error);
    return args;
  } else return error;
}

export async function getWorkingFilePath(path?: string): Promise<string | undefined> {
  try {
    if (!path) throw new NotFoundException("File path not found");
    const totalFilePath = file(file_path + path);
    if (!(await totalFilePath.exists())) throw new NotFoundException("Error files does not exists");
    return totalFilePath.name;
  } catch (err) {
    console.error(err, path);
    throw err;
  }
}

export function sanitizeString(fileOrPath: string) {
  return fileOrPath.replaceAll(" ", "_");
}

export function returnActualOSPath(path: string): string {
  return process.platform === "win32" ? ("C:" + file_path + path).replaceAll("/", "\\") : file_path + path;
}

export async function isDirectory(totalPath: string): Promise<false | Array<string>> {
  try {
    return await readdir(totalPath, { recursive: true });
  } catch (err) {
    return false;
  }
}

export async function createFilePathIfDoesntExists(path: string): Promise<string | undefined> {
  try {
    const totalPath = returnActualOSPath(path);
    const dir = await isDirectory(totalPath);
    if (!dir) return await mkdir(totalPath, { recursive: true });
    return totalPath;
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function createFileOnsFS(workingFP?: string, files?: File | Array<File>): Promise<number | Array<number>> {
  if (!workingFP || !files) throw new NotFoundException("Path not found");
  if (Array.isArray(files))
    return await Promise.all(files.map(async (file) => await Bun.write(workingFP + "/" + file.name, file)));
  return await Bun.write(workingFP + "/" + files.name, files);
}

export async function createFileOnsFSEmpty(workingFP?: string): Promise<number | Array<number>> {
  if (!workingFP) throw new NotFoundException("Path not found");
  return await Bun.write(workingFP, "");
}

export function getFileExtension(filename: string): string {
  const ext = (filename.split(".").pop() ?? "").toLowerCase() || "";
  return ext ? `.${ext}` : "";
}

const logger_fp = returnActualOSPath("/logs/");

type LogLevel = "INFO" | "ERROR" | "DEBUG" | "WARN";

async function ensureFpOrThrow(): Promise<boolean> {
  try {
    const workingFP = await createFilePathIfDoesntExists("/logs/");
    return !!workingFP;
  } catch (err) {
    console.error(err);
    return false;
  }
}

// Logging function
export async function logger(level: LogLevel, message: string, meta?: Record<string, any>): Promise<void> {
  if (!(await ensureFpOrThrow())) return;

  const timestamp = new Date().toISOString();
  const logEntry = `
    Timestamp: ${timestamp}
    Level: ${level}
    Message: ${message} 
    ${meta ? `\n\n Metadata: ${JSON.stringify(meta, null, 2)}` : ""}
    ${"-".repeat(30)}\n\n\n\n`;
  try {
    const file = Bun.file(logger_fp + "/sad_logs.log");
    const existingContent = (await file.exists()) ? await file.text() : "";
    const fileWriter = file.writer();
    fileWriter.write(existingContent + logEntry);
    await fileWriter.end();
  } catch (err) {
    console.error("Failed to write to log file:", err);
  }
}

// Function to convert IPv6 to IPv4 where possible
export function convertIPv6ToIPv4(ipv6: string): string | null {
  // Normalize the IPv6 address (expand shorthand notation)
  const normalizedIPv6 = ipv6.toLowerCase().trim();

  // Regular expressions for IPv4-mapped and IPv4-compatible IPv6 addresses
  const ipv4MappedRegex = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/;
  const ipv4CompatibleRegex = /^::(\d+\.\d+\.\d+\.\d+)$/;

  // Check for IPv4-mapped IPv6 address (e.g., ::ffff:192.168.1.1)
  const mappedMatch = normalizedIPv6.match(ipv4MappedRegex);
  if (mappedMatch && mappedMatch[1]) {
    const ipv4 = mappedMatch[1];
    if (isValidIPv4(ipv4)) {
      return ipv4;
    }
  }

  // Check for IPv4-compatible IPv6 address (e.g., ::192.168.1.1) - deprecated
  const compatibleMatch = normalizedIPv6.match(ipv4CompatibleRegex);
  if (compatibleMatch && compatibleMatch[1]) {
    const ipv4 = compatibleMatch[1];
    if (isValidIPv4(ipv4)) {
      return ipv4;
    }
  }

  // If no match or invalid, return null
  return null;
}

// Helper function to validate an IPv4 address
function isValidIPv4(ip: string): boolean {
  const octets = ip.split(".");
  if (octets.length !== 4) return false;

  return octets.every((octet) => {
    const num = parseInt(octet, 10);
    return (
      num >= 0 && num <= 255 && octet === num.toString() // Ensures no leading zeros (e.g., "01" is invalid)
    );
  });
}
