/**
 * V23 Phase 6 — Workflow Intelligence (pure functions).
 *
 * STRICT INVARIANTS — read these BEFORE adding any feature:
 *   • This file MAY classify, group, or rank operational records
 *     based on TIMESTAMPS and PRE-COMPUTED string fields only.
 *   • This file MUST NOT compute, derive, or infer any monetary
 *     value. It does not call `parseFloat`, `Number()`, or any
 *     arithmetic on KD strings. The only KD interaction allowed
 *     here is forwarding the canonical pre-formatted string up to
 *     the UI as a label fragment.
 *   • This file MUST NOT make autonomous business decisions. The
 *     output is read-only "operator hints" — never a side-effect.
 *   • Pure / deterministic. Every function takes a `now` argument
 *     so unit tests do not depend on `Date.now()`.
 */

export type AgingBucket =
  | 'fresh' // < 7d
  | 'recent' // 7–29d
  | 'aging' // 30–59d
  | 'overdue' // 60–89d
  | 'critical'; // ≥ 90d

export interface AgingClassification {
  bucket: AgingBucket;
  daysOpen: number;
  /** Suggested operator action label (Arabic). Visibility-only. */
  hint: string;
  /** Tone token aligned with `SmartActionChip`'s tone palette. */
  tone: 'info' | 'recommend' | 'warn' | 'critical' | 'muted';
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days between `then` and `now`, floored to whole days, never negative. */
export function daysBetween(thenIso: string, now: Date | number): number {
  const t = Date.parse(thenIso);
  if (Number.isNaN(t)) return 0;
  const ref = typeof now === 'number' ? now : now.getTime();
  return Math.max(0, Math.floor((ref - t) / MS_PER_DAY));
}

/**
 * Classify an open invoice / debt row by its `openedAtIso` age.
 * Buckets follow the standard A/R aging schedule:
 *   < 7d  → fresh   (no action needed)
 *   <30d  → recent  (proactive contact suggested)
 *   <60d  → aging   (follow-up due)
 *   <90d  → overdue (escalation suggested)
 *   ≥90d  → critical (escalation required)
 */
export function classifyAging(input: {
  openedAtIso: string;
  now?: Date | number;
}): AgingClassification {
  const now = input.now ?? Date.now();
  const daysOpen = daysBetween(input.openedAtIso, now);

  if (daysOpen < 7) {
    return {
      bucket: 'fresh',
      daysOpen,
      hint: 'حديثة',
      tone: 'muted',
    };
  }
  if (daysOpen < 30) {
    return {
      bucket: 'recent',
      daysOpen,
      hint: `${daysOpen} يوم — تواصل وقائي`,
      tone: 'info',
    };
  }
  if (daysOpen < 60) {
    return {
      bucket: 'aging',
      daysOpen,
      hint: `${daysOpen} يوم — متابعة مطلوبة`,
      tone: 'warn',
    };
  }
  if (daysOpen < 90) {
    return {
      bucket: 'overdue',
      daysOpen,
      hint: `${daysOpen} يوم — تصعيد مقترح`,
      tone: 'warn',
    };
  }
  return {
    bucket: 'critical',
    daysOpen,
    hint: `${daysOpen} يوم — تصعيد مطلوب`,
    tone: 'critical',
  };
}

export type CallbackUrgency = 'overdue' | 'today' | 'soon' | 'later';

export interface CallbackUrgencyClassification {
  urgency: CallbackUrgency;
  hoursToDue: number;
  hint: string;
  tone: 'info' | 'recommend' | 'warn' | 'critical' | 'muted';
}

/**
 * Classify a scheduled callback by its `scheduledAtIso`. Pure
 * timestamp comparison — no business logic, no money math.
 */
export function classifyCallbackUrgency(input: {
  scheduledAtIso: string;
  now?: Date | number;
}): CallbackUrgencyClassification {
  const ref = typeof input.now === 'number' ? input.now : (input.now ?? new Date()).getTime();
  const target = Date.parse(input.scheduledAtIso);
  if (Number.isNaN(target)) {
    return {
      urgency: 'later',
      hoursToDue: 0,
      hint: 'موعد غير محدد',
      tone: 'muted',
    };
  }
  const diffMs = target - ref;
  const hoursToDue = Math.round(diffMs / (60 * 60 * 1000));

  if (diffMs < 0) {
    const hoursLate = Math.abs(hoursToDue);
    return {
      urgency: 'overdue',
      hoursToDue,
      hint:
        hoursLate < 24
          ? `متأخر ${hoursLate} ساعة`
          : `متأخر ${Math.round(hoursLate / 24)} يوم`,
      tone: 'critical',
    };
  }
  if (diffMs < 4 * 60 * 60 * 1000) {
    return {
      urgency: 'today',
      hoursToDue,
      hint: `يستحق خلال ${hoursToDue} ساعة`,
      tone: 'warn',
    };
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    return {
      urgency: 'soon',
      hoursToDue,
      hint: `يستحق اليوم (${hoursToDue} ساعة)`,
      tone: 'info',
    };
  }
  return {
    urgency: 'later',
    hoursToDue,
    hint: `بعد ${Math.round(hoursToDue / 24)} يوم`,
    tone: 'muted',
  };
}

export interface QueueHealthInput {
  total: number;
  /** Count of rows whose aging bucket is `critical`. */
  criticalCount: number;
  /** Count of rows whose aging bucket is `overdue`. */
  overdueCount: number;
}

export type QueueHealthLevel = 'healthy' | 'attention' | 'strained' | 'breached';

export interface QueueHealthClassification {
  level: QueueHealthLevel;
  /** Percent of queue in {overdue + critical}, in 0..100, integer. */
  pressurePct: number;
  hint: string;
  tone: 'info' | 'recommend' | 'warn' | 'critical' | 'muted';
}

/**
 * Classify the operational health of an entire queue. Used by
 * the collections cockpit header to render a single, glanceable
 * status badge — operators can drill in for the row-level details.
 */
export function classifyQueueHealth(input: QueueHealthInput): QueueHealthClassification {
  const total = Math.max(0, input.total | 0);
  const overdue = Math.max(0, input.overdueCount | 0);
  const critical = Math.max(0, input.criticalCount | 0);
  if (total === 0) {
    return {
      level: 'healthy',
      pressurePct: 0,
      hint: 'القائمة فارغة',
      tone: 'muted',
    };
  }
  const pressurePct = Math.min(100, Math.round(((overdue + critical) / total) * 100));
  if (critical > 0 && pressurePct >= 25) {
    return {
      level: 'breached',
      pressurePct,
      hint: `${critical} حالة حرجة من أصل ${total}`,
      tone: 'critical',
    };
  }
  if (pressurePct >= 50) {
    return {
      level: 'strained',
      pressurePct,
      hint: `${pressurePct}٪ من الطابور بحاجة تصعيد`,
      tone: 'warn',
    };
  }
  if (pressurePct >= 15) {
    return {
      level: 'attention',
      pressurePct,
      hint: `${pressurePct}٪ يحتاج متابعة`,
      tone: 'info',
    };
  }
  return {
    level: 'healthy',
    pressurePct,
    hint: 'الطابور تحت السيطرة',
    tone: 'recommend',
  };
}

/**
 * Group a list of records by their aging bucket. Stable ordering:
 * critical → overdue → aging → recent → fresh, then by original
 * input order within a bucket.
 */
export function groupByAgingBucket<T>(
  rows: ReadonlyArray<T>,
  getOpenedAt: (row: T) => string,
  opts?: { now?: Date | number },
): ReadonlyArray<{ bucket: AgingBucket; rows: T[] }> {
  const order: AgingBucket[] = ['critical', 'overdue', 'aging', 'recent', 'fresh'];
  const groups = new Map<AgingBucket, T[]>();
  order.forEach((b) => groups.set(b, []));
  for (const row of rows) {
    const c = classifyAging({ openedAtIso: getOpenedAt(row), now: opts?.now });
    groups.get(c.bucket)!.push(row);
  }
  return order
    .map((bucket) => ({ bucket, rows: groups.get(bucket)! }))
    .filter((g) => g.rows.length > 0);
}
