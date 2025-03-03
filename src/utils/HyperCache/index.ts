import { Worker } from "worker_threads";
import { cpus } from "os";

// Exception classes
export class NotFoundException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundException";
  }
}

export class FileAccessException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileAccessException";
  }
}

/**
 * Fixed-size shared cache using probabilistic eviction
 * Optimized for Bun.js performance characteristics
 */
class SharedPathCache {
  // Using a fixed array instead of Map for predictable memory usage
  private static readonly CACHE_SHARDS = 64; // Power of 2 for fast modulo
  private static readonly SHARD_SIZE = 1024; // Fixed size per shard
  private static readonly TTL_MS = 30000; // 30 seconds default TTL

  private shards: Array<Map<string, { path: string; expires: number }>>;
  private stats: { hits: number; misses: number; evictions: number };

  constructor() {
    // Initialize shards
    this.shards = Array(SharedPathCache.CACHE_SHARDS)
      .fill(null)
      .map(() => new Map());

    this.stats = { hits: 0, misses: 0, evictions: 0 };

    // Periodic cleanup to prevent memory leaks (run every 10 seconds)
    setInterval(() => this.cleanup(), 10000);
  }

  /**
   * Using Bun's native high-performance hashing
   */
  private getShard(key: string): number {
    // Use Bun's native fast hashing (wyhash algorithm)
    const hash = Bun.hash.wyhash(key);
    return Number(hash % BigInt(SharedPathCache.CACHE_SHARDS));
  }

  /**
   * Gets a value from the cache with O(1) complexity
   */
  get(key: string): string | undefined {
    const shardIndex = this.getShard(key);
    const shard = this.shards[shardIndex];
    const entry = shard.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expires) {
      shard.delete(key);
      this.stats.evictions++;
      return undefined;
    }

    this.stats.hits++;
    return entry.path;
  }

  /**
   * Sets a value in the cache with automatic eviction
   */
  set(key: string, path: string, ttlMs = SharedPathCache.TTL_MS): void {
    const shardIndex = this.getShard(key);
    const shard = this.shards[shardIndex];

    // If shard is full, evict random entries (probabilistic approach)
    if (shard.size >= SharedPathCache.SHARD_SIZE) {
      this.evictRandom(shard);
    }

    // Calculate expiration time
    const expires = Date.now() + ttlMs;

    // Store entry
    shard.set(key, { path, expires });
  }

  /**
   * Probabilistic eviction - much faster than LRU for high concurrency
   */
  private evictRandom(shard: Map<string, any>): void {
    // Choose 8 random entries and remove the one closest to expiration
    const entries = Array.from(shard.entries());
    let toEvict: [string, { path: string; expires: number }] | null = null;

    // Sample 8 random entries instead of sorting the entire collection
    for (let i = 0; i < 8; i++) {
      const randomIndex = Math.floor(Math.random() * entries.length);
      const entry = entries[randomIndex];

      if (!toEvict || entry[1].expires < toEvict[1].expires) {
        toEvict = entry;
      }
    }

    if (toEvict) {
      shard.delete(toEvict[0]);
      this.stats.evictions++;
    }
  }

  /**
   * Cleans up expired entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();

    // Only scan a subset of shards each time to distribute the workload
    const shardsToScan = 8; // Scan 8 shards per cleanup cycle
    const startShard = Math.floor(Math.random() * SharedPathCache.CACHE_SHARDS);

    for (let i = 0; i < shardsToScan; i++) {
      const shardIndex = (startShard + i) % SharedPathCache.CACHE_SHARDS;
      const shard = this.shards[shardIndex];

      // Scan for expired entries
      for (const [key, entry] of shard.entries()) {
        if (now > entry.expires) {
          shard.delete(key);
          this.stats.evictions++;
        }
      }
    }
  }

  /**
   * Returns cache statistics
   */
  getStats() {
    // Calculate total entries
    let totalEntries = 0;
    for (const shard of this.shards) {
      totalEntries += shard.size;
    }

    return {
      ...this.stats,
      size: totalEntries,
      hitRate: (this.stats.hits / (this.stats.hits + this.stats.misses || 1)) * 100 + "%",
      memoryEstimate: Math.round((totalEntries * 150) / 1024) + "KB", // ~150 bytes per entry
    };
  }
}

/**
 * Improved thread pool using Bun.Worker for distributing file system operations
 */
class FileWorkerPool {
  private workers: Worker[] = [];
  private queue: Array<{
    path: string;
    resolve: (result: string) => void;
    reject: (error: Error) => void;
    priority: number;
  }> = [];
  private workerStatus: Array<{
    busy: boolean;
    taskCount: number;
  }> = [];
  private processing = false;
  private maxConcurrentTasksPerWorker: number;

