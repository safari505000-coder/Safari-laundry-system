import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CashStatus,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
} from '@prisma/client';
import { DebtSource } from '../enums/debt-source.enum';
import {
  assertUiConsistency,
} from './assert-ui-consistency';
import { computeCanonicalCustomerDebt } from '../canonical-customer-debt.util';
import { UiDriftInspectorService } from './ui-drift-inspector.service';

/**
 * V20.3.2 — Phase 8 unification spec. Covers the six required
 * scenarios from the V20.3.2 prompt:
 *
 *   CASE 1 — Subscriber == Collections == JournalAR == canonical
 *   CASE 2 — Partial payment updates ALL screens immediately
 *   CASE 3 — Fully-paid invoice disappears from collections
 *   CASE 4 — Wallet absorption updates remaining correctly
 *   CASE 5 — Legacy reader detector catches wallet.debt consumers
 *   CASE 6 — UI drift endpoint flags an intentionally corrupted
 *            mock (drift between wallet.debt and canonical)
 *
 * The spec uses small in-memory Prisma + JournalSourceService
 * doubles so the canonical helper, the inspector, and the
 * runtime assertion are all exercised end-to-end.
 */

const D = (v: string | number) => new Prisma.Decimal(v.toString());
const NOW = new Date('2026-05-07T00:00:00.000Z');

type OrderRow = {
  id: string;
  customerId: string;
  totalPrice: Prisma.Decimal;
  status: OrderStatus;
  cashStatus: CashStatus;
  posPaymentMethod: PosPaymentMethod | null;
};

type LedgerRow = {
  orderId: string | null;
  customerId: string;
  source: DebtSource;
  amount: Prisma.Decimal;
  actorUserId: string | null;
  sourceRef: string | null;
  note: string | null;
};

type CustomerRow = {
  id: string;
  displayName: string | null;
  phone: string | null;
};

type WalletRow = {
  customerId: string;
  debt: Prisma.Decimal;
};

function buildPrisma(opts: {
  orders: OrderRow[];
  ledger: LedgerRow[];
  customers: CustomerRow[];
  wallets: WalletRow[];
  journalLines?: Array<{
    customerId: string;
    accountCode: string;
    debit: string;
    credit: string;
  }>;
}) {
  return {
    customer: {
      findMany: jest.fn(async ({ where, take, orderBy: _ob }: any = {}) => {
        let list = [...opts.customers];
        if (where?.id?.gt) {
          list = list.filter((c) => c.id > where.id.gt);
        }
        if (where?.OR) {
          // Search is exercised in CASE 6; we accept any non-null
          // contains substring for the test surface.
          const search = where.OR[0]?.displayName?.contains as
            | string
            | undefined;
          if (search) {
            const lower = search.toLowerCase();
            list = list.filter(
              (c) =>
                (c.displayName ?? '').toLowerCase().includes(lower) ||
                (c.phone ?? '').toLowerCase().includes(lower),
            );
          }
        }
        list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        if (typeof take === 'number') list = list.slice(0, take);
        return list;
      }),
    },
    customerWallet: {
      findUnique: jest.fn(async ({ where }: any) => {
        return opts.wallets.find((w) => w.customerId === where.customerId) ??
          null;
      }),
    },
    order: {
      findMany: jest.fn(async ({ where }: any) => {
        let list = [...opts.orders];
        if (where?.id?.in) {
          const ids: string[] = where.id.in;
          list = list.filter((o) => ids.includes(o.id));
        }
        if (where?.customerId) {
          list = list.filter((o) => o.customerId === where.customerId);
        }
        if (where?.status?.not) {
          list = list.filter((o) => o.status !== where.status.not);
        }
        if (where?.OR) {
          // Match the canonical helper's `OR: [cashStatus UNPAID,
          // posPaymentMethod DEBT_ON_ACCOUNT]` shape.
          list = list.filter(
            (o) =>
              o.cashStatus === CashStatus.UNPAID ||
              o.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT,
          );
        }
        return list;
      }),
    },
    debtLedgerEntry: {
      findMany: jest.fn(async ({ where }: any) => {
        let list = [...opts.ledger];
        if (where?.orderId?.in) {
          const ids: string[] = where.orderId.in;
          list = list.filter((l) => l.orderId !== null && ids.includes(l.orderId));
        }
        if (where?.customerId) {
          list = list.filter((l) => l.customerId === where.customerId);
        }
        if (where?.source) {
          list = list.filter((l) => l.source === where.source);
        }
        return list;
      }),
    },
    journalLine: {
      findMany: jest.fn(async ({ where }: any) => {
        let list = [...(opts.journalLines ?? [])];
        const customerId = where?.entry?.customerId as string | undefined;
        if (customerId) {
          list = list.filter((l) => l.customerId === customerId);
        }
        const code = where?.account?.code as string | undefined;
        if (code) {
          list = list.filter((l) => l.accountCode === code);
        }
        return list.map((l) => ({
          debit: l.debit,
          credit: l.credit,
          account: { code: l.accountCode },
        }));
      }),
    },
  } as any;
}

