/**
 * V21 — Phase 6: Operational Observability Platform.
 *
 * Pure-function banking-anomaly detectors. Each detector is a
 * synchronous projection over already-hydrated rows; the calling
 * service is responsible for the database query. This split keeps
 * detectors side-effect-free, deterministic, unit-testable, and
 * safe to call from any context (cron, request, health probe).
 *
 * Outputs are structured `AnomalyReport`s with `severity`,
 * `count`, `samples`, and a `health` classification suitable for
 * Prometheus exposition + alerter routing.
 *
 * Detectors implemented:
 *
 *   1. detectDuplicateSourceRefs   — duplicate sourceRefs in journal
 *   2. detectOrphanWalletEvents    — outbox events without journal
 *   3. detectStaleSnapshots        — snapshot age vs SLA threshold
 *   4. detectDuplicateSettlements  — duplicate settlement entries
 *      keyed on (orderId, attemptedAt)
 *   5. detectReplayAnomaly         — input/output snapshot hash mismatch
 *
 * Each detector returns a green/amber/red classification.
 */

/**
 * مستوى خطورة تقرير الشذوذ المصرفي
 * Severity classification for a banking anomaly detector report.
 */
export type Severity = 'green' | 'amber' | 'red';

/**
 * تقرير شذوذ مصرفي يصف عدد الحالات ومستوى الخطورة والعينات
 * Banking anomaly detector report with count, health classification, and sample anomalies.
 */
export interface AnomalyReport<T = unknown> {
  /** ISO timestamp at detection time. */
  at: string;
  /** Detector identifier; matches the function name. */
  detector: string;
  /** Number of anomalies surfaced in the inspected window. */
  count: number;
  /** Health classification for Prometheus / Alertmanager. */
  health: Severity;
  /** Up to 10 sample anomalies for operator triage. */
  samples: T[];
  /** Human-readable explanation of the health classification. */
  reason: string;
}

const SAMPLE_LIMIT = 10;

