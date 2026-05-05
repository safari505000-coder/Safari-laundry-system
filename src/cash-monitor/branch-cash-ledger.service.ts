/**
 * BranchCashLedgerService -- DERIVED projection of branch cash.
 *
 * SSoT contract (CASH BELONGS TO ENTITY -- NOT PEOPLE):
 *
 *   Branch cash is NEVER stored as its own column anywhere. It is
 *   ALWAYS derived from two existing tables:
 *
 *     - ManagerCashCustody.amountKd  (driver -> branch transfers)
 *     - BankDepositLog.amountKd      (branch -> bank deposits, when
 *                                     linked to a custody bag)
 *
 *   The "current branch cash held" projection MUST match the v2 stage
 *   classifier verbatim: a custody bag belongs to the branch as long
 *   as its lifecycle stage is CUSTODY or VERIFIED (i.e. status in
 *   {PENDING_DEPOSIT, AWAITING_VERIFICATION, VERIFIED}) AND no linked
 *   BankDepositLog row exists yet. Once a BankDepositLog is attached
 *   the cash has left the branch's operational ledger -- it is in
 *   transit (DEPOSIT) or cleared (BANK).
 *
 *   This is what makes drift detection meaningful: any divergence
 *   between this projection and `cash-intelligence-v2 locationSummary`
 *   indicates a real chain break, not a definitional disagreement.
 *
 * What this service deliberately does NOT do:
 *   - It does NOT mutate any table. No write, no upsert, no audit log
 *     emit on the read path.
 *   - It does NOT invent a third source of truth. There is no
 *     `branch_cash_ledger` row written; the historical movements ARE
 *     the ManagerCashCustody and BankDepositLog rows themselves.
 *   - It does NOT attribute ownership to managerId or to a user. The
 *     `branchId` foreign key on ManagerCashCustody is the ONLY axis.
 *   - It does NOT silently drop unattributed money. Bags without a
 *     branchId and orphan verified deposits (no custody linkage) are
 *     surfaced under explicit `unattributed*` totals so the operator
 *     can investigate -- never hidden, never auto-merged.
 *
 * Read-only and advisory-only -- safe to call from cron, controllers,
 * audit suites, and the dashboard composer.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  BankDepositStatus,
  ManagerCashCustodyStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { fixed4ToMinor, minorToFixed4 } from '../cash-intelligence/engines/money.util';

/**
 * Per-branch projection. All KD values are fixed-4 strings.
 */
export interface BranchCashLedgerRow {
  branchId: string;
  branchName: string;

  /**
   * Current cash physically attributable to the branch right now.
   * = SUM(custody.amountKd) over bags with branchId = X, status in
   * {PENDING_DEPOSIT, AWAITING_VERIFICATION, VERIFIED}, AND no linked
   * BankDepositLog row yet.
   *
   * This is the SSoT for "branch cash" and the value the dashboard
   * surfaces under `branches[].currentBranchCash`.
   */
  currentBranchCash: string;

  /** Number of open custody bags contributing to currentBranchCash. */
  openBagCount: number;

  /**
   * Incoming flow over the optional window: SUM of all custody bags
   * received from drivers AT this branch, regardless of status, whose
   * `receivedFromDriverAt` falls in [from, to]. REJECTED bags are
   * INCLUDED here (they were received) but excluded from currentCash.
   *
   * `null` when no window was supplied.
   */
  incomingKd: string | null;

  /**
   * Outgoing flow over the optional window: SUM of all VERIFIED bank
   * deposits whose linked custody bag's branchId = X and whose
   * `verifiedAt` falls in [from, to]. Orphan deposits (no custody
   * linkage) are NOT counted here; they bubble up under
   * `unattributedDepositKd` on the response root.
   *
   * `null` when no window was supplied.
   */
  outgoingKd: string | null;
}

export interface BranchCashLedgerResponse {
  generatedAt: string;
  /**
   * Optional window the incoming/outgoing values were computed over.
   * Null when the projection is "as-of-now" only.
   */
  window: { from: string; to: string } | null;
  branches: BranchCashLedgerRow[];

  /**
   * Cash currently sitting in custody bags that have NO branchId set
   * (legacy / pre-`branchId` rows). Surfaced for the operator to
   * investigate -- NEVER silently merged into a branch's number.
   */
  unattributedCustodyKd: string;
  unattributedCustodyBagCount: number;