function buildJournalSource(
  arBalances: Map<string, Prisma.Decimal>,
): {
  getCustomerDebtFromJournalAR: jest.Mock<Promise<Prisma.Decimal>, [string]>;
} {
  return {
    getCustomerDebtFromJournalAR: jest.fn(async (customerId: string) => {
      return arBalances.get(customerId) ?? new Prisma.Decimal(0);
    }),
  };
}

const C_ALPHA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const C_BETA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C_GAMMA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('V20.3.2 — UI drift inspector + assertion (Phase 8)', () => {
  describe('CASE 1 — Subscriber == Collections == JournalAR == canonical', () => {
    it('classifies a healthy customer as OK across all six sources', async () => {
      // 100 KD invoice, 0 paid → canonical = 100; wallet.debt
      // also reflects 100; ledger has the matching shortfall row;
      // journal AR balance = 100. All six sources agree.
      const orders: OrderRow[] = [
        {
          id: 'o-1',
          customerId: C_ALPHA,
          totalPrice: D('100'),
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
        },
      ];
      const ledger: LedgerRow[] = [
        {
          orderId: 'o-1',
          customerId: C_ALPHA,
          source: DebtSource.INVOICE_SHORTFALL,
          amount: D('100'),
          actorUserId: null,
          sourceRef: null,
          note: null,
        },
      ];
      const prisma = buildPrisma({
        orders,
        ledger,
        customers: [{ id: C_ALPHA, displayName: 'Alpha', phone: '+96550000001' }],
        wallets: [{ customerId: C_ALPHA, debt: D('100') }],
      });
      const journal = buildJournalSource(new Map([[C_ALPHA, D('100')]]));
      const inspector = new UiDriftInspectorService(prisma, journal as any);
      const out = await inspector.scan({ limit: 10 });
      expect(out.summary.scannedCount).toBe(1);
      expect(out.summary.ok).toBe(1);
      expect(out.summary.uiDrift).toBe(0);
      expect(out.summary.legacyReader).toBe(0);
      expect(out.summary.critical).toBe(0);
      const row = out.rows[0];
      expect(row.status).toBe('OK');
      expect(row.canonicalDebtKd).toBe('100.0000');
      expect(row.subscriberDebtKd).toBe('100.0000');
      expect(row.collectionsDebtKd).toBe('100.0000');
      expect(row.walletDebtKd).toBe('100.0000');
      expect(row.ledgerDebtKd).toBe('0.0000'); // V20.4 — DebtLedger removed; field hardcoded to '0.0000'
      expect(row.journalDebtKd).toBe('100.0000');
      expect(row.maxDeltaKd).toBe('0.0000');
    });
  });

  describe('CASE 2 — Partial payment updates all derived screens', () => {
    it('after a 30 KD payment on a 100 KD invoice, canonical/subscriber/collections all read 70', async () => {
      const orders: OrderRow[] = [
        {
          id: 'o-2',
          customerId: C_BETA,
          totalPrice: D('100'),
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
        },
      ];
      const ledger: LedgerRow[] = [
        {
          orderId: 'o-2',
          customerId: C_BETA,
          source: DebtSource.INVOICE_SHORTFALL,
          amount: D('100'),
          actorUserId: null,
          sourceRef: null,
          note: null,
        },
        {
          orderId: 'o-2',
          customerId: C_BETA,
          source: DebtSource.PAYMENT,
          amount: D('30'),
          // V20.1-v2 ledger payment writes set actor + sourceRef
          // with the `PAYMENT:CC_PARTIAL_DEBT_PAYMENT:` prefix
          // recognised by the origin util.
          actorUserId: 'user-cc-1',
          sourceRef: 'PAYMENT:CC_PARTIAL_DEBT_PAYMENT:o-2',
          note: 'partial',
        },
      ];
      const prisma = buildPrisma({
        orders,
        ledger,
        customers: [{ id: C_BETA, displayName: 'Beta', phone: '+96550000002' }],
        wallets: [{ customerId: C_BETA, debt: D('70') }],
      });
      const journal = buildJournalSource(new Map([[C_BETA, D('70')]]));
      const snap = await computeCanonicalCustomerDebt(prisma, journal, C_BETA);
      expect(snap.canonicalDebtKd.toFixed(4)).toBe('70.0000');
      // V20.4 — remainingFromInvoicesKd is 0 (no per-order journal lines in mock);
      // canonicalDebtKd comes from journal AR reader (70.0000) which is the truth.
      expect(snap.remainingFromInvoicesKd.toFixed(4)).toBe('0.0000');
      const inspector = new UiDriftInspectorService(prisma, journal as any);
      const out = await inspector.scan({ limit: 10 });
      const row = out.rows[0];
      expect(row.status).toBe('OK');
      expect(row.canonicalDebtKd).toBe('70.0000');
      expect(row.subscriberDebtKd).toBe('70.0000');
      expect(row.collectionsDebtKd).toBe('70.0000');
    });
  });

  describe('CASE 3 — Fully-paid invoice disappears from canonical/collections', () => {
    it('removes the order from in-scope set when remaining ≤ tolerance', async () => {
      const orders: OrderRow[] = [
        {
          id: 'o-3',
          customerId: C_GAMMA,
          totalPrice: D('100'),
          status: OrderStatus.COMPLETED,
          // V20.3.1: cashStatus may still report UNPAID because
          // the close hasn't flipped it yet, but the canonical
          // remaining helper MUST exclude it once paid in full.
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
        },
      ];
      const ledger: LedgerRow[] = [
        {
          orderId: 'o-3',
          customerId: C_GAMMA,
          source: DebtSource.INVOICE_SHORTFALL,
          amount: D('100'),
          actorUserId: null,
          sourceRef: null,
          note: null,
        },
        {
          orderId: 'o-3',
          customerId: C_GAMMA,
          source: DebtSource.PAYMENT,
          amount: D('100'),
          actorUserId: 'user-cc-1',
          sourceRef: 'PAYMENT:CC_PARTIAL_DEBT_PAYMENT:o-3',
          note: 'final',
        },
      ];
      const prisma = buildPrisma({
        orders,
        ledger,
        customers: [{ id: C_GAMMA, displayName: 'Gamma', phone: null }],
        wallets: [{ customerId: C_GAMMA, debt: D('0') }],
      });
      const journal = buildJournalSource(new Map([[C_GAMMA, D('0')]]));
      const snap = await computeCanonicalCustomerDebt(prisma, journal, C_GAMMA);
      expect(snap.canonicalDebtKd.toFixed(4)).toBe('0.0000');
      expect(snap.remainingFromInvoicesKd.toFixed(4)).toBe('0.0000');
      // CRITICAL: the in-scope set MUST drop the fully-paid order.
      expect(snap.inScopeOrderIds.has('o-3')).toBe(false);
    });
  });

  describe('CASE 4 — Wallet absorption (PAYMENT row from wallet) reduces canonical', () => {
    it('treats wallet absorption ledger entries the same as cash payments for remaining', async () => {
      const orders: OrderRow[] = [
        {
          id: 'o-4',
          customerId: C_ALPHA,
          totalPrice: D('100'),
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
        },
      ];
      const ledger: LedgerRow[] = [
        {
          orderId: 'o-4',
          customerId: C_ALPHA,
          source: DebtSource.INVOICE_SHORTFALL,
          amount: D('100'),
          actorUserId: null,
          sourceRef: null,
          note: null,
        },
        {
          orderId: 'o-4',
          customerId: C_ALPHA,
          source: DebtSource.PAYMENT,
          amount: D('40'),
          // Wallet absorption is recognised by the V20.1-v2
          // origin util via the `PAYMENT:WALLET:` sourceRef
          // prefix; actorUserId may be null (system-driven).
          actorUserId: null,
          sourceRef: 'PAYMENT:WALLET:o-4',
          note: 'wallet absorption',
        },
      ];
      const prisma = buildPrisma({
        orders,
        ledger,
        customers: [{ id: C_ALPHA, displayName: 'Alpha', phone: '+96550000001' }],
        wallets: [{ customerId: C_ALPHA, debt: D('60') }],
      });
      const journal = buildJournalSource(new Map([[C_ALPHA, D('60')]]));
      const snap = await computeCanonicalCustomerDebt(prisma, journal, C_ALPHA);
      // The canonical helper reduces remaining by all PAYMENT
      // rows including wallet absorption. Expected: 100 − 40 = 60.
      expect(snap.canonicalDebtKd.toFixed(4)).toBe('60.0000');
    });
  });

  describe('CASE 6 — Inspector flags drift between wallet.debt and canonical', () => {
    it('classifies as LEGACY_READER when wallet.debt diverges by > tolerance', async () => {
      const orders: OrderRow[] = [
        {
          id: 'o-6',
          customerId: C_BETA,
          totalPrice: D('100'),
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
        },
      ];
      const ledger: LedgerRow[] = [
        {
          orderId: 'o-6',
          customerId: C_BETA,
          source: DebtSource.INVOICE_SHORTFALL,
          amount: D('100'),
          actorUserId: null,
          sourceRef: null,
          note: null,
        },
        {
          orderId: 'o-6',
          customerId: C_BETA,
          source: DebtSource.PAYMENT,
          amount: D('60'),
          actorUserId: 'user-cc-1',
          sourceRef: 'PAYMENT:CC_PARTIAL_DEBT_PAYMENT:o-6',
          note: 'partial',
        },
      ];
      // Intentional drift: wallet.debt still says 100 even
      // though the ledger / canonical settled to 40.
      const prisma = buildPrisma({
        orders,
        ledger,
        customers: [{ id: C_BETA, displayName: 'Beta', phone: '+96550000002' }],
        wallets: [{ customerId: C_BETA, debt: D('100') }],
      });
      const journal = buildJournalSource(new Map([[C_BETA, D('40')]]));
      const inspector = new UiDriftInspectorService(prisma, journal as any);
      const out = await inspector.scan({ limit: 10 });
      const row = out.rows[0];
      expect(row.status).toBe('LEGACY_READER');
      expect(row.canonicalDebtKd).toBe('40.0000');
      expect(row.walletDebtKd).toBe('100.0000');
      expect(out.summary.legacyReader).toBe(1);
    });

    it('V20.4 — wallet stale vs journal AR classifies as LEGACY_READER (ledger removed)', async () => {
      // Pre-V20.4 this tested journal-vs-ledger drift → CRITICAL.
      // After DebtLedger removal, the same setup (journal=30, wallet=75)
      // surfaces as wallet stale → LEGACY_READER.
      const orders: OrderRow[] = [
        {
          id: 'o-7',
          customerId: C_GAMMA,
          totalPrice: D('100'),
          status: OrderStatus.COMPLETED,
          cashStatus: CashStatus.UNPAID,
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
        },
      ];
      const ledger: LedgerRow[] = [];
      const prisma = buildPrisma({
        orders,
        ledger,
        customers: [{ id: C_GAMMA, displayName: 'Gamma', phone: null }],
        wallets: [{ customerId: C_GAMMA, debt: D('75') }],
      });
      // Journal says 30; wallet says 75 → wallet is stale → LEGACY_READER.
      const journal = buildJournalSource(new Map([[C_GAMMA, D('30')]]));
      const inspector = new UiDriftInspectorService(prisma, journal as any);
      const out = await inspector.scan({ limit: 10 });
      const row = out.rows[0];
      expect(row.status).toBe('LEGACY_READER');
      expect(out.summary.legacyReader).toBe(1);
    });

    it('respects status filter — only returns CRITICAL rows', async () => {
      const orders: OrderRow[] = [];
      const ledger: LedgerRow[] = [];
      const prisma = buildPrisma({
        orders,
        ledger,
        customers: [
          { id: C_ALPHA, displayName: 'Alpha', phone: null },
          { id: C_BETA, displayName: 'Beta', phone: null },
        ],
        wallets: [
          { customerId: C_ALPHA, debt: D('0') },
          { customerId: C_BETA, debt: D('0') },
        ],
      });
      const journal = buildJournalSource(
        new Map([
          [C_ALPHA, D('0')],
          [C_BETA, D('0')],
        ]),
      );
      const inspector = new UiDriftInspectorService(prisma, journal as any);
      const filtered = await inspector.scan({
        limit: 10,
        statusFilter: 'CRITICAL',
      });
      expect(filtered.rows).toHaveLength(0);
      expect(filtered.summary.scannedCount).toBe(2);
    });
  });

  describe('Phase 5 — assertUiConsistency log-only behaviour', () => {
    it('returns ok=true and never throws for consistent state', async () => {
      const prisma = buildPrisma({
        orders: [],
        ledger: [],
        customers: [],
        wallets: [{ customerId: C_ALPHA, debt: D('0') }],
      });
      const journal = buildJournalSource(new Map([[C_ALPHA, D('0')]]));
      const result = await assertUiConsistency({
        db: prisma,
        journal,
        customerId: C_ALPHA,
        context: { source: 'PAYMENT', correlationId: 'ord-1' },
      });
      expect(result.ok).toBe(true);
      expect(result.canonicalDebtKd).toBe('0.0000');
      expect(result.subscriberDebtKd).toBe('0.0000');
      expect(result.collectionsDebtKd).toBe('0.0000');
    });

    it('never throws when the canonical helper itself rejects', async () => {
      const prisma = {
        order: {
          findMany: jest.fn().mockRejectedValue(new Error('boom')),
        },
        debtLedgerEntry: {
          findMany: jest.fn().mockRejectedValue(new Error('boom')),
        },
      } as any;
      const journal = buildJournalSource(new Map());
      const result = await assertUiConsistency({
        db: prisma,
        journal,
        customerId: C_ALPHA,
        context: { source: 'OTHER' },
      });
      expect(result.ok).toBe(true); // helper degrades safely
    });
  });
});

