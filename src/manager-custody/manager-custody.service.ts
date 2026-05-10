import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditStatus,
  BankDepositStatus,
  BankDepositType,
  GeneralLedgerEntryType,
  ManagerCashCustody,
  ManagerCashCustodyStatus,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CashService } from '../finance/services/cash.service';
import { LedgerProjectionService } from '../finance/ledger/ledger-projection.service';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertDeclaredMatchesLedgerMinor,
  minorToAmountString,
  parseFixed4ToMinor,
} from '../finance/finance-money';
import type { DriverBalanceRowDto } from '../finance/dto/driver-balance.dto';
import { ApproveReceiptFromDriverDto } from './dto/approve-receipt-from-driver.dto';
import { ListCustodyQueryDto } from './dto/list-custody-query.dto';
import { RejectCustodyDto } from './dto/reject-custody.dto';
import { UploadDepositSlipDto } from './dto/upload-deposit-slip.dto';
import { VerifyCustodyDto } from './dto/verify-custody.dto';

/** Dastur §3 — 24h window for a manager to bank the cash before we flag it. */
export const CUSTODY_OVERDUE_MS = 24 * 60 * 60 * 1000;

type CustodyWithPeople = Prisma.ManagerCashCustodyGetPayload<{
  include: {
    manager: { select: { id: true; fullName: true; username: true; phone: true } };
    driver: { select: { id: true; fullName: true; username: true } };
    branch: { select: { id: true; name: true } };
    shift: { select: { id: true; endedAt: true; startedAt: true } };
  };
}>;

export type CustodyRowDto = {
  id: string;
  managerId: string;
  managerName: string;
  managerUsername: string;
  managerPhone: string | null;
  driverId: string;
  driverName: string;
  driverUsername: string;
  branchId: string | null;
  branchName: string | null;
  shiftId: string | null;
  amountKd: string;
  settledOrderCount: number;
  status: ManagerCashCustodyStatus;
  receivedFromDriverAt: string;
  slipUploadedAt: string | null;
  depositSlipUrl: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  /** Whole hours the bag has been in manager custody (since receivedFromDriverAt). */
  ageHours: number;
  /** True if aged >= 24h AND still not VERIFIED (overdue alert). */
  isOverdue: boolean;
};

export type AgingBucket = 'FRESH' | 'WARNING_12H' | 'OVERDUE_24H';

export type AgingSummary = {
  pendingCount: number;
  awaitingVerificationCount: number;
  overdueCount: number;
  totalPendingKd: string;
  totalOverdueKd: string;
  bucket: Record<AgingBucket, number>;
};

/**
 * Per-driver row inside the manager `cash-status` snapshot.
 *
 * Represents cash that is STILL ON THE DRIVER (not yet handed over to
 * the manager) — the high-risk side of the custody pipeline. Risk
 * level is graded purely from the driver's open shift age:
 *   - <24h     → NORMAL
 *   - ≥24h     → WARNING
 *   - ≥48h     → CRITICAL
 *
 * The manager UI uses this to drive the red/yellow tones and the
 * "خطر — driver hasn't handed cash in 48h" badges. No frontend
 * arithmetic — risk classification is computed here once.
 */
export type DriverHandoverSummaryDto = {
  driverId: string;
  driverName: string;
  driverUsername: string;
  driverPhone: string | null;
  heldCashKd: string;
  pendingOrderCount: number;
  shiftStartedAt: string | null;
  ageHours: number | null;
  riskLevel: 'NORMAL' | 'WARNING' | 'CRITICAL';
};

/**
 * Recent activity row inside the manager `cash-status` snapshot.
 *
 * Sourced from the LedgerProjectionService entries that touch this
 * manager's MANAGER_<id> account OR any DRIVER_<id> account in the
 * manager's branch — i.e. exactly the same events the auditor sees,
 * deduped by `txId` (every projected event has a paired DR/CR).
 */
export type ActivityEventDto = {
  txId: string;
  at: string;
  amountKd: string;
  kind: 'POS_SALE' | 'DRIVER_HANDOVER' | 'BANK_DEPOSIT' | 'OTHER';
  actorAccountId: string;
  meta: Record<string, unknown> | null;
};

export type ManagerCashStatusSnapshotDto = {
  source: 'api/manager/cash-status';
  managerId: string;
  managerName: string;
  /** Grand total under this manager's control = own POS cash + held bags. */
  pendingDepositKd: string;
  /** Manager's own POS cash (CASH POS sales rung up by them directly). */
  managerOwnPosKd: string;
  /** KD aggregate of bags currently in this manager's drawer. */
  custodyBagsTotalKd: string;
  /**
   * KD aggregate of cash currently with branch drivers (not yet
   * handed to the manager). The high-risk side of the pipeline.
   */
  driversAwaitingHandoverKd: string;
  bagsCount: number;
  driversAtRiskCount: number;
  lastHandoverAt: string | null;
  lastActivityAt: string | null;
  /** Drivers in this branch with cash still on them. Risk-graded. */
  drivers: DriverHandoverSummaryDto[];
  /** Last 10 events (deduped by txId), most recent first. */
  recentActivity: ActivityEventDto[];
  generatedAt: string;
};

type StaffDebtsStatusFilter = 'ALL' | 'OVERDUE' | 'CURRENT';

export type StaffDebtsQuery = {
  branch?: string | null;
  name?: string | null;
  employee?: string | null;
  status?: StaffDebtsStatusFilter | null;
};

