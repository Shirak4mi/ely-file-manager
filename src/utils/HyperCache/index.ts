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
 * Ultra-optimized fixed-size shared cache using probabilistic eviction
 * Specifically tuned for Bun.js performance characteristics
 */
class SharedPathCache {
  // Optimized cache structure for minimal GC impact
  private static readonly CACHE_SHARDS = 128; // Increased shard count for better distribution
  private static readonly SHARD_SIZE = 512; // Smaller shard size for faster operations
  private static readonly TTL_MS = 30000; // 30 seconds default TTL

  private shards: Array<Map<string, { p: string; e: number }>>;
  private stats: { h: number; m: number; e: number }; // Shortened property names
  private cleanupInterval: number;

  constructor() {
    // Pre-allocate shards
    this.shards = new Array(SharedPathCache.CACHE_SHARDS);
    for (let i = 0; i < SharedPathCache.CACHE_SHARDS; i++) {
      this.shards[i] = new Map();
    }

    this.stats = { h: 0, m: 0, e: 0 }; // hits, misses, evictions

    // Less frequent cleanup (15 seconds) to reduce overhead
    this.cleanupInterval = setInterval(() => this.cleanup(), 15000) as unknown as number;
  }

  /**
   * Ultra-fast shard selection using Bun's native hashing
   */
  private getShard(key: string): number {
    // Using Bun's native hash for maximum performance
    const hash = Bun.hash.wyhash(key);
    // Fast bitwise AND instead of modulo for power-of-2 shard count
    return Number(hash & BigInt(SharedPathCache.CACHE_SHARDS - 1));
  }

  /**
   * Gets a value from the cache with O(1) complexity
   */
  get(key: string): string | undefined {
    const shardIndex = this.getShard(key);
    const shard = this.shards[shardIndex];
    const entry = shard.get(key);

    if (!entry) {
      this.stats.m++;
      return undefined;
    }

    // Check expiration with short-circuit on current time
    const now = Date.now();
    if (now > entry.e) {
      shard.delete(key);
      this.stats.e++;
      return undefined;
    }

    this.stats.h++;
    return entry.p;
  }

  /**
   * Sets a value in the cache with fast eviction
   */
  set(key: string, path: string, ttlMs = SharedPathCache.TTL_MS): void {
    const shardIndex = this.getShard(key);
    const shard = this.shards[shardIndex];

    // Only evict if we've reached capacity
    if (shard.size >= SharedPathCache.SHARD_SIZE) {
      this.evictRandom(shard);
    }

    // Store entry with minimal property names to reduce memory
    shard.set(key, { p: path, e: Date.now() + ttlMs });
  }

  /**
   * Ultra-fast probabilistic eviction - much faster than LRU for high concurrency
   */
  private evictRandom(shard: Map<string, any>): void {
    // Fast path: if shard.size is small, just delete a random key
    if (shard.size <= 32) {
      // Get any key and delete it - much faster than sampling
      for (const key of shard.keys()) {
        shard.delete(key);
        this.stats.e++;
        return;
      }
    }

    // Sample just 4 random entries (reduced from 8 for speed)
    const entries = Array.from(shard.entries());
    let minExpire = Infinity;
    let keyToEvict: string | null = null;

    // Only sample 4 entries for ultra-fast eviction decision
    for (let i = 0; i < 4; i++) {
      const randomIndex = Math.floor(Math.random() * entries.length);
      const entry = entries[randomIndex];
      if (entry[1].e < minExpire) {
        minExpire = entry[1].e;
        keyToEvict = entry[0];
      }
    }

    if (keyToEvict) {
      shard.delete(keyToEvict);
      this.stats.e++;
    }
  }