function classify(
  count: number,
  thresholds: { amber: number; red: number },
): Severity {
  if (count >= thresholds.red) return 'red';
  if (count >= thresholds.amber) return 'amber';
  return 'green';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Detector 1 — duplicate sourceRefs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * صف قيد دفتر اليومية المُستخدم في فحص المراجع المكررة
 * Minimal JournalEntry projection needed by the duplicate-sourceRef detector.
 */
export interface JournalEntryRowForDuplicateScan {
  sourceRef: string;
  source: string;
  createdAt: Date;
}

/**
 * عينة مرجع مصدر مكرر في تقرير كاشف الشذوذات
 * Sample of a duplicate sourceRef found by the detector.
 */
export interface DuplicateSourceRefSample {
  sourceRef: string;
  source: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * يفحص شرائح دفتر اليومية بحثاً عن مراجع مصدر مكررة — مستحيل قاعدياً لذا يُنبّه فوراً
 * Walks a recent slice of JournalEntry rows and surfaces any sourceRef appearing more than once.
 * Because sourceRef is @unique in the schema, any duplicate is a database-level impossibility
 * indicating schema drift, corrupted backup, or manual SQL injection. Always RED.
 *
 * @param input.rows - صفوف دفتر اليومية المُراد فحصها | Journal entry rows to scan
 * @param input.at - وقت أخذ العينة (اختياري) | Optional ISO timestamp
 * @returns تقرير الشذوذ مع العينات | Anomaly report with samples
 */
export function detectDuplicateSourceRefs(input: {
  rows: ReadonlyArray<JournalEntryRowForDuplicateScan>;
  at?: string;
}): AnomalyReport<DuplicateSourceRefSample> {
  const at = input.at ?? new Date().toISOString();
  const buckets = new Map<string, JournalEntryRowForDuplicateScan[]>();
  for (const r of input.rows) {
    const list = buckets.get(r.sourceRef);
    if (list) list.push(r);
    else buckets.set(r.sourceRef, [r]);
  }
  const samples: DuplicateSourceRefSample[] = [];
  for (const [ref, list] of buckets) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    samples.push({
      sourceRef: ref,
      source: list[0].source,
      occurrences: list.length,
      firstSeen: list[0].createdAt.toISOString(),
      lastSeen: list[list.length - 1].createdAt.toISOString(),
    });
    if (samples.length >= SAMPLE_LIMIT) break;
  }
  const count = samples.length;
  return {
    at,
    detector: 'detectDuplicateSourceRefs',
    count,
    samples,
    health: count > 0 ? 'red' : 'green',
    reason:
      count > 0
        ? `${count} duplicate sourceRef bucket(s) detected — sourceRef is @unique, this should be impossible`
        : 'no duplicate sourceRefs in window',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Detector 2 — orphan outbox events (event without canonical journal entry)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * صف حدث Outbox المُستخدم في فحص الأحداث اليتيمة
 * Minimal outbox event projection needed by the orphan-wallet-event detector.
 */
export interface OutboxEventForOrphanScan {
  id: string;
  eventType: string;
  sourceRef: string | null;
  emittedAt: Date;
}

/**
 * عينة حدث يتيم لا يقابله قيد في دفتر اليومية
 * Sample of an orphan outbox event with no matching journal entry.
 */
export interface OrphanEventSample {
  outboxId: string;
  eventType: string;
  sourceRef: string | null;
  emittedAt: string;
}

/**
 * يكتشف أحداث Outbox التي لا يقابلها قيد في دفتر اليومية (أحداث يتيمة)
 * Detects FinancialEventOutbox events whose sourceRef has no matching JournalEntry.
 * An orphan event means the event was emitted outside the canonical appendBalanced transaction.
 * >0 = amber, >5 = red.
 *
 * @param input.outbox - صفوف Outbox المُراد فحصها | Outbox event rows to scan
 * @param input.journalSourceRefs - مجموعة مراجع دفتر اليومية في نفس النافذة | Journal sourceRef set
 * @param input.at - وقت أخذ العينة (اختياري) | Optional ISO timestamp
 * @param input.thresholds - حدود تصنيف الخطورة | Optional custom severity thresholds
 * @returns تقرير الشذوذ مع العينات | Anomaly report with orphan samples
 */
export function detectOrphanWalletEvents(input: {
  outbox: ReadonlyArray<OutboxEventForOrphanScan>;
  /** Set of all `sourceRef`s present in the journal slice covering
   * the same window as `outbox`. */
  journalSourceRefs: ReadonlySet<string>;
  at?: string;
  thresholds?: { amber: number; red: number };
}): AnomalyReport<OrphanEventSample> {
  const at = input.at ?? new Date().toISOString();
  const thresholds = input.thresholds ?? { amber: 1, red: 5 };
  const samples: OrphanEventSample[] = [];
  for (const ev of input.outbox) {
    if (!ev.sourceRef) continue; // events without sourceRef cannot be matched — skip
    if (!input.journalSourceRefs.has(ev.sourceRef)) {
      samples.push({
        outboxId: ev.id,
        eventType: ev.eventType,
        sourceRef: ev.sourceRef,
        emittedAt: ev.emittedAt.toISOString(),
      });
      if (samples.length >= SAMPLE_LIMIT) break;
    }
  }
  let count = 0;
  for (const ev of input.outbox) {
    if (!ev.sourceRef) continue;
    if (!input.journalSourceRefs.has(ev.sourceRef)) count += 1;
  }
  return {
    at,
    detector: 'detectOrphanWalletEvents',
    count,
    samples,
    health: classify(count, thresholds),
    reason:
      count > 0
        ? `${count} orphan outbox event(s) without a matching journal sourceRef`
        : 'all outbox events match a journal entry',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Detector 3 — stale snapshots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * صف لقطة مالية مُستخدَم في فحص اللقطات القديمة
 * Minimal snapshot projection needed by the stale-snapshot detector.
 */
export interface SnapshotRowForStaleScan {
  customerId: string;
  generatedAt: Date;
}

/**
 * يكتشف اللقطات المالية التي تجاوزت عمرها المسموح (SLA)
 * Surfaces snapshots whose age exceeds the SLA threshold (default 1 hour).
 * A snapshot older than 1 hour indicates the cron is not running or a customer was deleted mid-projection.
 *
 * @param input.rows - صفوف اللقطات المُراد فحصها | Snapshot rows to scan
 * @param input.at - وقت أخذ العينة (اختياري) | Optional ISO timestamp
 * @param input.maxAgeSec - الحد الأقصى لعمر اللقطة بالثواني (افتراضي: 3600) | Max age in seconds
 * @param input.thresholds - حدود تصنيف الخطورة | Optional severity thresholds
 * @returns تقرير الشذوذ مع العينات | Anomaly report
 */
export function detectStaleSnapshots(input: {
  rows: ReadonlyArray<SnapshotRowForStaleScan>;
  /** ISO timestamp at sample time. */
  at?: string;
  /** Maximum acceptable snapshot age in seconds. */
  maxAgeSec?: number;
  thresholds?: { amber: number; red: number };
}): AnomalyReport<{ customerId: string; ageSec: number }> {
  const atIso = input.at ?? new Date().toISOString();
  const atMs = new Date(atIso).getTime();
  const maxAgeSec = input.maxAgeSec ?? 3600;
  const thresholds = input.thresholds ?? { amber: 5, red: 25 };
  const samples: Array<{ customerId: string; ageSec: number }> = [];
  let count = 0;
  for (const r of input.rows) {
    const ageSec = Math.floor((atMs - r.generatedAt.getTime()) / 1000);
    if (ageSec > maxAgeSec) {
      count += 1;
      if (samples.length < SAMPLE_LIMIT) {
        samples.push({ customerId: r.customerId, ageSec });
      }
    }
  }
  return {
    at: atIso,
    detector: 'detectStaleSnapshots',
    count,
    samples,
    health: classify(count, thresholds),
    reason:
      count > 0
        ? `${count} snapshot(s) older than ${maxAgeSec}s SLA`
        : 'all snapshots refreshed within SLA',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Detector 4 — duplicate settlements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * صف تسوية مُستخدَم في فحص التسويات المكررة
 * Minimal settlement row projection for the duplicate-settlement detector.
 */
export interface SettlementRowForDupScan {
  orderId: string;
  amountKd: string;
  settledAt: Date;
}

/**
 * يكتشف تسويتين للطلب نفسه ضمن نافذة زمنية قصيرة — دليل على سباق مزدوج
 * Detects two settlement rows for the same orderId within a 60-second window.
 * This is the smoking-gun for a double-claim race. Should be impossible given atomic updateMany.
 *
 * @param input.rows - صفوف التسوية المُراد فحصها | Settlement rows to scan
 * @param input.at - وقت أخذ العينة (اختياري) | Optional ISO timestamp
 * @param input.windowSec - النافذة الزمنية للكشف بالثواني (افتراضي: 60) | Detection window in seconds
 * @param input.thresholds - حدود تصنيف الخطورة | Optional severity thresholds
 * @returns تقرير الشذوذ مع العينات | Anomaly report
 */
export function detectDuplicateSettlements(input: {
  rows: ReadonlyArray<SettlementRowForDupScan>;
  at?: string;
  /** Time window in seconds within which two settlement rows on
   *  the same order are considered a duplicate. Default 60s. */
  windowSec?: number;
  thresholds?: { amber: number; red: number };
}): AnomalyReport<{
  orderId: string;
  occurrences: number;
  firstAt: string;
  lastAt: string;
  amounts: string[];
}> {
  const at = input.at ?? new Date().toISOString();
  const windowMs = (input.windowSec ?? 60) * 1000;
  const thresholds = input.thresholds ?? { amber: 1, red: 5 };
  const buckets = new Map<string, SettlementRowForDupScan[]>();
  for (const r of input.rows) {
    const list = buckets.get(r.orderId);
    if (list) list.push(r);
    else buckets.set(r.orderId, [r]);
  }
  const samples: Array<{
    orderId: string;
    occurrences: number;
    firstAt: string;
    lastAt: string;
    amounts: string[];
  }> = [];
  let count = 0;
  for (const [orderId, list] of buckets) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.settledAt.getTime() - b.settledAt.getTime());
    const dupesInWindow = list.filter(
      (_r, i) =>
        i > 0 &&
        list[i].settledAt.getTime() - list[i - 1].settledAt.getTime() <
          windowMs,
    );
    if (dupesInWindow.length === 0) continue;
    count += 1;
    if (samples.length < SAMPLE_LIMIT) {
      samples.push({
        orderId,
        occurrences: list.length,
        firstAt: list[0].settledAt.toISOString(),
        lastAt: list[list.length - 1].settledAt.toISOString(),
        amounts: list.map((r) => r.amountKd),
      });
    }
  }
  return {
    at,
    detector: 'detectDuplicateSettlements',
    count,
    samples,
    health: classify(count, thresholds),
    reason:
      count > 0
        ? `${count} order(s) settled twice within ${input.windowSec ?? 60}s window`
        : 'no duplicate settlements detected',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Detector 5 — replay anomaly (canonical hash mismatch)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * عينة اختبار إعادة التشغيل مع الهاش المتوقع والفعلي
 * Sample of a snapshot replay mismatch (expectedHash vs actualHash).
 */
export interface ReplayCheckSample {
  customerId: string;
  expectedHash: string;
  actualHash: string;
}

/**
 * يكتشف عدم تطابق هاش إعادة التشغيل بين اللقطات المتوقعة والفعلية
 * Surfaces snapshot replay mismatches from pre-computed hash triples.
 * Any mismatch is an immediate RED signal: the snapshot is not deterministically reproducible.
 *
 * @param input.triples - ثلاثيات الهاش المُسبَق الحساب | Pre-computed hash triples
 * @param input.at - وقت أخذ العينة (اختياري) | Optional ISO timestamp
 * @returns تقرير الشذوذ مع عينات التطابق الفاشل | Anomaly report with mismatch samples
 */
export function detectReplayAnomaly(input: {
  triples: ReadonlyArray<{
    customerId: string;
    expectedHash: string;
    actualHash: string;
  }>;
  at?: string;
}): AnomalyReport<ReplayCheckSample> {
  const at = input.at ?? new Date().toISOString();
  const samples: ReplayCheckSample[] = [];
  let count = 0;
  for (const t of input.triples) {
    if (t.expectedHash !== t.actualHash) {
      count += 1;
      if (samples.length < SAMPLE_LIMIT) {
        samples.push(t);
      }
    }
  }
  return {
    at,
    detector: 'detectReplayAnomaly',
    count,
    samples,
    health: count > 0 ? 'red' : 'green',
    reason:
      count > 0
        ? `${count} customer(s) failed deterministic snapshot replay — investigate journal corruption`
        : 'all replays match — journal is deterministic',
  };
}
