/**
 * V22 Phase 5 — Realtime adoption lock-in.
 *
 * # Why this exists
 *
 * V21 Phase 4 added the canonical-purity invariants
 * (`v21-phase4-realtime-purity.test.ts`):
 *   • No raw `EventSource` outside the approved hook.
 *   • No `payload.*Kd` reads from envelopes.
 *   • No `setQueryData` on `finance:*` keys outside the cache.
 *
 * V22 Phase 5 adds the *adoption* side of the contract:
 *   • The canonical realtime hook MUST be wired into the live
 *     operational surfaces this phase ships against.
 *   • Each surface MUST pass an `onEvent` that triggers a
 *     canonical refetch (NOT a payload-derived state update).
 *
 * The two test groups together prove:
 *   (purity) realtime payloads cannot taint canonical state
 *   (adoption) operational surfaces actually subscribe to the
 *              channels they claim to display
 *
 * Removing the wire-up in any surface OR introducing a payload
 * read fails CI.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = process.cwd().endsWith('web')
  ? process.cwd()
  : join(process.cwd(), 'web');

const ADOPTION_TARGETS: ReadonlyArray<{
  file: string;
  channel: string;
  refetchFns: ReadonlyArray<string>;
}> = [
  {
    file: 'src/modules/call-center/dashboard/pages/cc-customer-360-page.tsx',
    channel: 'customer360',
    refetchFns: ['customer360.reload'],
  },
  {
    file: 'src/modules/call-center/dashboard/pages/cc-customer-360-v2-page.tsx',
    channel: 'customer360',
    refetchFns: ['customer360.reload', 'dispatches.reload'],
  },
  {
    file: 'src/modules/call-center/dashboard/pages/cc-dashboard-page.tsx',
    channel: 'dashboards',
    refetchFns: ['outstanding.refresh', 'summary.refresh'],
  },
  {
    file: 'src/modules/call-center/pages/collections-page.tsx',
    channel: 'collections',
    refetchFns: ['load', 'loadSummary'],
  },
];

describe('V22 Phase 5 — Realtime adoption lock-in', () => {
  test('every adoption target imports useRealtimeFinancialFeed', () => {
    const failures: string[] = [];
    for (const target of ADOPTION_TARGETS) {
      const src = readFileSync(join(WEB_ROOT, target.file), 'utf8');
      if (!src.includes('useRealtimeFinancialFeed')) {
        failures.push(`${target.file} → missing useRealtimeFinancialFeed import`);
      }
    }
    expect(failures).toEqual([]);
  });

  test('every adoption target subscribes to its declared channel', () => {
    const failures: string[] = [];
    for (const target of ADOPTION_TARGETS) {
      const src = readFileSync(join(WEB_ROOT, target.file), 'utf8');
      const channelRx = new RegExp(`channel:\\s*['"\`]${target.channel}['"\`]`);
      if (!channelRx.test(src)) {
        failures.push(
          `${target.file} → does not subscribe to channel '${target.channel}'`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  test('every adoption target wires onEvent → canonical refetch', () => {
    const failures: string[] = [];
    for (const target of ADOPTION_TARGETS) {
      const src = readFileSync(join(WEB_ROOT, target.file), 'utf8');
      // We want the part of the file that contains the actual
      // hook *call* (not the import line). The hook call always
      // has `useRealtimeFinancialFeed({` immediately followed by
      // an options object — slice from there to the next 800
      // characters and look for the wire-up.
      const callIdx = src.indexOf('useRealtimeFinancialFeed({');
      if (callIdx < 0) {
        failures.push(`${target.file} → no useRealtimeFinancialFeed({ call found`);
        continue;
      }
      const callBlock = src.slice(callIdx, callIdx + 1200);
      if (!callBlock.includes('onEvent')) {
        failures.push(`${target.file} → no onEvent in hook call`);
        continue;
      }
      const wired = target.refetchFns.some((fn) => callBlock.includes(fn));
      if (!wired) {
        failures.push(
          `${target.file} → onEvent does not call any of: ${target.refetchFns.join(', ')}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  test('every adoption target passes accessToken from useAuth', () => {
    const failures: string[] = [];
    for (const target of ADOPTION_TARGETS) {
      const src = readFileSync(join(WEB_ROOT, target.file), 'utf8');
      // Either inline `accessToken: token` (most concise) or any
      // identifier ending in `token`/`Token` is acceptable.
      if (!/accessToken:\s*[a-zA-Z_$][\w$]*/.test(src)) {
        failures.push(`${target.file} → missing accessToken in hook options`);
      }
    }
    expect(failures).toEqual([]);
  });

  test('no adoption target reads payload.*Kd from the realtime envelope', () => {
    // This test is an explicit V22 echo of the V21 Phase 4 purity
    // invariant. We re-assert it here so a future PR cannot ship
    // adoption + payload reading in the same change without two
    // separate alarms.
    const violations: string[] = [];
    for (const target of ADOPTION_TARGETS) {
      const src = readFileSync(join(WEB_ROOT, target.file), 'utf8');
      // Match `payload.<word>Kd` or `envelope.payload.<word>Kd`
      // anywhere in the file.
      const rx = /(?:envelope\.)?payload\.[a-zA-Z_$][\w$]*Kd\b/;
      const m = rx.exec(src);
      if (m) {
        violations.push(`${target.file} → reads ${m[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