export type StaffDebtsEmployeeOption = {
  value: string;
  label: string;
  branchId: string | null;
  kind: 'driver' | 'manager';
};

export type StaffDebtsDriverRow = DriverBalanceRowDto & {
  isOverdue: boolean;
  shiftAgeHours: number | null;
};

export type StaffDebtsManagerRow = CustodyRowDto;

export type StaffDebtsEnvelopeDto = {
  drivers: StaffDebtsDriverRow[];
  managers: StaffDebtsManagerRow[];
  branches: Array<{ id: string; name: string }>;
  employeeOptions: StaffDebtsEmployeeOption[];
  selectedEmployee: StaffDebtsEmployeeOption | null;
  showBranchFilter: boolean;
  appliedFilters: {
    branch: string;
    name: string;
    employee: string;
    status: StaffDebtsStatusFilter;
  };
  totals: {
    pipelineTotalKd: string;
    driverTotalKd: string;
    managerTotalKd: string;
    driverBreakdown: {
      cashKd: string;
      knetKd: string;
      linkKd: string;
      onlineKd: string;
    };
    overdueDriverCount: number;
    overdueManagerCount: number;
    totalOverdueCount: number;
    driverRowCount: number;
    managerRowCount: number;
  };
  generatedAt: string;
};

function riskRank(r: DriverHandoverSummaryDto['riskLevel']): number {
  if (r === 'CRITICAL') return 2;
  if (r === 'WARNING') return 1;
  return 0;
}

function parseStaffDebtsEmployeeFilter(
  raw: string,
): { kind: 'driver' | 'manager'; id: string } | null {
  if (!raw || raw === 'ALL') return null;
  const [kind, id] = raw.split(':');
  if ((kind === 'driver' || kind === 'manager') && id) return { kind, id };
  return null;
}

function decimalGt(value: string | number | Prisma.Decimal, threshold: number): boolean {
  return new Prisma.Decimal(value ?? 0).greaterThan(threshold);
}

function staffDebtDriverShiftAgeHours(row: DriverBalanceRowDto, now: number): number | null {
  if (!row.shiftStartedAt) return null;
  const started = new Date(row.shiftStartedAt).getTime();
  if (!Number.isFinite(started)) return null;
  return Math.floor(Math.max(0, now - started) / 3_600_000);
}

function isStaffDebtDriverOverdue(row: DriverBalanceRowDto, now: number): boolean {
  if (!decimalGt(row.pendingTotalKd, 0)) return false;
  if (!row.currentShiftId) return true;
  const ageHours = staffDebtDriverShiftAgeHours(row, now);
  return ageHours !== null && ageHours >= 24;
}

function buildStaffDebtEmployeeOptions(
  drivers: ReadonlyArray<StaffDebtsDriverRow>,
  managers: ReadonlyArray<StaffDebtsManagerRow>,
): StaffDebtsEmployeeOption[] {
  const seen = new Set<string>();
  const out: StaffDebtsEmployeeOption[] = [];
  for (const driver of drivers) {
    const value = `driver:${driver.driverId}`;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({
      value,
      label: driver.fullName,
      branchId: driver.branchId,
      kind: 'driver',
    });
  }
  for (const manager of managers) {
    const value = `manager:${manager.managerId}`;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({
      value,
      label: manager.managerName,
      branchId: manager.branchId,
      kind: 'manager',
    });
  }
  return out;
}

function classifyActivity(e: {
  meta: unknown;
  accountId: string;
}): ActivityEventDto['kind'] {
  const meta = (e.meta ?? {}) as Record<string, unknown>;
  const source = String(meta.source ?? '');
  const entryType = String(meta.entryType ?? '');
  const event = String(meta.event ?? '');
  if (source === 'GeneralLedgerEntry' && entryType === 'POS_SALE_COMPLETED') {
    return 'POS_SALE';
  }
  if (source === 'BankDepositLog') return 'BANK_DEPOSIT';
  if (source === 'ManagerCashCustody') {
    // VERIFIED handover row = the bank deposit closing the bag (CR
    // MANAGER_<id> / DR BANK_ACCOUNT). HANDOVER is the driver→manager
    // pickup itself.
    if (event === 'VERIFIED') return 'BANK_DEPOSIT';
    return 'DRIVER_HANDOVER';
  }
  return 'OTHER';
}

@Injectable()
export class ManagerCustodyService {
  private readonly logger = new Logger(ManagerCustodyService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly generalLedger: GeneralLedgerService,
    private readonly cashService: CashService,
    private readonly auditLogs: AuditLogsService,
    private readonly ledgerProjection: LedgerProjectionService,
  ) {}