  /**
   * Optimized cleanup to prevent memory leaks
   */
  private cleanup(): void {
    const now = Date.now();

    // Only scan 16 random shards per cycle for better distribution
    for (let i = 0; i < 16; i++) {
      const shardIndex = Math.floor(Math.random() * SharedPathCache.CACHE_SHARDS);
      const shard = this.shards[shardIndex];

      // Batch delete expired entries
      const keysToDelete: string[] = [];

      // First collect keys to delete
      for (const [key, entry] of shard.entries()) {
        if (now > entry.e) {
          keysToDelete.push(key);
        }
      }

      // Then delete them all at once
      for (const key of keysToDelete) {
        shard.delete(key);
        this.stats.e++;
      }
    }
  }

  /**
   * Dispose of cache resources
   */
  dispose(): void {
    clearInterval(this.cleanupInterval);
    for (const shard of this.shards) {
      shard.clear();
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
      hits: this.stats.h,
      misses: this.stats.m,
      evictions: this.stats.e,
      size: totalEntries,
      hitRate: (this.stats.h / (this.stats.h + this.stats.m || 1)) * 100 + "%",
      memoryEstimate: Math.round((totalEntries * 120) / 1024) + "KB", // Reduced estimate per entry
    };
  }
}

/**
 * Ultra-efficient thread pool using Bun.Worker with zero-copy message passing
 */
class FileWorkerPool {
  private workers: Worker[] = [];
  private workerStatus: Uint8Array; // 0 = free, 1-255 = busy with N tasks
  private taskQueue: Array<{
    path: string;
    resolve: (result: string) => void;
    reject: (error: Error) => void;
    priority: number;
  }> = [];

  private processing = false;
  private maxConcurrentTasksPerWorker: number;
  private workerTimeout: number;

  // Direct array for task tracking to avoid Map overhead
  private activeTasks: Array<{
    workerId: number;
    taskId: number;
    resolve: (result: string) => void;
    reject: (error: Error) => void;
    timeoutId?: any;
  } | null>;

  private nextTaskId = 0;

  constructor(
    options: {
      numWorkers?: number;
      maxConcurrentTasksPerWorker?: number;
      workerTimeout?: number;
      workerPath?: string;
    } = {}
  ) {
    // Optimized for Bun's concurrency model
    const numWorkers = options.numWorkers || Math.max(4, Math.min(cpus().length * 2, 16));
    this.maxConcurrentTasksPerWorker = options.maxConcurrentTasksPerWorker || 12; // Increased for Bun
    this.workerTimeout = options.workerTimeout || 5000;
    const workerPath = options.workerPath || new URL("./file-worker.ts", import.meta.url).toString();

    // Pre-allocate space for tracking tasks - use one large array instead of many small objects
    this.activeTasks = new Array(numWorkers * this.maxConcurrentTasksPerWorker);
    for (let i = 0; i < this.activeTasks.length; i++) {
      this.activeTasks[i] = null;
    }

    // Use typed array for worker status tracking (much faster)
    this.workerStatus = new Uint8Array(numWorkers);

    try {
      // Create workers
      for (let i = 0; i < numWorkers; i++) {
        const worker = new Worker(workerPath);

        // High-performance message handler
        worker.on("message", this.createWorkerMessageHandler(i));

        worker.on("error", (err) => {
          console.error(`Worker ${i} error:`, err);
          // Try to recreate the worker
          try {
            worker.terminate();
            const newWorker = new Worker(workerPath);
            newWorker.on("message", this.createWorkerMessageHandler(i));
            newWorker.on("error", worker.listeners("error")[0] as (...args: any[]) => void);
            this.workers[i] = newWorker;
          } catch (recreateErr) {
            console.error(`Failed to recreate worker ${i}:`, recreateErr);
          }
        });

        this.workers.push(worker);
      }
    } catch (err) {
      console.error("Error initializing worker pool:", err);
      throw new Error("Failed to initialize worker pool: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  // Create a worker message handler to avoid duplicating this function for each worker
  private createWorkerMessageHandler(workerId: number) {
    return (result: any) => {
      // Immediately decrement task count for this worker
      this.workerStatus[workerId]--;

      // Find active task by workerId and taskId
      const taskIndex = this.findTaskIndex(workerId, result.taskId);

      if (taskIndex === -1) return; // Task not found or already completed

      const task = this.activeTasks[taskIndex]!;

      // Clear timeout
      if (task.timeoutId) clearTimeout(task.timeoutId);

      // Resolve or reject the promise
      if (result.error) {
        task.reject(new Error(result.error));
      } else if (result.path) {
        task.resolve(result.path);
      }

      // Release the slot
      this.activeTasks[taskIndex] = null;

      // Process next items in queue - use queueMicrotask for better performance
      if (this.taskQueue.length > 0) {
        queueMicrotask(() => this.processQueue());
      }
    };
  }

  // Find task by workerId and taskId
  private findTaskIndex(workerId: number, taskId: number): number {
    for (let i = 0; i < this.activeTasks.length; i++) {
      const task = this.activeTasks[i];
      if (task && task.workerId === workerId && task.taskId === taskId) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Checks file existence and returns path if it exists
   */
  async checkPath(path: string, priority = 0): Promise<string> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ path, resolve, reject, priority });

      // Use queueMicrotask for better performance than setTimeout(0)
      if (!this.processing) {
        queueMicrotask(() => this.processQueue());
      }
    });
  }

