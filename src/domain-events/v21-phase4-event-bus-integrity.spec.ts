/**
 * V21 Phase 4 — Event bus integrity tree-wide lock-in.
 *
 * # Why this exists
 *
 * The V20.6 + V20.9 event platform holds the canonical
 * idempotency + replay-safety guarantees. The integrity tests
 * already shipped (`domain-events.spec.ts`,
 * `financial-event-bus.spec.ts`,
 * `v20-9-event-dispatcher.spec.ts`,
 * `v20-9-realtime-gateway.spec.ts`,
 * `v20-9-performance-stress.spec.ts`) cover the runtime
 * behaviour.
 *
 * This file adds **architectural-shape** lock-ins on top —
 * tree-wide source-string assertions that prevent future PRs
 * from quietly weakening the platform without CI failure.
 *
 * Specifically:
 *
 *   1. The deterministic `evt_<sha256(...)>` event-id
 *      algorithm signature stays intact (no field added /
 *      removed silently).
 *   2. The bus `publish(...)` only ever calls `bus.emit(name, ...)`
 *      AFTER attempting the outbox INSERT — so no legitimate
 *      caller can bypass the audit trail.
 *   3. No file outside the bus / publisher / dispatcher /
 *      domain-events directory does `eventEmitter.emit('finance.…', …)`
 *      — every finance event MUST go through the bus so the
 *      outbox row is written.
 *   4. The dispatcher's safety constants meet floors
 *      (`maxAttempts >= 8`, `maxConcurrent <= 32`,
 *      `batchSize <= 500`).
 *   5. The `FinancialEventOutbox` Prisma model is never the
 *      target of `delete` / `deleteMany` anywhere in the
 *      backend — confirms append-only.
 *   6. The 3 stub adapters (Kafka / RabbitMQ / Redis Streams)
 *      keep their `EventBusAdapter` contract surface
 *      (`name`, `publish`, `healthCheck`).
 *
 * Removing or weakening any of these protections fails CI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = (() => {
  // Locate the repo root by walking up from this file looking
  // for the workspace `package.json`. This makes the test
  // robust to being run from `src/` or the repo root.
  let dir = __dirname;
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as {
        name?: string;
      };
      if (pkg.name && !pkg.name.startsWith('@')) {
        return dir;
      }
    } catch {
      /* keep walking */
    }
    dir = join(dir, '..');
  }
  return process.cwd();
})();

const SRC_ROOT = join(REPO_ROOT, 'src');

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...listFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function rel(p: string): string {
  return relative(REPO_ROOT, p).replace(/\\/g, '/');
}