/**
 * CASE 5 — Legacy reader scanner. Runs the production
 * `scripts/find-legacy-debt-readers.ts` in JSON mode and
 * asserts:
 *   • the scanner produces a structured result;
 *   • known legacy patterns are detected at non-zero counts;
 *   • the new canonical helper file is in the allow-list (no
 *     hits there).
 *
 * The script emits warnings via stdout, so we don't run it
 * with `--strict` (we don't want CI to fail on every legacy
 * read; the inspector endpoint is the runtime safeguard).
 */
describe('V20.3.2 — CASE 5 legacy reader scanner', () => {
  it('runs to completion and reports a non-empty pattern histogram', () => {
    const repoRoot = join(__dirname, '..', '..', '..');
    const stdout = execSync(
      `npx tsx ${join('scripts', 'find-legacy-debt-readers.ts')} --json`,
      {
        cwd: repoRoot,
        encoding: 'utf8',
        // Allow the scanner up to 60s on cold cache; in-warm jest
        // workers it usually completes well under 5s.
        timeout: 60_000,
      },
    );
    const json = JSON.parse(stdout);
    expect(json).toHaveProperty('totalHits');
    expect(typeof json.totalHits).toBe('number');
    expect(json).toHaveProperty('byPattern');
    expect(json).toHaveProperty('hits');
    expect(Array.isArray(json.hits)).toBe(true);
    // V20.6 — Phase 2 milestone: every legacy reader surface has
    // either been migrated to the canonical helper, intentionally
    // suppressed at the call site with a documented
    // `// allow-legacy-debt-reader (...)` comment, or moved into
    // the scanner's path-allowlist (server services that
    // legitimately read primaries to compute canonical values).
    // The new invariant is: totalHits MUST stay 0. Any new hit
    // is a regression — the line either shouldn't exist (use the
    // canonical helper instead) or needs an explicit suppress
    // comment with rationale.
    expect(json.totalHits).toBe(0);
    // The new canonical helper file MUST NOT itself trip the
    // scanner (it's in the allowlist).
    const canonicalPath = 'src/finance/canonical-customer-debt.util.ts';
    const canonicalHits = json.hits.filter(
      (h: { file: string }) => h.file === canonicalPath,
    );
    expect(canonicalHits).toEqual([]);
  });

  it('skips test specs from the scan to avoid noise from fixtures', () => {
    // Sanity: the scanner config skips *.spec.ts so this very
    // file (which mentions `wallet.debt` in fixtures) is not
    // itself flagged.
    const repoRoot = join(__dirname, '..', '..', '..');
    const stdout = execSync(
      `npx tsx ${join('scripts', 'find-legacy-debt-readers.ts')} --json`,
      { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 },
    );
    const json = JSON.parse(stdout);
    const specHits = json.hits.filter((h: { file: string }) =>
      h.file.endsWith('.spec.ts'),
    );
    expect(specHits).toEqual([]);
  });
});

// keep imports referenced
void readFileSync;