  /**
   * Ultra-optimized queue processing for maximum throughput
   */
  private processQueue(): void {
    if (this.processing || this.taskQueue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Fast priority sort if needed
      if (this.taskQueue.length > 1 && this.taskQueue.some((t) => t.priority > 0)) {
        this.taskQueue.sort((a, b) => b.priority - a.priority);
      }

      // Find available workers using typed array - extremely fast
      const numWorkers = this.workers.length;

      let tasksAssigned = 0;
      for (let i = 0; i < numWorkers && this.taskQueue.length > 0; i++) {
        // Fast check if worker has capacity
        if (this.workerStatus[i] < this.maxConcurrentTasksPerWorker) {
          const availableSlots = this.maxConcurrentTasksPerWorker - this.workerStatus[i];

          // Assign as many tasks as possible to this worker
          for (let j = 0; j < availableSlots && this.taskQueue.length > 0; j++) {
            const task = this.taskQueue.shift()!;
            this.assignTaskToWorker(i, task);
            tasksAssigned++;
          }
        }
      }

      // If we couldn't assign any tasks but have tasks and workers, we need to wait
      if (tasksAssigned === 0 && this.taskQueue.length > 0) {
        // All workers are at capacity, we'll process more when a worker completes a task
      }
    } finally {
      this.processing = false;
    }
  }

  // Assign a task to a worker
  private assignTaskToWorker(
    workerId: number,
    task: {
      path: string;
      resolve: (result: string) => void;
      reject: (error: Error) => void;
      priority: number;
    }
  ): void {
    // Create a unique task ID
    const taskId = this.nextTaskId++;
    if (this.nextTaskId > 1000000) this.nextTaskId = 0;

    // Find empty slot
    let slotIndex = -1;
    for (let i = 0; i < this.activeTasks.length; i++) {
      if (this.activeTasks[i] === null) {
        slotIndex = i;
        break;
      }
    }

    // If no slots, expand the array (rare case)
    if (slotIndex === -1) {
      slotIndex = this.activeTasks.length;
      this.activeTasks.push(null);
    }

    // Set timeout
    const timeoutId = setTimeout(() => {
      const taskIndex = this.findTaskIndex(workerId, taskId);
      if (taskIndex !== -1) {
        const task = this.activeTasks[taskIndex]!;
        task.reject(new Error(`Worker task timed out after ${this.workerTimeout}ms`));
        this.activeTasks[taskIndex] = null;
        this.workerStatus[workerId]--;
      }
    }, this.workerTimeout);

    // Store task
    this.activeTasks[slotIndex] = {
      workerId,
      taskId,
      resolve: task.resolve,
      reject: task.reject,
      timeoutId,
    };

    // Increment worker task count
    this.workerStatus[workerId]++;

    // Send task to worker
    this.workers[workerId].postMessage({
      path: task.path,
      workerId,
      taskId,
    });
  }