  /**
   * VERIFIED bank deposits whose `managerCashCustodyId` is null
   * (legacy receipt-only flow). They still hit the bank but cannot be
   * attributed to a specific branch via the chain. Surfaced for the
   * operator -- NEVER silently merged.
   *
   * Only populated when a window was supplied.
   */
  unattributedDepositKd: string | null;

  /**
   * Σ over branches[].currentBranchCash, fixed-4 KD. The dashboard
   * uses this as the single "branch cash total" alongside the SSoT
   * driver-cash total.
   */
  totalCurrentBranchCash: string;

  /** Always true. */
  readOnly: true;
  advisoryOnly: true;
}

/**
 * Bag statuses that count toward the current branch-held cash. REJECTED
 * is intentionally excluded -- a rejected bag goes back under manager
 * liability per Dastur §3 and is NOT branch-owned.
 *
 * Mutable array (not `as const` / `ReadonlyArray<>`) so it can be
 * passed directly to Prisma's `in` filter, which expects a mutable
 * `T[]` shape.
 */
const HELD_AT_BRANCH_STATUSES: ManagerCashCustodyStatus[] = [
  ManagerCashCustodyStatus.PENDING_DEPOSIT,
  ManagerCashCustodyStatus.AWAITING_VERIFICATION,
  ManagerCashCustodyStatus.VERIFIED,
];

