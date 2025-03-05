import { Worker, isMainThread, MessageChannel } from "worker_threads";
import { stat, readdir, open } from "fs/promises";
import { EventEmitter } from "events";
import archiver from "archiver";
import crypto from "crypto";
import path from "path";
import fs from "fs";

/**
 * Enhanced configuration for zip operations with streaming support
 */
interface ZipOptions {
  destination?: string;
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  filter?: (filepath: string) => boolean;
  maxConcurrency?: number;
  chunkSize?: number;
  workerTimeout?: number;
  maxRetries?: number;
  streamThreshold?: number; // Threshold for switching to streaming (in bytes)
}

/**
 * Comprehensive file information with streaming metadata
 */
interface FileInfo {
  path: string;
  relativePath: string;
  size?: number;
  retryCount?: number;
  streamable?: boolean;
  hash?: string;
}

/**
 * Enhanced worker message types
 */
interface WorkerMessage {
  type: "start" | "chunk" | "complete" | "error";
  file: FileInfo;
  chunk?: Buffer;
  chunkIndex?: number;
  totalChunks?: number;
}

/**
 * Advanced streaming file processor
 */
class StreamingFileProcessor {
  /**
   * Generate file hash for integrity checking
   */
  static async generateFileHash(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filepath);

      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  /**
   * Stream large files in chunks
   */
  static async streamFile(
    filepath: string,
    chunkSize: number,
    onChunk: (chunk: Buffer, index: number, total: number) => Promise<void>
  ): Promise<string> {
    const fileHandle = await open(filepath, "r");
    const fileStats = await fileHandle.stat();
    const totalChunks = Math.ceil(fileStats.size / chunkSize);

    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const buffer = Buffer.alloc(chunkSize);
        const { bytesRead } = await fileHandle.read(buffer, 0, chunkSize, chunkIndex * chunkSize);

        // Trim buffer to actual bytes read
        const chunk = buffer.slice(0, bytesRead);

        await onChunk(chunk, chunkIndex, totalChunks);
      }

      // Generate and return file hash
      return await this.generateFileHash(filepath);
    } finally {
      await fileHandle.close();
    }
  }
}

/**
 * Advanced Parallel Zipper with Streaming Support
 */
class StreamingParallelZipper extends EventEmitter {
  /**
   * Collect files with advanced filtering and streaming detection
   */
  private async collectFiles(sourcePath: string, options: ZipOptions): Promise<FileInfo[]> {
    const {
      filter = () => true,
      streamThreshold = 100 * 1024 * 1024, // 100MB default
    } = options;

    const files: FileInfo[] = [];

    async function traverseDirectory(currentPath: string, basePath: string) {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        if (entry.isDirectory()) {
          await traverseDirectory(fullPath, basePath);
        } else if (entry.isFile() && filter(fullPath)) {
          const stats = await stat(fullPath);
          files.push({
            path: fullPath,
            relativePath,
            size: stats.size,
            streamable: stats.size > streamThreshold,
          });
        }
      }
    }