  /**
   * Returns pool statistics
   */
  getStats() {
    const workerStats = [];
    for (let i = 0; i < this.workers.length; i++) {
      workerStats.push({
        id: i,
        taskCount: this.workerStatus[i],
      });
    }

    return {
      queueLength: this.taskQueue.length,
      activeTasksCount: this.activeTasks.filter((t) => t !== null).length,
      workers: workerStats,
    };
  }

  /**
   * Terminates all workers
   */
  terminate(): void {
    // Clear all timeouts
    for (const task of this.activeTasks) {
      if (task && task.timeoutId) {
        clearTimeout(task.timeoutId);
      }
    }

    for (const worker of this.workers) {
      try {
        worker.terminate();
      } catch (err) {
        // Silent handling
      }
    }

    this.workers = [];
    this.workerStatus = new Uint8Array(0);
    this.activeTasks = [];
    this.taskQueue = [];
  }
}

// Configuration interface
export interface HyperScalePathResolverConfig {
  basePath: string;
  cacheTTLMs: number;
  maxConcurrentChecks: number;
  unsafeAllowTraversal: boolean;
  logErrors: boolean;
  maxPendingRequests: number;
  workerPoolOptions?: {
    numWorkers?: number;
    maxConcurrentTasksPerWorker?: number;
    workerTimeout?: number;
    workerPath?: string;
  };
}

// Optimized default configuration
const DEFAULT_CONFIG: HyperScalePathResolverConfig = {
  basePath: "",
  cacheTTLMs: 30000,
  maxConcurrentChecks: 1500, // Increased for Bun
  unsafeAllowTraversal: false,
  logErrors: false,
  maxPendingRequests: 15000, // Increased to handle more load
  workerPoolOptions: {
    numWorkers: Math.max(4, Math.min(cpus().length * 2, 16)), // More workers for Bun
    maxConcurrentTasksPerWorker: 12, // More concurrent tasks
    workerTimeout: 5000,
  },
};

/**
 * Ensures a path ends with a trailing slash - optimized version
 */
function ensureTrailingSlash(path: string): string {
  if (!path) return "/";
  return path.endsWith("/") ? path : path + "/";
}

/**
 * Ultra-fast config validation - only validates critical parameters
 */
function validateCriticalConfig(config: Partial<HyperScalePathResolverConfig>): HyperScalePathResolverConfig {
  // Create config with defaults
  const mergedConfig = { ...DEFAULT_CONFIG };

  if (!config) return mergedConfig;

  // Apply string properties directly
  if (config.basePath !== undefined) {
    mergedConfig.basePath = ensureTrailingSlash(String(config.basePath));
  }

  // Apply boolean properties
  mergedConfig.unsafeAllowTraversal = config.unsafeAllowTraversal === true;
  mergedConfig.logErrors = config.logErrors === true;

  // Apply numeric properties with validation
  if (config.cacheTTLMs !== undefined) {
    const value = Number(config.cacheTTLMs);
    if (!isNaN(value) && value >= 0) mergedConfig.cacheTTLMs = value;
  }

  if (config.maxConcurrentChecks !== undefined) {
    const value = Number(config.maxConcurrentChecks);
    if (!isNaN(value) && value > 0) mergedConfig.maxConcurrentChecks = value;
  }

  if (config.maxPendingRequests !== undefined) {
    const value = Number(config.maxPendingRequests);
    if (!isNaN(value) && value > 0) mergedConfig.maxPendingRequests = value;
  }

  // Handle worker pool options
  if (config.workerPoolOptions) {
    mergedConfig.workerPoolOptions = { ...mergedConfig.workerPoolOptions };

    if (config.workerPoolOptions.numWorkers !== undefined) {
      const value = Number(config.workerPoolOptions.numWorkers);
      if (!isNaN(value) && value > 0) mergedConfig.workerPoolOptions.numWorkers = value;
    }

    if (config.workerPoolOptions.maxConcurrentTasksPerWorker !== undefined) {
      const value = Number(config.workerPoolOptions.maxConcurrentTasksPerWorker);
      if (!isNaN(value) && value > 0) mergedConfig.workerPoolOptions.maxConcurrentTasksPerWorker = value;
    }

    if (config.workerPoolOptions.workerTimeout !== undefined) {
      const value = Number(config.workerPoolOptions.workerTimeout);
      if (!isNaN(value) && value > 0) mergedConfig.workerPoolOptions.workerTimeout = value;
    }

    if (config.workerPoolOptions.workerPath !== undefined) {
      mergedConfig.workerPoolOptions.workerPath = String(config.workerPoolOptions.workerPath);
    }
  }

  return mergedConfig;
}