@Injectable()
export class BranchCashLedgerService {
  private readonly logger = new Logger(BranchCashLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Project the branch cash ledger from the canonical chain tables.
   *
   * @param opts.window  Optional time window for incoming/outgoing
   *                     flow aggregation. When omitted, the response
   *                     reports `currentBranchCash` only (incoming /
   *                     outgoing fields are null).
   * @param opts.branchId  Optional branch filter (clamps the query to
   *                       a single branch, e.g. for MANAGER scope).
   */
  async project(opts?: {
    window?: { from: Date; to: Date };
    branchId?: string;
  }): Promise<BranchCashLedgerResponse> {
    const branchFilter = opts?.branchId
      ? { branchId: opts.branchId }
      : ({} as Prisma.ManagerCashCustodyWhereInput);

    // 1) "Current branch cash" -- bags still on branch hands.
    //    A bag is on branch hands iff:
    //      - status in HELD_AT_BRANCH_STATUSES
    //      - AND no linked BankDepositLog row exists yet
    //
    //    The Prisma `bankDepositLog: null` filter resolves the optional
    //    1-to-1 relation: rows whose linked deposit log is absent. We
    //    select only scalar columns and resolve branch names in a
    //    single follow-up batch lookup -- this keeps Prisma's type
    //    narrowing simple and the query payload tight.
    const heldBags = await this.prisma.managerCashCustody.findMany({
      where: {
        ...branchFilter,
        status: { in: HELD_AT_BRANCH_STATUSES },
        bankDepositLog: null,
      },
      select: {
        id: true,
        branchId: true,
        amountKd: true,
      },
    });

    // Aggregate by branchId. Bags with branchId === null are lifted
    // into the unattributed bucket (never silently merged).
    const branchAgg = new Map<
      string,
      { minor: bigint; bagCount: number }
    >();
    let unattributedMinor = 0n;
    let unattributedBagCount = 0;

    for (const bag of heldBags) {
      if (!bag.branchId) {
        unattributedMinor += fixed4ToMinor(bag.amountKd);
        unattributedBagCount += 1;
        continue;
      }
      const prev = branchAgg.get(bag.branchId) ?? {
        minor: 0n,
        bagCount: 0,
      };
      prev.minor += fixed4ToMinor(bag.amountKd);
      prev.bagCount += 1;
      branchAgg.set(bag.branchId, prev);
    }

    // 2) Optional window aggregations: incoming + outgoing flow.
    let incomingByBranch = new Map<string, bigint>();
    let outgoingByBranch = new Map<string, bigint>();
    let unattributedDepositMinor: bigint | null = null;

    const window = opts?.window ?? null;
    if (window) {
      // Incoming: every bag received in window, EXCLUDING REJECTED
      // (a rejected bag is a non-event for the branch ledger -- the
      // money never settled into branch ownership).
      const inBags = await this.prisma.managerCashCustody.findMany({
        where: {
          ...branchFilter,
          receivedFromDriverAt: { gte: window.from, lte: window.to },
          status: { not: ManagerCashCustodyStatus.REJECTED },
        },
        select: { branchId: true, amountKd: true },
      });
      for (const b of inBags) {
        if (!b.branchId) continue;
        incomingByBranch.set(
          b.branchId,
          (incomingByBranch.get(b.branchId) ?? 0n) + fixed4ToMinor(b.amountKd),
        );
      }

      // Outgoing: VERIFIED bank deposits in window. We must resolve
      // the branch via the linked custody bag -- legacy orphan logs
      // (no custody linkage) cannot be attributed.
      //
      // Branch-scoped path: limit the deposit query to bags with the
      // requested branchId via a relational filter.
      const depositWhere: Prisma.BankDepositLogWhereInput = {
        status: BankDepositStatus.VERIFIED,
        verifiedAt: { gte: window.from, lte: window.to },
      };
      if (opts?.branchId) {
        depositWhere.managerCashCustody = { branchId: opts.branchId };
      }
      const outDeposits = await this.prisma.bankDepositLog.findMany({
        where: depositWhere,
        select: {
          amountKd: true,
          managerCashCustody: { select: { branchId: true } },
        },
      });
      unattributedDepositMinor = 0n;
      for (const d of outDeposits) {
        const minor = fixed4ToMinor(d.amountKd);
        const branchId = d.managerCashCustody?.branchId ?? null;
        if (!branchId) {
          unattributedDepositMinor += minor;
          continue;
        }
        outgoingByBranch.set(
          branchId,
          (outgoingByBranch.get(branchId) ?? 0n) + minor,
        );
      }
    }

    // 3) Materialise rows. We iterate the union of branchIds seen in
    //    "held bags", "incoming", and "outgoing" so a branch with
    //    activity in the window but currently zero cash still appears.
    const branchIds = new Set<string>([
      ...branchAgg.keys(),
      ...incomingByBranch.keys(),
      ...outgoingByBranch.keys(),
    ]);

    // Resolve display names for ALL branchIds in a single batch query.
    // The held-bag scalar select intentionally omitted the relation
    // include to keep Prisma type narrowing simple; this trades a 4-
    // column join for one extra round trip and is fine at branch-
    // count scale (Safari has <50 branches).
    const nameById: Map<string, string> = new Map();
    if (branchIds.size > 0) {
      const branches = await this.prisma.branch.findMany({
        where: { id: { in: Array.from(branchIds) } },
        select: { id: true, name: true },
      });
      for (const b of branches) nameById.set(b.id, b.name);
    }

    const rows: BranchCashLedgerRow[] = Array.from(branchIds).map((id) => {
      const held = branchAgg.get(id);
      const name = nameById.get(id) ?? id;
      const currentMinor = held?.minor ?? 0n;
      const bagCount = held?.bagCount ?? 0;
      const incomingMinor = incomingByBranch.get(id);
      const outgoingMinor = outgoingByBranch.get(id);
      return {
        branchId: id,
        branchName: name,
        currentBranchCash: minorToFixed4(currentMinor),
        openBagCount: bagCount,
        incomingKd: window
          ? minorToFixed4(incomingMinor ?? 0n)
          : null,
        outgoingKd: window
          ? minorToFixed4(outgoingMinor ?? 0n)
          : null,
      };
    });

    // Stable sort: largest current cash first, then by name.
    rows.sort((a, b) => {
      const aMinor = fixed4ToMinor(a.currentBranchCash);
      const bMinor = fixed4ToMinor(b.currentBranchCash);
      if (aMinor !== bMinor) return aMinor < bMinor ? 1 : -1;
      return a.branchName.localeCompare(b.branchName);
    });

    const totalCurrentMinor = rows.reduce(
      (s, r) => s + fixed4ToMinor(r.currentBranchCash),
      0n,
    );

    return {
      generatedAt: new Date().toISOString(),
      window: window
        ? {
            from: window.from.toISOString(),
            to: window.to.toISOString(),
          }
        : null,
      branches: rows,
      unattributedCustodyKd: minorToFixed4(unattributedMinor),
      unattributedCustodyBagCount: unattributedBagCount,
      unattributedDepositKd:
        unattributedDepositMinor !== null
          ? minorToFixed4(unattributedDepositMinor)
          : null,
      totalCurrentBranchCash: minorToFixed4(totalCurrentMinor),
      readOnly: true,
      advisoryOnly: true,
    };
  }
}
