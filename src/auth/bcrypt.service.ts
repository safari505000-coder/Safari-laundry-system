import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as os from 'node:os';
import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

type PendingJob = {
  resolve: (v: unknown) => void;
  reject: (err: Error) => void;
};

/**
 * Pool of `bcrypt` workers so password hashing/comparison never blocks the
 * main event loop and scales with CPU count (true parallelism, independent of
 * libuv's default 4-thread pool).
 *
 * `BCRYPT_WORKERS` env var overrides the pool size (defaults to half the CPU
 * count, min 2, max 8 — enough to saturate bcrypt without starving the rest
 * of the request pipeline).
 * `BCRYPT_ROUNDS` overrides the hash cost (default 10).
 */
@Injectable()
export class BcryptService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BcryptService.name);
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, PendingJob>();
  private nextId = 1;
  private rr = 0;

  /** Public cost parameter. Lowered from 12 → 10 for login throughput. */
  readonly rounds: number = this.resolveRounds();

  onModuleInit(): void {
    const size = this.resolvePoolSize();
    const workerFile = path.join(__dirname, 'bcrypt.worker.js');
    for (let i = 0; i < size; i++) {
      const w = new Worker(workerFile);
      w.on('message', (msg: { id: number; result?: unknown; error?: string }) => {
        const job = this.pending.get(msg.id);
        if (!job) return;
        this.pending.delete(msg.id);
        if (msg.error) job.reject(new Error(msg.error));
        else job.resolve(msg.result);
      });
      w.on('error', (err) => {
        this.logger.error(`bcrypt worker error: ${err.message}`);
      });
      w.on('exit', (code) => {
        if (code !== 0) {
          this.logger.warn(`bcrypt worker exited code=${code}`);
        }
      });
      this.workers.push(w);
    }
    this.logger.log(
      `bcrypt pool ready (workers=${size}, rounds=${this.rounds})`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    for (const [, job] of this.pending) {
      job.reject(new Error('bcrypt service shutting down'));
    }
    this.pending.clear();
    await Promise.all(this.workers.map((w) => w.terminate()));
  }

  async hash(password: string, rounds?: number): Promise<string> {
    return this.dispatch<string>('hash', {
      password,
      rounds: rounds ?? this.rounds,
    });
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return this.dispatch<boolean>('compare', { password, hash });
  }

  private dispatch<T>(
    action: 'hash' | 'compare',
    payload: Record<string, unknown>,
  ): Promise<T> {
    if (this.workers.length === 0) {
      return Promise.reject(new Error('bcrypt pool is empty'));
    }
    const id = this.nextId++;
    const worker = this.workers[this.rr++ % this.workers.length];
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      worker.postMessage({ id, action, payload });
    });
  }

  private resolvePoolSize(): number {
    const raw = Number.parseInt(process.env.BCRYPT_WORKERS ?? '', 10);
    if (Number.isFinite(raw) && raw === 0) return 0;
    if (Number.isFinite(raw) && raw > 0) return raw;
    const cpus = os.cpus()?.length ?? 4;
    // Leave 4 cores for the event loop, Prisma query engine, and the rest of
    // the request pipeline; use the rest for bcrypt.
    return Math.max(2, Math.min(cpus - 4, 16));
  }

  private resolveRounds(): number {
    const raw = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '', 10);
    if (Number.isFinite(raw) && raw >= 4 && raw <= 15) return raw;
    return 10;
  }
}