/**
 * HyperScale path resolver optimized for Bun.js with sub-5ms response times
 */
export default class HyperScalePathResolver {
  private static instance: HyperScalePathResolver;
  private cache: SharedPathCache;
  private workerPool: FileWorkerPool | null = null;
  public config: HyperScalePathResolverConfig;

  // Request throttling
  private activeRequests = 0;
  private pendingRequests: Array<{
    resolve: (value: string) => void;
    reject: (reason: any) => void;
    path: string;
    priority: number;
    timestamp: number;
  }> = [];
  private requestsRejectedDueToOverload = 0;
  private isShuttingDown = false;

  // Path normalization constants for fast replace
  private static readonly DOUBLE_SLASH_REGEX = /\/\//g;
  private static readonly DOT_DOT_REGEX = /\.\./g;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: Partial<HyperScalePathResolverConfig> = {}) {
    this.config = validateCriticalConfig(config);
    this.cache = new SharedPathCache();

    try {
      this.workerPool = new FileWorkerPool(this.config.workerPoolOptions);
    } catch (err) {
      if (this.config.logErrors) {
        console.error("Failed to initialize worker pool:", err);
        console.warn("Falling back to direct file checks");
      }
      this.workerPool = null;
    }
  }

  /** Get singleton instance */
  static getInstance(config?: Partial<HyperScalePathResolverConfig>): HyperScalePathResolver {
    if (!HyperScalePathResolver.instance) {
      HyperScalePathResolver.instance = new HyperScalePathResolver(config);
    } else if (config) {
      HyperScalePathResolver.instance.updateConfig(config);
    }
    return HyperScalePathResolver.instance;
  }

  /** Create a new instance */
  static createInstance(config?: Partial<HyperScalePathResolverConfig>): HyperScalePathResolver {
    return new HyperScalePathResolver(config);
  }

  /** Update configuration at runtime */
  updateConfig(config: Partial<HyperScalePathResolverConfig>): void {
    this.config = validateCriticalConfig({ ...this.config, ...config });
  }

  /** Ultra-fast path normalization */
  private normalizePath(path: string): string {
    if (!path) return "";

    // Fast path for common case
    if (!path.includes("..") && !path.includes("//") && !path.includes(" ")) {
      return path;
    }

    // Unsafe mode - allow traversal but clean
    if (this.config.unsafeAllowTraversal) {
      return path.replace(HyperScalePathResolver.DOUBLE_SLASH_REGEX, "/").trim();
    }

    // Safe mode - prevent traversal
    return path
      .replace(HyperScalePathResolver.DOT_DOT_REGEX, "")
      .replace(HyperScalePathResolver.DOUBLE_SLASH_REGEX, "/")
      .trim();
  }

  /**
   * Direct file check using Bun's native file API
   */
  private async directFileCheck(path: string): Promise<string> {
    try {
      const exists = await Bun.file(path).exists();
      if (exists) return path;
      throw new NotFoundException(`File does not exist: ${path}`);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw new FileAccessException(`Error accessing file: ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Resolves and validates a file path - optimized for sub-5ms performance
   */
  async getWorkingFilePath(path?: string, priority = 0): Promise<string> {
    // Fast check for shutdown state
    if (this.isShuttingDown) {
      throw new Error("System is shutting down");
    }

    // Fast validation for common error cases
    if (!path) {
      throw new NotFoundException("File path not provided");
    }

    // Ultra-fast path normalization
    const normalizedPath = this.normalizePath(path);

    // Check cache first (sub-microsecond lookup)
    const cachedPath = this.cache.get(normalizedPath);
    if (cachedPath) return cachedPath;

    // Apply throttling for high concurrency
    if (this.activeRequests >= this.config.maxConcurrentChecks) {
      // Memory safety: reject when queue is full
      if (this.pendingRequests.length >= this.config.maxPendingRequests) {
        this.requestsRejectedDueToOverload++;
        throw new Error(`System overloaded: Too many pending requests (${this.pendingRequests.length})`);
      }

      // Queue the request
      return new Promise((resolve, reject) => {
        this.pendingRequests.push({
          resolve,
          reject,
          path: normalizedPath,
          priority,
          timestamp: Date.now(),
        });
      });
    }

    // Process immediately
    return this.processPathRequest(normalizedPath, priority);
  }

  /** Processes a path request */
  private async processPathRequest(normalizedPath: string, priority = 0): Promise<string> {
    this.activeRequests++;

    try {
      // Shutdown check
      if (this.isShuttingDown) {
        throw new Error("System is shutting down");
      }

      // Build full path
      const fullPath = this.config.basePath + normalizedPath;

      // Check existence
      let resolvedPath: string;
      if (this.workerPool) {
        resolvedPath = await this.workerPool.checkPath(fullPath, priority);
      } else {
        resolvedPath = await this.directFileCheck(fullPath);
      }

      // Cache result
      this.cache.set(normalizedPath, resolvedPath, this.config.cacheTTLMs);

      return resolvedPath;
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw err;
      } else {
        throw new FileAccessException(`Error accessing file: ${normalizedPath}`);
      }
    } finally {
      this.activeRequests--;

      // Process next request
      if (!this.isShuttingDown && this.pendingRequests.length > 0) {
        // Only sort if needed
        if (this.pendingRequests.length > 1 && this.pendingRequests.some((r) => r.priority > 0)) {
          this.pendingRequests.sort((a, b) => {
            const priorityDiff = b.priority - a.priority;
            return priorityDiff !== 0 ? priorityDiff : a.timestamp - b.timestamp;
          });
        }

        const nextRequest = this.pendingRequests.shift()!;

        // Use queueMicrotask for better performance
        queueMicrotask(() => {
          this.processPathRequest(nextRequest.path, nextRequest.priority)
            .then(nextRequest.resolve)
            .catch(nextRequest.reject);
        });
      }
    }
  }

  /** Get resolver statistics */
  getStats() {
    return {
      cache: this.cache.getStats(),
      activeRequests: this.activeRequests,
      queuedRequests: this.pendingRequests.length,
      maxQueueCapacity: this.config.maxPendingRequests,
      queueUtilizationPercent: Math.round((this.pendingRequests.length / this.config.maxPendingRequests) * 100),
      requestsRejectedDueToOverload: this.requestsRejectedDueToOverload,
      oldestPendingRequestAgeMs:
        this.pendingRequests.length > 0 ? Date.now() - Math.min(...this.pendingRequests.map((r) => r.timestamp)) : 0,
      shutdownState: this.isShuttingDown,
      workerPool: this.workerPool?.getStats() || "No worker pool available",
    };
  }

  /** Clean shutdown */
  shutdown() {
    this.isShuttingDown = true;

    if (this.workerPool) {
      this.workerPool.terminate();
      this.workerPool = null;
    }

    this.cache.dispose();

    // Reject all pending requests
    for (const request of this.pendingRequests) {
      request.reject(new Error("System shutting down"));
    }
    this.pendingRequests = [];
  }
}