  constructor(
    options: {
      numWorkers?: number;
      maxConcurrentTasksPerWorker?: number;
    } = {}
  ) {
    // Bun benefits from higher worker concurrency
    const numWorkers = options.numWorkers || Math.max(2, Math.min(cpus().length, 12));
    this.maxConcurrentTasksPerWorker = options.maxConcurrentTasksPerWorker || 8;

    // Create workers using proper Worker API
    for (let i = 0; i < numWorkers; i++) {
      // Create worker from file instead of string script
      const worker = new Worker(new URL("./file-worker.ts", import.meta.url));

      // Set up message handler with the proper Node.js worker_threads API
      worker.on("message", (result) => {
        // Mark worker as potentially available
        const workerStatus = this.workerStatus[result.workerId];
        workerStatus.taskCount--;

        if (workerStatus.taskCount === 0) {
          workerStatus.busy = false;
        }

        // Find the task in the active tasks
        if (result.error) {
          // Find the right promise to reject
          this.activeTasks.forEach((task, index) => {
            if (task && task.workerId === result.workerId && task.taskId === result.taskId) {
              task.reject(new Error(result.error));
              this.activeTasks[index] = null; // Clear the slot
            }
          });
        } else if (result.path) {
          // Find the right promise to resolve
          this.activeTasks.forEach((task, index) => {
            if (task && task.workerId === result.workerId && task.taskId === result.taskId) {
              task.resolve(result.path);
              this.activeTasks[index] = null; // Clear the slot
            }
          });
        }

        // Process next items in queue
        this.processQueue();
      });

      this.workers.push(worker);
      this.workerStatus.push({ busy: false, taskCount: 0 });
    }
  }

  // Slots for active tasks
  private activeTasks: Array<{
    workerId: number;
    taskId: number;
    resolve: (result: string) => void;
    reject: (error: Error) => void;
  } | null> = Array(1000).fill(null);
  private nextTaskId = 0;

  /**
   * Checks file existence and returns path if it exists
   */
  async checkPath(path: string, priority = 0): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ path, resolve, reject, priority });
      this.processQueue();
    });
  }

  /**
   * Processes the queue of file operations with improved concurrency
   * Optimized for Bun's performance characteristics
   */
  private processQueue(): void {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Sort queue by priority if needed (higher priority first)
      if (this.queue.length > 1) {
        this.queue.sort((a, b) => b.priority - a.priority);
      }

      // Process as many items as we can
      const availableWorkers = this.workerStatus
        .map((status, index) => ({ index, status }))
        .filter((w) => !w.status.busy || w.status.taskCount < this.maxConcurrentTasksPerWorker);

      // Process up to the number of available workers
      for (let i = 0; i < availableWorkers.length && this.queue.length > 0; i++) {
        const workerId = availableWorkers[i].index;
        const workerStatus = this.workerStatus[workerId];

        // Get next task
        const task = this.queue.shift()!;

        // Assign a task ID
        const taskId = this.nextTaskId++;
        if (this.nextTaskId > 1000000) this.nextTaskId = 0; // Prevent overflow

        // Find an empty slot for this task
        let slotIndex = -1;
        for (let j = 0; j < this.activeTasks.length; j++) {
          if (this.activeTasks[j] === null) {
            slotIndex = j;
            break;
          }
        }

        // If no slot is available, expand the array
        if (slotIndex === -1) {
          slotIndex = this.activeTasks.length;
          this.activeTasks.push(null);
        }

        // Store task in active tasks
        this.activeTasks[slotIndex] = {
          workerId,
          taskId,
          resolve: task.resolve,
          reject: task.reject,
        };

        // Update worker status
        workerStatus.taskCount++;
        if (workerStatus.taskCount >= this.maxConcurrentTasksPerWorker) {
          workerStatus.busy = true;
        }

        // Send task to worker - Bun.Worker uses postMessage
        this.workers[workerId].postMessage({
          path: task.path,
          workerId,
          taskId,
        });
      }
    } finally {
      this.processing = false;

      // Check if there are more items to process
      if (
        this.queue.length > 0 &&
        this.workerStatus.some((s) => !s.busy || s.taskCount < this.maxConcurrentTasksPerWorker)
      ) {
        // Use setTimeout(0) for Bun (equivalent to setImmediate in Node)
        setTimeout(() => this.processQueue(), 0);
      }
    }
  }

  /**
   * Returns pool statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      activeTasksCount: this.activeTasks.filter((t) => t !== null).length,
      workers: this.workerStatus.map((s, i) => ({
        id: i,
        busy: s.busy,
        taskCount: s.taskCount,
      })),
    };
  }

  /**
   * Terminates all workers
   */
  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
  }
}

// Configuration options
export interface HyperScalePathResolverConfig {
  basePath: string;
  cacheTTLMs: number;
  maxConcurrentChecks: number;
  unsafeAllowTraversal: boolean;
  logErrors: boolean;
  workerPoolOptions?: {
    numWorkers?: number;
    maxConcurrentTasksPerWorker?: number;
  };
}

/**
 * HyperScale path resolver optimized for Bun.js and extreme concurrency
 */