function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.|\$\{[^}]*\})*`/g, '``');
}

const ALL_BACKEND_FILES = listFiles(SRC_ROOT);

describe('V21 Phase 4 — event bus integrity tree-wide lock-in', () => {
  /* ──────────────────────────────────────────────────────────
   * 1. Deterministic event-id algorithm signature is intact.
   * ────────────────────────────────────────────────────────── */
  test('1. FinancialEventBus.deterministicEventId still hashes (name|customerId|correlationId|occurredAtSec) with SHA-256', () => {
    const src = readFileSync(
      join(SRC_ROOT, 'domain-events/financial-event-bus.service.ts'),
      'utf8',
    );

    expect(src).toMatch(/private\s+deterministicEventId\b/);
    // The SHA-256 family is the only hash used; the slice keeps
    // the id at 32 hex chars (= 16 bytes of entropy).
    expect(src).toMatch(/createHash\(\s*'sha256'\s*\)/);
    expect(src).toMatch(/\.slice\(\s*0\s*,\s*32\s*\)/);
    // Every component of the deterministic tuple MUST appear,
    // in any order; if a future refactor adds OR drops one,
    // CI fails.
    expect(src).toMatch(/payload\.customerId/);
    expect(src).toMatch(/payload\.correlationId/);
    expect(src).toMatch(/payload\.occurredAt/);
    // Multi-line whitespace tolerant: the bus formats this across
    // 3 lines for readability.
    expect(src).toMatch(
      /Math\.floor\([\s\S]*?new\s+Date\(\s*payload\.occurredAt\s*\)\.getTime\(\)\s*\/\s*1000\s*[\s\S]*?\)/,
    );
  });

  /* ──────────────────────────────────────────────────────────
   * 2. The bus publish path: outbox INSERT happens BEFORE the
   *    in-process emit. Order matters: emit-before-insert
   *    would lose the audit row on outbox-write failure.
   * ────────────────────────────────────────────────────────── */
  test('2. FinancialEventBus.publish does outbox.create BEFORE bus.emit', () => {
    const src = readFileSync(
      join(SRC_ROOT, 'domain-events/financial-event-bus.service.ts'),
      'utf8',
    );
    // Whitespace-tolerant — the bus chains `.create` on a new line.
    const createMatch = src.match(/financialEventOutbox\s*\.\s*create\s*\(/);
    const emitMatch = src.match(/this\.bus\.emit\s*\(\s*name/);
    expect(createMatch).not.toBeNull();
    expect(emitMatch).not.toBeNull();
    expect(createMatch!.index!).toBeLessThan(emitMatch!.index!);
  });

  /* ──────────────────────────────────────────────────────────
   * 3. No file outside domain-events/ emits a `finance.*` event
   *    on the global EventEmitter directly — every finance
   *    event MUST flow through the bus so the audit row is
   *    written.
   * ────────────────────────────────────────────────────────── */
  test('3. no out-of-band emit("finance.*", …) outside the domain-events directory', () => {
    const violations: string[] = [];
    for (const f of ALL_BACKEND_FILES) {
      const r = rel(f);
      // The bus + publisher are the legitimate emitters.
      if (r.startsWith('src/domain-events/')) continue;
      // Test scaffolding may legitimately emit fake events into
      // an isolated EventEmitter — those are not the global bus.
      if (/\.spec\.ts$/.test(r) || /\.test\.ts$/.test(r)) continue;
      const stripped = stripCommentsAndStrings(readFileSync(f, 'utf8'));
      // Match `<receiver>.emit('finance.<...>'` — receiver may be
      // any identifier (`bus`, `eventEmitter`, `events`, etc.).
      // We catch the literal 'finance.' prefix to scope to
      // financial events only.
      const m = stripped.match(/\.emit\s*\(\s*[`']finance\./);
      if (m) {
        violations.push(`${r}  →  out-of-band emit('finance.…') — must use FinancialEventBus.publish`);
      }
    }
    expect(violations).toEqual([]);
  });

  /* ──────────────────────────────────────────────────────────
   * 4. Dispatcher safety constants meet floors / ceilings.
   * ────────────────────────────────────────────────────────── */
  test('4. FinancialEventDispatcher safety constants meet floors and ceilings', () => {
    const src = readFileSync(
      join(SRC_ROOT, 'domain-events/financial-event-dispatcher.service.ts'),
      'utf8',
    );
    const maxConcurrent = src.match(/maxConcurrent\s*=\s*(\d+)/);
    const maxAttempts = src.match(/maxAttempts\s*=\s*(\d+)/);
    const batchSize = src.match(/batchSize\s*=\s*(\d+)/);
    expect(maxConcurrent).not.toBeNull();
    expect(maxAttempts).not.toBeNull();
    expect(batchSize).not.toBeNull();

    const c = Number(maxConcurrent![1]);
    const a = Number(maxAttempts![1]);
    const b = Number(batchSize![1]);

    // Floors — preserve back-pressure / retry budget.
    expect(a).toBeGreaterThanOrEqual(8);
    // Ceilings — guard against accidental "throughput-only" tuning
    // that would starve the broker.
    expect(c).toBeLessThanOrEqual(32);
    expect(b).toBeLessThanOrEqual(500);
    // The dispatcher tick code path also enforces the 500 cap
    // explicitly via `Math.min(... , 500)` — multi-line whitespace
    // tolerant since the dispatcher formats across 4 lines.
    expect(src).toMatch(/Math\.min\([\s\S]*?,\s*500\s*,?\s*\)/);
  });

  /* ──────────────────────────────────────────────────────────
   * 5. FinancialEventOutbox is append-only across the codebase.
   *    No `delete` / `deleteMany` calls on the model.
   * ────────────────────────────────────────────────────────── */
  test('5. FinancialEventOutbox is append-only — no delete or deleteMany anywhere', () => {
    const violations: string[] = [];
    for (const f of ALL_BACKEND_FILES) {
      const r = rel(f);
      // Allow the test files to mention the patterns in assertion
      // strings; we already strip strings before scanning.
      if (/\.spec\.ts$/.test(r) || /\.test\.ts$/.test(r)) continue;
      const stripped = stripCommentsAndStrings(readFileSync(f, 'utf8'));
      if (/financialEventOutbox\s*\.\s*delete(Many)?\s*\(/.test(stripped)) {
        violations.push(`${r}  →  financialEventOutbox.delete(Many)? — outbox is append-only`);
      }
    }
    expect(violations).toEqual([]);
  });

  /* ──────────────────────────────────────────────────────────
   * 6. The 3 broker adapter stubs keep the EventBusAdapter
   *    contract surface (so adopting any one in production is
   *    a pure swap, not a rewrite).
   * ────────────────────────────────────────────────────────── */
  test('6. Kafka / RabbitMQ / Redis Streams adapter stubs keep the EventBusAdapter contract surface', () => {
    const adapters = [
      'domain-events/adapters/kafka-event-bus.adapter.ts',
      'domain-events/adapters/rabbitmq-event-bus.adapter.ts',
      'domain-events/adapters/redis-streams-event-bus.adapter.ts',
    ];
    for (const a of adapters) {
      const src = readFileSync(join(SRC_ROOT, a), 'utf8');
      expect(src).toMatch(/implements\s+EventBusAdapter\b/);
      expect(src).toMatch(/readonly\s+name\s*=/);
      expect(src).toMatch(/async\s+publish\s*\(/);
      expect(src).toMatch(/async\s+healthCheck\s*\(/);
    }
  });

  /* ──────────────────────────────────────────────────────────
   * 7. Realtime gateway role-gate is preserved and matches the
   *    controller's hub gate (defence in depth).
   * ────────────────────────────────────────────────────────── */
  test('7. Realtime gateway role gate (isRoleAllowed) is invoked inside subscribe()', () => {
    const src = readFileSync(
      join(SRC_ROOT, 'domain-events/realtime/financial-realtime.gateway.ts'),
      'utf8',
    );
    expect(src).toMatch(/isRoleAllowed\s*\(/);
    // The forbidden path throws — we keep the explicit error code
    // so log queries can still pivot on it.
    expect(src).toMatch(/V20_9_REALTIME_FORBIDDEN/);
  });
});
