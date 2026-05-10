import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DoubleEntryJournalService,
  JOURNAL_ACCOUNTS,
} from './double-entry-journal.service';

/**
 * V20.2 — Phase 26 / Phase 30 helper.
 *
 * "Journal = PRIMARY SOURCE. DebtLedgerEntry = derived view."
 *
 * This service is the single, well-typed read surface for all
 * journal-authoritative aggregates that downstream APIs (Customer
 * 360, Subscribers list, Outstanding) call when the `Phase 30`
 * feature flag is on. It deliberately does NOT mutate; writes
 * still go through {@link DoubleEntryJournalService} and the
 * existing flows.
 *
 * The flag is read once per call via {@link isJournalAsSourceEnabled}
 * so operators can enable/disable at runtime via env without a
 * deploy. Default behaviour is to read from `DebtLedgerEntry`
 * (preserves the v4 contract) — flipping the flag to `true` makes
 * the journal authoritative for the listed APIs.
 */

export type JournalCustomerArSnapshot = {
  /** Net AR balance from JournalEntry/JournalLine (debits − credits on 1300). */
  arBalanceKd: Prisma.Decimal;
  /** Net wallet liability from JournalLine on 2100 (credits − debits). */
  walletLiabilityKd: Prisma.Decimal;
  /** Cumulative revenue from JournalLine credits on 4100. */
  revenueRecognisedKd: Prisma.Decimal;
};

@Injectable()
export class JournalSourceService {
  private readonly logger = new Logger(JournalSourceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: DoubleEntryJournalService,
  ) {}

  /**
   * V20.2 — Phase 30 read-switch flag.
   *
   * Returns true only when the operator explicitly opts in via
   * `USE_JOURNAL_AS_SOURCE=true`. Any other value (unset, "false",
   * "0", "off") returns false. We re-read the env on every call so
   * tests and operators can flip without a process restart.
   */
  isJournalAsSourceEnabled(): boolean {
    // V20.4 — Phase 4/7 master switch. V20_4_FINAL_LEDGER=true
    // forces journal-as-source on regardless of the per-feature
    // flag, so operators can finalise the migration with one
    // env change.
    const masterFlag = (process.env.V20_4_FINAL_LEDGER ?? '')
      .toString()
      .trim()
      .toLowerCase();
    if (
      masterFlag === 'true' ||
      masterFlag === '1' ||
      masterFlag === 'on' ||
      masterFlag === 'yes'
    ) {
      return true;
    }
    const v = (process.env.USE_JOURNAL_AS_SOURCE ?? '')
      .toString()
      .trim()
      .toLowerCase();
    return v === 'true' || v === '1' || v === 'on' || v === 'yes';
  }

  /**
   * Phase 26 — single-customer AR snapshot computed exclusively
   * from the journal. Mirrors `getCustomerNetDebtFromDebtLedgerAgg`
   * shape but uses Journal as the source of truth.
   *
   * Result is the CURRENT balance:
   *   arBalanceKd   = Σ(line.debit − line.credit) on AR account.
   *   walletLiabilityKd = Σ(line.credit − line.debit) on WALLET_LIABILITY.
   *   revenueRecognisedKd = Σ(line.credit) on REVENUE.
   *
   * Read-only. Safe to call inside or outside a transaction; uses
   * the bound PrismaService.
   */
  async getCustomerArSnapshot(
    customerId: string,
  ): Promise<JournalCustomerArSnapshot> {
    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { customerId } },
      select: {
        debit: true,
        credit: true,
        account: { select: { code: true } },
      },
    });
    let ar = new Prisma.Decimal(0);
    let wallet = new Prisma.Decimal(0);
    let revenue = new Prisma.Decimal(0);
    for (const line of lines) {
      const code = line.account.code;
      if (code === JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE) {
        ar = ar.add(line.debit).sub(line.credit);
      } else if (code === JOURNAL_ACCOUNTS.WALLET_LIABILITY) {
        wallet = wallet.add(line.credit).sub(line.debit);
      } else if (code === JOURNAL_ACCOUNTS.REVENUE) {
        revenue = revenue.add(line.credit).sub(line.debit);
      }
    }
    return {
      arBalanceKd: ar,
      walletLiabilityKd: wallet,
      revenueRecognisedKd: revenue,
    };
  }

  /**
   * Phase 26 — derived "outstanding debt" from the journal. AR
   * balance can be negative if customers overpaid; clamp at 0 for
   * the "outstanding" semantic that Outstanding / Subscribers
   * tiles want. Overpayment surfacing is a separate signal handled
   * by the audit module.
   */
  async getCustomerOutstandingFromJournal(
    customerId: string,
  ): Promise<Prisma.Decimal> {
    const snap = await this.getCustomerArSnapshot(customerId);
    return snap.arBalanceKd.lessThan(0)
      ? new Prisma.Decimal(0)
      : snap.arBalanceKd;
  }

  /**
   * V20.3 — Phase 35 canonical debt accessor.
   *
   * The "true" customer debt under V20.3 is the live AR balance
   * on account 1300. Replaces every `wallet.debt` consumer that
   * wants the bank-grade number; also clamps at 0 (overpayments
   * surface via {@link getCustomerArSnapshot} for consumers that
   * want the signed value).
   */
  async getCustomerDebtFromJournalAR(
    customerId: string,
  ): Promise<Prisma.Decimal> {
    return this.getCustomerOutstandingFromJournal(customerId);
  }
}
