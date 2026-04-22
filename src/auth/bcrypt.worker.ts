/**
 * bcrypt worker — runs hashing/comparison off the main event loop.
 *
 * Spawned by `BcryptService` via `new Worker(require.resolve('./bcrypt.worker'))`.
 * The main thread sends `{ id, action, payload }` messages; the worker replies
 * with `{ id, result }` or `{ id, error }`.
 *
 * We only use `bcrypt`'s async methods here — they internally already use the
 * libuv thread pool, but by running inside a dedicated worker we guarantee the
 * main event loop is never blocked and we get true parallelism across CPU
 * cores regardless of UV_THREADPOOL_SIZE.
 */
import { parentPort } from 'node:worker_threads';
import * as bcrypt from 'bcrypt';

type HashMsg = {
  id: number;
  action: 'hash';
  payload: { password: string; rounds: number };
};
type CompareMsg = {
  id: number;
  action: 'compare';
  payload: { password: string; hash: string };
};
type WorkerMsg = HashMsg | CompareMsg;

if (!parentPort) {
  throw new Error('bcrypt.worker must be run as a worker_threads entry');
}

parentPort.on('message', (msg: WorkerMsg) => {
  const reply = (payload: { id: number; result?: unknown; error?: string }) =>
    parentPort!.postMessage(payload);

  const run = async (): Promise<unknown> => {
    switch (msg.action) {
      case 'hash':
        return bcrypt.hash(msg.payload.password, msg.payload.rounds);
      case 'compare':
        return bcrypt.compare(msg.payload.password, msg.payload.hash);
      default:
        throw new Error(`unknown bcrypt worker action`);
    }
  };

  run()
    .then((result) => reply({ id: msg.id, result }))
    .catch((err: unknown) =>
      reply({
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
});
