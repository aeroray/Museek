import { createAsyncCache } from "@/lib/cache";

type QueueJob<T> = {
  key: string;
  run: () => Promise<T>;
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export interface LocalEnrichmentQueueOptions {
  concurrency: number;
  minIntervalMs: number;
  cacheTtlMs: number;
  cacheSize?: number;
}

export class LocalEnrichmentQueue<T> {
  private readonly concurrency: number;
  private readonly minIntervalMs: number;
  private readonly cache: ReturnType<typeof createAsyncCache<T>>;
  private readonly pending: QueueJob<T>[] = [];
  private readonly inFlight = new Map<string, Promise<T>>();
  private active = 0;
  private nextStartAt = 0;
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: LocalEnrichmentQueueOptions) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency));
    this.minIntervalMs = Math.max(0, Math.floor(options.minIntervalMs));
    this.cache = createAsyncCache<T>(
      Math.max(0, options.cacheTtlMs),
      options.cacheSize ?? 120,
    );
  }

  enqueue(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    let resolvePromise!: (value: T | PromiseLike<T>) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const job: QueueJob<T> = {
      key,
      run,
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
    };
    this.inFlight.set(key, promise);
    this.pending.push(job);
    this.drain();
    return promise;
  }

  private scheduleDrain(delayMs: number): void {
    if (this.drainTimer !== null) return;
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.drain();
    }, delayMs);
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const waitMs = this.nextStartAt - Date.now();
      if (waitMs > 0) {
        this.scheduleDrain(waitMs);
        return;
      }

      const job = this.pending.shift();
      if (!job) return;
      this.active += 1;
      this.nextStartAt = Date.now() + this.minIntervalMs;
      void this.cache(job.key, job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active -= 1;
          if (this.inFlight.get(job.key) === job.promise) {
            this.inFlight.delete(job.key);
          }
          this.drain();
        });
    }
  }
}