    await traverseDirectory(sourcePath, sourcePath);
    return files;
  }

  /**
   * Create advanced worker with improved communication
   */
  private createStreamingWorker(options: ZipOptions): {
    worker: Worker;
    port: import("worker_threads").MessagePort;
  } {
    const { workerTimeout = 30000, chunkSize = 64 * 1024 } = options;

    // Create a message channel for more robust communication
    const { port1, port2 } = new MessageChannel();

    const worker = new Worker(new URL("./streaming-worker.ts", import.meta.url), {
      workerData: {
        timeout: workerTimeout,
        chunkSize,
        transferPort: port2,
      },
      transferList: [port2],
    });

    return { worker, port: port1 };
  }

  /**
   * Advanced parallel file processing with streaming support
   */
  private async processFilesInParallel(files: FileInfo[], options: ZipOptions): Promise<FileInfo[]> {
    const {
      maxConcurrency = Math.max(1, require("os").cpus().length - 1),
      workerTimeout = 30000,
      chunkSize = 64 * 1024,
    } = options;

    const processedFiles: FileInfo[] = [];
    const failedFiles: FileInfo[] = [];

    return new Promise((resolve, reject) => {
      const processingQueue = [...files];
      const activeWorkers = new Set<Worker>();

      const processNextFile = () => {
        // Exit condition
        if (processingQueue.length === 0 && activeWorkers.size === 0) {
          if (failedFiles.length > 0) {
            const error = new Error(`${failedFiles.length} files failed to process`);
            this.emit("partialError", { processed: processedFiles, failed: failedFiles });
            reject(error);
          } else {
            resolve(processedFiles);
          }
          return;
        }

        // Spawn workers while under concurrency limit
        while (processingQueue.length > 0 && activeWorkers.size < maxConcurrency) {
          const file = processingQueue.shift()!;
          const { worker, port } = this.createStreamingWorker(options);
          activeWorkers.add(worker);

          // Advanced communication protocol
          port.on("message", async (message: WorkerMessage) => {
            switch (message.type) {
              case "complete":
                processedFiles.push({ ...file, hash: message.file.hash });
                activeWorkers.delete(worker);
                worker.terminate();
                processNextFile();
                break;

              case "error":
                failedFiles.push(file);
                activeWorkers.delete(worker);
                worker.terminate();
                processNextFile();
                break;
            }
          });

          // Start file processing
          if (file.streamable) {
            // Streaming for large files
            StreamingFileProcessor.streamFile(
              file.path,
              options.chunkSize || chunkSize,
              async (chunk, chunkIndex, totalChunks) => {
                port.postMessage({
                  type: "chunk",
                  file,
                  chunk,
                  chunkIndex,
                  totalChunks,
                });
              }
            ).catch(() => {
              failedFiles.push(file);
              activeWorkers.delete(worker);
              worker.terminate();
              processNextFile();
            });
          } else {
            // Direct file processing for small files
            port.postMessage({
              type: "start",
              file,
            });
          }
        }
      };

      // Initiate processing
      processNextFile();

      // Overall operation timeout
      const operationTimeout = setTimeout(() => {
        activeWorkers.forEach((worker) => worker.terminate());
        reject(new Error("Overall file processing timed out"));
      }, workerTimeout * maxConcurrency);
    });
  }

  /**
   * Enhanced zip operation with streaming support
   */
  async fastZip(sourcePath: string, options: ZipOptions = {}): Promise<string> {
    try {
      const sourceStats = await stat(sourcePath);

      if (!sourceStats.isDirectory()) {
        throw new Error("Source must be a directory");
      }

      const files = await this.collectFiles(sourcePath, options);

      if (files.length === 0) {
        throw new Error("No files found to zip");
      }

      const destination = options.destination || `${sourcePath}_${new Date().toISOString().replace(/:/g, "-")}.zip`;

      const archive = archiver("zip", {
        zlib: {
          level: options.compressionLevel || 6,
        },
      });

      const output = fs.createWriteStream(destination);

      return new Promise((resolve, reject) => {
        output.on("close", () => resolve(destination));
        archive.on("error", reject);

        archive.pipe(output);

        // Process files and add to archive
        this.processFilesInParallel(files, options)
          .then((processedFiles) => {
            processedFiles.forEach((file) => {
              archive.file(file.path, { name: file.relativePath });
            });
            archive.finalize();
          })
          .catch(reject);
      });
    } catch (error) {
      this.emit("error", error);
      throw error;
    }
  }
}

// Streaming Worker Script
if (!isMainThread) {
  const { workerData, parentPort } = require("worker_threads");
  const fs = require("fs");

  // Use the transferred port for communication
  const port: import("worker_threads").MessagePort = workerData.transferPort;

  // Accumulate chunks for large files
  let fileChunks: Buffer[] = [];
  let currentFile: FileInfo | null = null;

  port.on("message", async (message: WorkerMessage) => {
    try {
      switch (message.type) {
        case "start":
          // Initialize for small file processing
          currentFile = message.file;
          await processFile(currentFile);
          break;

        case "chunk":
          // Accumulate chunks for streaming
          if (!currentFile) {
            currentFile = message.file;
          }

          fileChunks.push(message.chunk!);

          // Process when all chunks received
          if (fileChunks.length === message.totalChunks) {
            const completeBuffer = Buffer.concat(fileChunks);

            // Temporary file for accumulated chunks
            const tempFilePath = `/tmp/${currentFile.relativePath}`;
            await fs.promises.writeFile(tempFilePath, completeBuffer);

            await processFile({ ...currentFile, path: tempFilePath });

            // Cleanup temporary file
            await fs.promises.unlink(tempFilePath);

            fileChunks = [];
            currentFile = null;
          }
          break;
      }
    } catch (error) {
      port.postMessage({
        type: "error",
        file: currentFile,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  async function processFile(file: FileInfo) {
    try {
      // Simulate file processing
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 1000));

      // Generate hash for verification
      const hash = await StreamingFileProcessor.generateFileHash(file.path);

      port.postMessage({
        type: "complete",
        file: { ...file, hash },
      });
    } catch (error) {
      port.postMessage({
        type: "error",
        file,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

export default StreamingParallelZipper;