  /**
   * Dastur §3.DRIVER_EXIT — Manager approves receipt of cash from driver.
   *
   * Cash handover is INDEPENDENT of the shift cycle:
   *   - Flips PAID_TO_DRIVER → HANDED_OVER_TO_OFFICE (zeros driver balance).
   *   - Creates a ManagerCashCustody row in PENDING_DEPOSIT status; the
   *     manager can deposit days later and upload the slip separately.
   *   - Stamps the driver's currently-open shift (if any) onto the flipped
   *     orders as `handoverShiftId` for audit — purely informational.
   *
   * The shift belongs to the financial cycle (midnight → midnight, Kuwait
   * time) and is closed by the daily OWNER job, never by this event.
   * The 24h aging clock on the custody bag starts at `receivedFromDriverAt`.
   */
  async approveReceiptFromDriver(
    managerId: string,
    _managerBranchId: string | null,
    dto: ApproveReceiptFromDriverDto,
  ): Promise<CustodyRowDto> {
    // A3.D5 — historically there were two parallel implementations that
    // both flipped CASH orders → HANDED_OVER_TO_OFFICE and created a
    // ManagerCashCustody bag: CashService.confirmHandover (office / web)
    // and this one (manager mobile). Any drift between them became a
    // financial-integrity risk. Now we delegate to the single canonical
    // pipeline and only augment the resulting bag with the optional
    // free-text note that is specific to this entry point.
    const result = await this.cashService.confirmHandover(
      managerId,
      SafariRole.MANAGER,
      {
        driverId: dto.driverId,
        declaredHandoverTotal: dto.declaredHandoverTotal,
      },
    );

    if (result.settledOrderCount === 0) {
      // Preserve legacy contract for the manager mobile flow: the manager
      // pressing the button with no pending cash is treated as an error.
      throw new BadRequestException(
        'No cash pending settlement for this driver.',
      );
    }

    // confirmHandover does not return the bag id directly, so fetch the
    // most recent bag for this (manager, driver) pair — it was just
    // created inside the same request.
    const bag = await this.prisma.managerCashCustody.findFirst({
      where: {
        managerId,
        driverId: dto.driverId,
        status: ManagerCashCustodyStatus.PENDING_DEPOSIT,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });
    if (!bag) {
      throw new ConflictException(
        'Handover completed but custody bag was not found. Retry.',
      );
    }

    const note = dto.note?.trim() ?? '';
    if (note.length > 0 && bag.note !== note) {
      const updated = await this.prisma.managerCashCustody.update({
        where: { id: bag.id },
        data: { note },
        include: {
          manager: {
            select: { id: true, fullName: true, username: true, phone: true },
          },
          driver: { select: { id: true, fullName: true, username: true } },
          branch: { select: { id: true, name: true } },
          shift: { select: { id: true, endedAt: true, startedAt: true } },
        },
      });
      return this.toRow(updated);
    }

    return this.toRow(bag);
  }

  /** Manager uploads bank-deposit slip URL → bag moves to AWAITING_VERIFICATION. */
  async uploadDepositSlip(
    custodyId: string,
    managerId: string,
    dto: UploadDepositSlipDto,
  ): Promise<CustodyRowDto> {
    const bag = await this.requireBag(custodyId);
    if (bag.managerId !== managerId) {
      throw new ForbiddenException(
        'Only the manager who received the cash can upload the deposit slip.',
      );
    }
    if (
      bag.status !== ManagerCashCustodyStatus.PENDING_DEPOSIT &&
      bag.status !== ManagerCashCustodyStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot upload slip from status ${bag.status}.`,
      );
    }
    if (dto.declaredDepositTotal !== undefined) {
      const ledgerMinor = parseFixed4ToMinor(bag.amountKd.toFixed(4));
      try {
        assertDeclaredMatchesLedgerMinor(ledgerMinor, dto.declaredDepositTotal);
      } catch (e) {
        throw new BadRequestException(
          e instanceof Error ? e.message : 'Declared deposit mismatch',
        );
      }
    }

    const updated = await this.prisma.managerCashCustody.update({
      where: { id: custodyId },
      data: {
        depositSlipUrl: dto.depositSlipUrl,
        slipUploadedAt: new Date(),
        status: ManagerCashCustodyStatus.AWAITING_VERIFICATION,
        rejectedByAccountantId: null,
        rejectedAt: null,
        rejectionReason: null,
        note: dto.note?.trim() || bag.note,
      },
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });

    // Mirror slip onto the shift for the legacy bank-deposit-receipt view.
    if (updated.shiftId) {
      await this.prisma.shift.update({
        where: { id: updated.shiftId },
        data: { bankDepositReceiptUrl: dto.depositSlipUrl },
      });
    }

    return this.toRow(updated);
  }

  /** Accountant verifies a bag → VERIFIED. */
  async verifyCustody(
    custodyId: string,
    accountantId: string,
    dto: VerifyCustodyDto,
  ): Promise<CustodyRowDto> {
    const bag = await this.requireBag(custodyId);
    if (bag.status !== ManagerCashCustodyStatus.AWAITING_VERIFICATION) {
      throw new BadRequestException(
        `Only bags in AWAITING_VERIFICATION can be verified (got ${bag.status}).`,
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.managerCashCustody.update({
        where: { id: custodyId },
        data: {
          status: ManagerCashCustodyStatus.VERIFIED,
          verifiedByAccountantId: accountantId,
          verifiedAt: new Date(),
          note: dto.note?.trim() || bag.note,
        },
        include: {
          manager: {
            select: { id: true, fullName: true, username: true, phone: true },
          },
          driver: { select: { id: true, fullName: true, username: true } },
          branch: { select: { id: true, name: true } },
          shift: { select: { id: true, endedAt: true, startedAt: true } },
        },
      });

      // Dastur §5 — custody verification is a settlement event that the
      // GL must record. The full bag amount leaves driver/manager custody
      // and is confirmed as banked cash by the accountant.
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.WALLET_SETTLEMENT,
        amount: row.amountKd,
        memo: 'manager custody verified',
        actorUserId: accountantId,
        metadata: {
          event: 'CUSTODY_VERIFIED',
          custodyId: row.id,
          managerId: row.managerId,
          driverId: row.driverId,
          branchId: row.branchId,
          shiftId: row.shiftId,
          settledOrderCount: row.settledOrderCount,
        },
      });

      if (row.depositSlipUrl) {
        const existingDeposit = await tx.bankDepositLog.findFirst({
          where: {
            OR: [
              { managerCashCustodyId: row.id },
              {
                shiftId: row.shiftId,
                receiptImageUrl: row.depositSlipUrl,
                amountKd: row.amountKd,
              },
            ],
          },
        });
        if (!existingDeposit) {
          const deposit = await tx.bankDepositLog.create({
            data: {
              depositType: BankDepositType.CASH_DEPOSIT_SLIP,
              status: BankDepositStatus.VERIFIED,
              amountKd: row.amountKd,
              receiptImageUrl: row.depositSlipUrl,
              shiftId: row.shiftId,
              managerCashCustodyId: row.id,
              uploadedById: row.managerId,
              verifiedByAccountantId: accountantId,
              verifiedAt: row.verifiedAt,
              createdAt: row.slipUploadedAt ?? row.receivedFromDriverAt,
            },
          });
          await tx.auditLog.create({
            data: {
              userId: accountantId,
              actorId: accountantId,
              action: 'CASH_DEPOSIT_REGISTERED',
              resource: 'bank_deposit_log',
              amount: row.amountKd,
              source: 'MANAGER_CASH_CUSTODY',
              status: AuditStatus.SUCCESS,
              changes: {
                managerCashCustodyId: row.id,
                bankDepositLogId: deposit.id,
                shiftId: row.shiftId,
                amountKd: row.amountKd.toString(),
              },
            },
          });
        } else if (!existingDeposit.managerCashCustodyId) {
          await tx.bankDepositLog.update({
            where: { id: existingDeposit.id },
            data: {
              managerCashCustodyId: row.id,
              status:
                existingDeposit.verifiedAt ?
                  BankDepositStatus.VERIFIED
                : existingDeposit.status,
            },
          });
        }
      }

      return row;
    });

    // Cash leaves manager custody and is recognised as company asset.
    // Emit at the verification boundary REGARDLESS of which branch ran
    // inside the transaction (auto-create vs link-to-pre-upload), so the
    // audit timeline always carries one row per VERIFIED bag.
    this.auditLogs.logFinancialEvent({
      action: 'CASH_DEPOSIT_VERIFIED',
      userId: accountantId,
      role: SafariRole.ACCOUNTANT,
      amount: updated.amountKd.toString(),
      source: 'MANAGER_CASH_CUSTODY',
      changes: {
        custodyId: updated.id,
        managerId: updated.managerId,
        driverId: updated.driverId,
        branchId: updated.branchId,
        shiftId: updated.shiftId,
        settledOrderCount: updated.settledOrderCount,
      },
    });

    return this.toRow(updated);
  }

  /** Accountant rejects a bag → back to PENDING_DEPOSIT so the manager re-uploads. */
  async rejectCustody(
    custodyId: string,
    accountantId: string,
    dto: RejectCustodyDto,
  ): Promise<CustodyRowDto> {
    const bag = await this.requireBag(custodyId);
    if (bag.status !== ManagerCashCustodyStatus.AWAITING_VERIFICATION) {
      throw new BadRequestException(
        `Only bags in AWAITING_VERIFICATION can be rejected (got ${bag.status}).`,
      );
    }
    const updated = await this.prisma.managerCashCustody.update({
      where: { id: custodyId },
      data: {
        status: ManagerCashCustodyStatus.REJECTED,
        rejectedByAccountantId: accountantId,
        rejectedAt: new Date(),
        rejectionReason: dto.rejectionReason.trim(),
      },
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });

    // Symmetrical to CASH_HANDOVER_TRANSFER: a rejected verification is a
    // material event in the cash chain — the bag is bounced back to
    // PENDING_DEPOSIT and the manager must re-upload. Without this audit
    // row, an external auditor could not reconstruct why a bag's status
    // oscillated.
    this.auditLogs.logFinancialEvent({
      action: 'CASH_HANDOVER_REJECTED',
      userId: accountantId,
      role: SafariRole.ACCOUNTANT,
      amount: updated.amountKd.toString(),
      source: 'MANAGER_CASH_CUSTODY',
      changes: {
        custodyId: updated.id,
        managerId: updated.managerId,
        driverId: updated.driverId,
        branchId: updated.branchId,
        shiftId: updated.shiftId,
        rejectionReason: updated.rejectionReason,
      },
    });

    return this.toRow(updated);
  }

  /** Manager — their own bags (all statuses, most recent first). */
  async listMine(managerId: string): Promise<CustodyRowDto[]> {
    const rows = await this.prisma.managerCashCustody.findMany({
      where: { managerId },
      orderBy: { receivedFromDriverAt: 'desc' },
      take: 200,
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });
    return rows.map((r) => this.toRow(r));
  }

  /**
   * V19.30 — Same HTTP entry as `listMine` for MANAGER; for OWNER / GM /
   * ACCOUNTANT returns fleet-wide unsettled custody (aging rows) so the
   * My Custody shell can render read-only without a second route.
   */
  async listMineForActor(
    userId: string,
    role: SafariRole,
  ): Promise<CustodyRowDto[]> {
    if (role === SafariRole.MANAGER) {
      return this.listMine(userId);
    }
    if (
      role === SafariRole.OWNER ||
      role === SafariRole.GENERAL_MANAGER ||
      role === SafariRole.ACCOUNTANT
    ) {
      const { rows } = await this.listAging({});
      return rows;
    }
    throw new ForbiddenException('Not authorised for manager custody list.');
  }

  /**
   * V19.17 — Driver-facing "my cash-handover receipts" list.
   *
   * Returns every ManagerCashCustody bag attributed to `driverId` as
   * the originating driver (i.e. every formal cash handover they
   * performed to a branch manager). Drivers call this to enumerate
   * their own receipts and open each one as a formal printable
   * voucher (سند استلام رسمي). The payload is the same `CustodyRowDto`
   * used by the manager + owner views; RBAC is applied at the
   * controller level (SafariRole.DRIVER with `userId === driverId`).
   */
  async listByDriver(driverId: string): Promise<CustodyRowDto[]> {
    const rows = await this.prisma.managerCashCustody.findMany({
      where: { driverId },
      orderBy: { receivedFromDriverAt: 'desc' },
      take: 200,
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });
    return rows.map((r) => this.toRow(r));
  }

  /**
   * V19.17 — single-bag lookup used by the printable receipt page.
   * Access control: the requester must be either the driver who
   * handed the cash over, the manager who received it, or a
   * privileged back-office role (ACCOUNTANT / GENERAL_MANAGER /
   * OWNER). Anyone else is denied, even if they guessed the UUID.
   */
  async findByIdForReceipt(
    custodyId: string,
    actorUserId: string,
    actorRole: SafariRole,
  ): Promise<CustodyRowDto> {
    const bag = await this.prisma.managerCashCustody.findUnique({
      where: { id: custodyId },
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });
    if (!bag) throw new NotFoundException('Custody bag not found.');

    const privileged: SafariRole[] = [
      SafariRole.OWNER,
      SafariRole.GENERAL_MANAGER,
      SafariRole.ACCOUNTANT,
    ];
    const isPrivileged = privileged.includes(actorRole);
    const isDriver = bag.driverId === actorUserId;
    const isManager = bag.managerId === actorUserId;
    if (!isPrivileged && !isDriver && !isManager) {
      throw new ForbiddenException(
        'You are not authorised to read this cash-handover receipt.',
      );
    }
    return this.toRow(bag);
  }

  /**
   * Owner / Accountant aging view — "Cash Held by Managers".
   * Returns unsettled bags (PENDING_DEPOSIT or AWAITING_VERIFICATION) with age +
   * a roll-up summary (overdue >24h highlighted in the UI).
   */
  async listAging(query: ListCustodyQueryDto): Promise<{
    rows: CustodyRowDto[];
    summary: AgingSummary;
  }> {
    const where: Prisma.ManagerCashCustodyWhereInput = {};
    if (query.status) {
      where.status = query.status;
    } else {
      where.status = {
        in: [
          ManagerCashCustodyStatus.PENDING_DEPOSIT,
          ManagerCashCustodyStatus.AWAITING_VERIFICATION,
          ManagerCashCustodyStatus.REJECTED,
        ],
      };
    }
    if (query.managerId) where.managerId = query.managerId;
    if (query.branchId) where.branchId = query.branchId;

    const rows = await this.prisma.managerCashCustody.findMany({
      where,
      orderBy: { receivedFromDriverAt: 'asc' }, // oldest (worst) first
      take: 500,
      include: {
        manager: {
          select: { id: true, fullName: true, username: true, phone: true },
        },
        driver: { select: { id: true, fullName: true, username: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, endedAt: true, startedAt: true } },
      },
    });

    const decorated = rows.map((r) => this.toRow(r));
    return { rows: decorated, summary: this.summarise(decorated) };
  }

  async getStaffDebtsProjection(query: StaffDebtsQuery): Promise<StaffDebtsEnvelopeDto> {
    const branchFilter = query.branch?.trim() || 'ALL';
    const nameFilter = query.name?.trim() || '';
    const trimmedName = nameFilter.toLocaleLowerCase();
    const employeeFilter = query.employee?.trim() || 'ALL';
    const statusFilter =
      query.status === 'OVERDUE' || query.status === 'CURRENT' ? query.status : 'ALL';
    const employeePick = parseStaffDebtsEmployeeFilter(employeeFilter);
    const now = Date.now();

    const [driverBalances, aging, branchRows] = await Promise.all([
      this.cashService.getDriverBalances(),
      this.listAging({}),
      this.prisma.branch.findMany({
        where: {},
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    const rawDrivers = driverBalances.drivers
      .filter((d) => decimalGt(d.pendingTotalKd, 0))
      .map((d): StaffDebtsDriverRow => ({
        ...d,
        isOverdue: isStaffDebtDriverOverdue(d, now),
        shiftAgeHours: staffDebtDriverShiftAgeHours(d, now),
      }));
    const rawManagers = aging.rows.filter((row) => row.status !== ManagerCashCustodyStatus.VERIFIED);

    const allEmployeeOptions = buildStaffDebtEmployeeOptions(rawDrivers, rawManagers);
    const employeeOptions = (
      branchFilter !== 'ALL' ?
        allEmployeeOptions.filter((option) => option.branchId === branchFilter)
      : allEmployeeOptions
    ).sort((a, b) => a.label.localeCompare(b.label, 'ar'));
    const selectedEmployee =
      employeePick ?
        allEmployeeOptions.find(
          (option) => option.value === `${employeePick.kind}:${employeePick.id}`,
        ) ?? null
      : null;

    const drivers = rawDrivers.filter((driver) => {
      if (employeePick) {
        if (employeePick.kind !== 'driver') return false;
        if (driver.driverId !== employeePick.id) return false;
      } else if (branchFilter !== 'ALL' && driver.branchId !== branchFilter) {
        return false;
      }
      if (trimmedName && !driver.fullName.toLocaleLowerCase().includes(trimmedName)) {
        return false;
      }
      if (statusFilter === 'OVERDUE' && !driver.isOverdue) return false;
      if (statusFilter === 'CURRENT' && driver.isOverdue) return false;
      return true;
    });

    const managers = rawManagers.filter((row) => {
      if (employeePick) {
        if (employeePick.kind !== 'manager') return false;
        if (row.managerId !== employeePick.id) return false;
      } else if (branchFilter !== 'ALL' && row.branchId !== branchFilter) {
        return false;
      }
      if (trimmedName && !row.managerName.toLocaleLowerCase().includes(trimmedName)) {
        return false;
      }
      if (statusFilter === 'OVERDUE' && !row.isOverdue) return false;
      if (statusFilter === 'CURRENT' && row.isOverdue) return false;
      return true;
    });

    const driverBreakdown = drivers.reduce(
      (acc, row) => ({
        cash: acc.cash.plus(row.pendingCashKd),
        knet: acc.knet.plus(row.pendingKnetKd),
        link: acc.link.plus(row.pendingLinkKd),
        online: acc.online.plus(row.pendingOnlineKd),
      }),
      {
        cash: new Prisma.Decimal(0),
        knet: new Prisma.Decimal(0),
        link: new Prisma.Decimal(0),
        online: new Prisma.Decimal(0),
      },
    );
    const driverTotal = driverBreakdown.cash
      .plus(driverBreakdown.knet)
      .plus(driverBreakdown.link)
      .plus(driverBreakdown.online);
    const managerTotal = managers.reduce(
      (sum, row) => sum.plus(row.amountKd),
      new Prisma.Decimal(0),
    );
    const overdueDriverCount = drivers.filter((row) => row.isOverdue).length;
    const overdueManagerCount = managers.filter((row) => row.isOverdue).length;

    return {
      drivers,
      managers,
      branches: branchRows,
      employeeOptions,
      selectedEmployee,
      showBranchFilter: !employeePick,
      appliedFilters: {
        branch: branchFilter,
        name: nameFilter,
        employee: employeeFilter,
        status: statusFilter,
      },
      totals: {
        pipelineTotalKd: driverTotal.plus(managerTotal).toFixed(4),
        driverTotalKd: driverTotal.toFixed(4),
        managerTotalKd: managerTotal.toFixed(4),
        driverBreakdown: {
          cashKd: driverBreakdown.cash.toFixed(4),
          knetKd: driverBreakdown.knet.toFixed(4),
          linkKd: driverBreakdown.link.toFixed(4),
          onlineKd: driverBreakdown.online.toFixed(4),
        },
        overdueDriverCount,
        overdueManagerCount,
        totalOverdueCount: overdueDriverCount + overdueManagerCount,
        driverRowCount: drivers.length,
        managerRowCount: managers.length,
      },
      generatedAt: new Date(now).toISOString(),
    };
  }

  /**
   * SafariStream helper — cheap aggregate for Owner/Accountant alert surface
   * and manager "my pending" card.
   */
  async getStreamMetrics(): Promise<{
    fleetOverdueCount: number;
    fleetOverdueAmountKd: string;
    fleetPendingAmountKd: string;
    pendingByManager: Array<{ managerId: string; count: number; amountKd: string }>;
  }> {
    const rows = await this.prisma.managerCashCustody.findMany({
      where: {
        status: {
          in: [
            ManagerCashCustodyStatus.PENDING_DEPOSIT,
            ManagerCashCustodyStatus.AWAITING_VERIFICATION,
            ManagerCashCustodyStatus.REJECTED,
          ],
        },
      },
      select: {
        managerId: true,
        amountKd: true,
        receivedFromDriverAt: true,
        status: true,
      },
    });
    const now = Date.now();
    let overdueMinor = 0n;
    let pendingMinor = 0n;
    let overdueCount = 0;
    const byManager = new Map<string, { count: number; minor: bigint }>();
    for (const r of rows) {
      const minor = parseFixed4ToMinor(r.amountKd.toFixed(4));
      pendingMinor += minor;
      const age = now - r.receivedFromDriverAt.getTime();
      if (age >= CUSTODY_OVERDUE_MS) {
        overdueCount += 1;
        overdueMinor += minor;
      }
      const acc = byManager.get(r.managerId) ?? { count: 0, minor: 0n };
      acc.count += 1;
      acc.minor += minor;
      byManager.set(r.managerId, acc);
    }
    return {
      fleetOverdueCount: overdueCount,
      fleetOverdueAmountKd: minorToAmountString(overdueMinor),
      fleetPendingAmountKd: minorToAmountString(pendingMinor),
      pendingByManager: [...byManager.entries()].map(([managerId, v]) => ({
        managerId,
        count: v.count,
        amountKd: minorToAmountString(v.minor),
      })),
    };
  }

  /**
   * Operational snapshot for the BRANCH_MANAGER `cash-status` page.
   *
   * SSoT for the KD figure
   * ----------------------
   *   `pendingDepositKd` is the **derived `MANAGER_<id>` balance from
   *   the LedgerProjectionService** — i.e. the canonical Σ(debit -
   *   credit) over every event that touches this manager's hands:
   *
   *     +DR MANAGER_<id> from driver→manager custody handovers
   *     +DR MANAGER_<id> from this manager's own CASH POS sales
   *                     (the actor-role-aware projection rule lands
   *                      manager-rung CASH sales here directly,
   *                      instead of misclassifying them as
   *                      DRIVER_<id> with no real driver)
   *     -CR MANAGER_<id> from VERIFIED bank deposits
   *
   *   This is the ONE figure that includes BOTH bag-handover cash
   *   AND a manager's own POS cash. Reading from `ManagerCashCustody`
   *   alone (the previous implementation) silently under-reported the
   *   second category and was the root cause of the
   *   "3.250 KWD missing on cash-status" report.
   *
   * Operational counts
   * ------------------
   *   `bagsCount` and `lastHandoverAt` are status counters / timestamps,
   *   not money figures, so they read directly from `ManagerCashCustody`.
   *
   * STRICT (Dastur §3 / brief PART 2):
   *   - NO totals beyond what the manager physically holds.
   *   - NO analytics / trends / averages.
   *   - NO ledger account exposure to the manager — the projection is
   *     called server-side and only the single KD figure leaks out.
   *
   * READ-ONLY. The projection covers the last 90d window which is the
   * brief's max range — anything older is not actionable for the
   * "deposit it today" surface anyway.
   */
  async getCashStatusSnapshot(
    managerId: string,
  ): Promise<ManagerCashStatusSnapshotDto> {
    const to = new Date();
    const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Single projection pass — every aggregate below is derived from
    // these entries, so the figures cannot drift apart.
    const [managerRow, bagsAgg, custodyAgg, entries, allDrivers] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: managerId },
          select: { id: true, fullName: true, branchId: true },
        }),
        // Operational counters (status counts + last-handover timestamp).
        this.prisma.managerCashCustody.aggregate({
          where: {
            managerId,
            status: {
              in: [
                ManagerCashCustodyStatus.PENDING_DEPOSIT,
                ManagerCashCustodyStatus.AWAITING_VERIFICATION,
              ],
            },
          },
          _count: { _all: true },
          _max: { receivedFromDriverAt: true },
        }),
        // KD aggregate of held bags (== driver→manager handovers still
        // in this manager's drawer). Used to break out the "drivers
        // sub-total" from the manager's own POS sub-total.
        this.prisma.managerCashCustody.aggregate({
          where: {
            managerId,
            status: {
              in: [
                ManagerCashCustodyStatus.PENDING_DEPOSIT,
                ManagerCashCustodyStatus.AWAITING_VERIFICATION,
              ],
            },
          },
          _sum: { amountKd: true },
        }),
        this.ledgerProjection.project({
          fromIso: from.toISOString(),
          toIso: to.toISOString(),
        }),
        // Reused for the per-driver high-risk list and the
        // "drivers awaiting handover" sub-total.
        this.cashService.getDriverBalances(),
      ]);

    const managerAccountId = `MANAGER_${managerId}`;

    // Manager-held total — single canonical figure (matches the
    // bug-fix from the previous turn).
    const managerAccount = this.ledgerProjection.aggregateAccounts(
      entries.filter((e) => e.accountId === managerAccountId),
    )[0];
    const pendingDepositKd = managerAccount?.balance ?? '0.0000';

    const custodyBagsTotalKd = custodyAgg._sum.amountKd
      ? new Prisma.Decimal(custodyAgg._sum.amountKd.toString()).toFixed(4)
      : '0.0000';

    // Manager's own POS cash = manager-held total − bag total. Both
    // figures are server-aggregated; the subtraction lives here, not
    // on the frontend.
    const managerOwnPosKd = new Prisma.Decimal(pendingDepositKd)
      .minus(new Prisma.Decimal(custodyBagsTotalKd))
      .toFixed(4);

    // ── Drivers in the manager's branch with cash still on them ────
    const branchDrivers = managerRow?.branchId
      ? allDrivers.drivers.filter((d) => d.branchId === managerRow.branchId)
      : allDrivers.drivers;
    const driversAtRisk = branchDrivers
      .filter((d) => new Prisma.Decimal(d.heldCashTotal).greaterThan(0))
      .map((d): DriverHandoverSummaryDto => {
        const ageMs = d.shiftStartedAt
          ? Date.now() - new Date(d.shiftStartedAt).getTime()
          : null;
        const ageHours = ageMs !== null ? Math.floor(ageMs / 3_600_000) : null;
        let riskLevel: DriverHandoverSummaryDto['riskLevel'] = 'NORMAL';
        if (ageHours !== null && ageHours >= 48) riskLevel = 'CRITICAL';
        else if (ageHours !== null && ageHours >= 24) riskLevel = 'WARNING';
        return {
          driverId: d.driverId,
          driverName: d.fullName,
          driverUsername: d.username,
          driverPhone: d.phone,
          heldCashKd: d.heldCashTotal,
          pendingOrderCount: d.pendingSettlementOrderCount,
          shiftStartedAt: d.shiftStartedAt
            ? new Date(d.shiftStartedAt).toISOString()
            : null,
          ageHours,
          riskLevel,
        };
      })
      .sort((a, b) => {
        // Worst risk + biggest amount first.
        const r = riskRank(b.riskLevel) - riskRank(a.riskLevel);
        if (r !== 0) return r;
        return new Prisma.Decimal(b.heldCashKd).comparedTo(
          new Prisma.Decimal(a.heldCashKd),
        );
      });

    const driversAwaitingHandoverKd = driversAtRisk
      .reduce(
        (acc, d) => acc.plus(new Prisma.Decimal(d.heldCashKd)),
        new Prisma.Decimal(0),
      )
      .toFixed(4);

    // ── Recent activity (last 10 events touching this manager OR a
    //    branch driver). Sourced from the projection so the UI sees
    //    exactly the same entries the auditor sees. ──
    const branchDriverIds = new Set(branchDrivers.map((d) => d.driverId));
    const branchDriverAccounts = new Set(
      [...branchDriverIds].map((id) => `DRIVER_${id}`),
    );
    const relevantEntries = entries.filter(
      (e) =>
        e.accountId === managerAccountId ||
        branchDriverAccounts.has(e.accountId),
    );
    // De-duplicate by txId — every event has a paired DR/CR; we only
    // need one row per transaction.
    const seenTx = new Set<string>();
    const deduped = relevantEntries
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .filter((e) => {
        if (seenTx.has(e.txId)) return false;
        seenTx.add(e.txId);
        return true;
      });
    const recentActivity = deduped.slice(0, 10).map(
      (e): ActivityEventDto => ({
        txId: e.txId,
        at: e.createdAt,
        amountKd: new Prisma.Decimal(
          (e.debit !== '0.0000' ? e.debit : e.credit) || '0',
        ).toFixed(4),
        kind: classifyActivity({
          meta: e.meta as unknown,
          accountId: e.accountId,
        }),
        actorAccountId: e.accountId,
        meta: e.meta as Record<string, unknown> | null,
      }),
    );

    const lastActivityAt = recentActivity[0]?.at ?? null;

    return {
      source: 'api/manager/cash-status',
      managerId,
      managerName: managerRow?.fullName ?? '',
      pendingDepositKd,
      managerOwnPosKd,
      custodyBagsTotalKd,
      driversAwaitingHandoverKd,
      bagsCount: bagsAgg._count._all,
      driversAtRiskCount: driversAtRisk.length,
      lastHandoverAt:
        bagsAgg._max.receivedFromDriverAt?.toISOString() ?? null,
      lastActivityAt,
      drivers: driversAtRisk,
      recentActivity,
      generatedAt: new Date().toISOString(),
    };
  }

  // ------------------------------------------------------------------ helpers
  private async requireBag(custodyId: string): Promise<ManagerCashCustody> {
    const bag = await this.prisma.managerCashCustody.findUnique({
      where: { id: custodyId },
    });
    if (!bag) throw new NotFoundException('Custody bag not found.');
    return bag;
  }

  private toRow(r: CustodyWithPeople): CustodyRowDto {
    const ageMs = Date.now() - r.receivedFromDriverAt.getTime();
    const ageHours = Math.max(0, Math.floor(ageMs / (60 * 60 * 1000)));
    const isUnsettled = r.status !== ManagerCashCustodyStatus.VERIFIED;
    return {
      id: r.id,
      managerId: r.managerId,
      managerName: r.manager.fullName,
      managerUsername: r.manager.username,
      managerPhone: r.manager.phone,
      driverId: r.driverId,
      driverName: r.driver.fullName,
      driverUsername: r.driver.username,
      branchId: r.branchId,
      branchName: r.branch?.name ?? null,
      shiftId: r.shiftId,
      amountKd: r.amountKd.toFixed(4),
      settledOrderCount: r.settledOrderCount,
      status: r.status,
      receivedFromDriverAt: r.receivedFromDriverAt.toISOString(),
      slipUploadedAt: r.slipUploadedAt?.toISOString() ?? null,
      depositSlipUrl: r.depositSlipUrl,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      rejectedAt: r.rejectedAt?.toISOString() ?? null,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt.toISOString(),
      ageHours,
      isOverdue: isUnsettled && ageMs >= CUSTODY_OVERDUE_MS,
    };
  }

  private summarise(rows: CustodyRowDto[]): AgingSummary {
    let pendingMinor = 0n;
    let overdueMinor = 0n;
    const bucket: Record<AgingBucket, number> = {
      FRESH: 0,
      WARNING_12H: 0,
      OVERDUE_24H: 0,
    };
    let pendingCount = 0;
    let awaitingCount = 0;
    let overdueCount = 0;
    for (const r of rows) {
      const minor = parseFixed4ToMinor(r.amountKd);
      if (r.status !== ManagerCashCustodyStatus.VERIFIED) {
        pendingMinor += minor;
      }
      if (r.isOverdue) {
        overdueCount += 1;
        overdueMinor += minor;
        bucket.OVERDUE_24H += 1;
      } else if (r.ageHours >= 12) {
        bucket.WARNING_12H += 1;
      } else {
        bucket.FRESH += 1;
      }
      if (r.status === ManagerCashCustodyStatus.PENDING_DEPOSIT) {
        pendingCount += 1;
      } else if (r.status === ManagerCashCustodyStatus.AWAITING_VERIFICATION) {
        awaitingCount += 1;
      }
    }
    return {
      pendingCount,
      awaitingVerificationCount: awaitingCount,
      overdueCount,
      totalPendingKd: minorToAmountString(pendingMinor),
      totalOverdueKd: minorToAmountString(overdueMinor),
      bucket,
    };
  }
}