export default class HyperScalePathResolver {
  private static instance: HyperScalePathResolver;
  private cache: SharedPathCache;
  private workerPool: FileWorkerPool | null = null;
  private config: HyperScalePathResolverConfig;
  // Request throttling
  private activeRequests = 0;
  private pendingRequests: Array<{
    resolve: (value: string) => void;
    reject: (reason: any) => void;
    path: string;
    priority?: number;
  }> = [];

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: Partial<HyperScalePathResolverConfig> = {}) {
    // Default configuration optimized for Bun performance
    this.config = {
      basePath: "",
      cacheTTLMs: 30000, // 30 seconds
      maxConcurrentChecks: 1000, // Higher limit for Bun's more efficient async handling
      unsafeAllowTraversal: false,
      logErrors: false, // Disabled by default for high-volume scenarios
      workerPoolOptions: {
        numWorkers: Math.max(2, Math.min(cpus().length, 12)), // Bun benefits from more workers
        maxConcurrentTasksPerWorker: 8, // Higher concurrency per worker for Bun
      },
      ...config,
    };

    // Initialize shared cache
    this.cache = new SharedPathCache();

    // Create worker pool (no need to check isMainThread in Bun)
    this.workerPool = new FileWorkerPool(this.config.workerPoolOptions);
  }

  /** Get singleton instance (for sharing cache across all requests) */
  static getInstance(config?: Partial<HyperScalePathResolverConfig>): HyperScalePathResolver {
    if (!HyperScalePathResolver.instance) {
      HyperScalePathResolver.instance = new HyperScalePathResolver(config);
    }
    return HyperScalePathResolver.instance;
  }

  /** Ultra-fast path normalization optimized for high throughput */
  private normalizePath(path: string): string {
    if (!path) return "";

    // Fast path for common case - using includes instead of regex for better performance
    if (!path.includes("..") && !path.includes("//") && !path.includes(" ")) {
      return path;
    }

    // Unsafe mode - allow directory traversal but still clean the path
    if (this.config.unsafeAllowTraversal) {
      return path.replace(/\/\//g, "/").trim();
    }

    // Safe mode - prevent directory traversal
    return path.replace(/\.\./g, "").replace(/\/\//g, "/").trim();
  }

  /**
   * Direct file check using Bun's native file API
   * Used as a fallback when worker pool is not available
   */
  private async directFileCheck(path: string): Promise<string> {
    // Use Bun's ultra-fast file API
    const exists = await Bun.file(path).exists();

    if (exists) {
      return path;
    }

    throw new NotFoundException(`File does not exist: ${path}`);
  }

  /**
   * Resolves and validates a file path
   * Optimized for extremely high concurrency
   */
  async getWorkingFilePath(path?: string, priority = 0): Promise<string> {
    // Validate input with fast return for invalid cases
    if (!path) {
      const error = new NotFoundException("File path not provided");
      if (this.config.logErrors) console.error(error);
      throw error;
    }

    // Fast path normalization
    const normalizedPath = this.normalizePath(path);

    // Check cache first (ultra fast)
    const cachedPath = this.cache.get(normalizedPath);
    if (cachedPath) {
      return cachedPath;
    }

    // Apply throttling for high concurrency
    if (this.activeRequests >= this.config.maxConcurrentChecks) {
      // Queue the request instead of processing immediately
      return new Promise((resolve, reject) => {
        this.pendingRequests.push({ resolve, reject, path: normalizedPath, priority });
      });
    }

    // Process the request
    return this.processPathRequest(normalizedPath, priority);
  }

  /** Processes a file path request with throttling */
  private async processPathRequest(normalizedPath: string, priority = 0): Promise<string> {
    this.activeRequests++;

    try {
      // Build the file path
      const fullPath = this.config.basePath + normalizedPath;

      // Check file existence (via worker pool if available)
      let resolvedPath: string;

      if (this.workerPool) {
        // Use worker pool for non-blocking I/O, passing priority
        resolvedPath = await this.workerPool.checkPath(fullPath, priority);
      } else {
        // Direct check using Bun's file API
        resolvedPath = await this.directFileCheck(fullPath);
      }

      // Cache the result
      this.cache.set(normalizedPath, resolvedPath, this.config.cacheTTLMs);

      return resolvedPath;
    } catch (err) {
      console.log(err);

      if (err instanceof NotFoundException) {
        if (this.config.logErrors) {
          console.error(`File not found: ${normalizedPath}`);
        }
        throw err;
      } else {
        if (this.config.logErrors) {
          console.error(`File access error: ${normalizedPath}`, err);
        }
        throw new FileAccessException(`Error accessing file: ${normalizedPath}`);
      }
    } finally {
      this.activeRequests--;

      // Process next pending request if any
      if (this.pendingRequests.length > 0) {
        // Sort pending requests by priority before processing next
        if (this.pendingRequests.length > 1) {
          this.pendingRequests.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        }

        const nextRequest = this.pendingRequests.shift()!;
        this.processPathRequest(nextRequest.path, nextRequest.priority).then(nextRequest.resolve).catch(nextRequest.reject);
      }
    }
  }

  /** Get resolver statistics */
  getStats() {
    return {
      cache: this.cache.getStats(),
      activeRequests: this.activeRequests,
      queuedRequests: this.pendingRequests.length,
      workerPool: this.workerPool?.getStats() || "No worker pool available",
    };
  }
}
