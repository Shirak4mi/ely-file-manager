import { NotFoundException } from "./error/index.ts";
import { mkdir, readdir } from "node:fs/promises";
import { file_path } from "./env.ts";
import { file } from "bun";

export * from "./logger/index.ts";
export * from "./ip/index.ts";

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


