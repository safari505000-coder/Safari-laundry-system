import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DoubleEntryJournalService,
  JOURNAL_ACCOUNTS,
} from './double-entry-journal.service';

/**
 * خدمة القراءة من اليومية كمصدر رئيسي للذمم — V20.2 المرحلة 26 / 30.
 *
 * "اليومية = المصدر الأول. DebtLedgerEntry = عرض مشتق."
 *
 * واجهة القراءة الموحّدة لجميع المجاميع المحاسبية عند تفعيل علامة الميزة
 * `USE_JOURNAL_AS_SOURCE=true` أو `V20_4_FINAL_LEDGER=true`.
 * لا تُنفِّذ أي كتابة — جميع التعديلات تمر عبر `DoubleEntryJournalService`.
 * العلامة تُقرأ عند كل استدعاء لتمكين التبديل الحي بدون إعادة تشغيل.
 *
 * V20.2 Phase 26/30 journal-as-source read layer.
 *
 * "Journal = PRIMARY SOURCE. DebtLedgerEntry = derived view."
 *
 * Unified read surface for all journal-authoritative AR aggregates.
 * Active when `USE_JOURNAL_AS_SOURCE=true` or `V20_4_FINAL_LEDGER=true`.
 * Read-only — all writes go through `DoubleEntryJournalService`.
 * Flags are re-read per call to allow live toggle without restart.
 *
 * @since V20.2
 */

/**
 * لقطة ملخص من اليومية لحساب عميل واحد: رصيد الذمم والتزام المحفظة والإيراد المُعترَف به.
 * تُعيدها `getCustomerArSnapshot` وتُستخدم في Customer 360 وقوائم المشتركين
 * عند تفعيل `USE_JOURNAL_AS_SOURCE=true` أو `V20_4_FINAL_LEDGER=true`.
 *
 * Journal-derived AR snapshot for a single customer: AR balance, wallet
 * liability and recognised revenue. Returned by `getCustomerArSnapshot` and
 * used by Customer 360 and Subscribers list when journal-as-source is enabled.
 *
 * @since V20.2
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
  /**
   * يُعيد الذمة المستحقة من اليومية مع تثبيت القيم السالبة عند الصفر.
   * القيم السالبة تعني دفع زائدًا من العميل — تُعالَج في وحدة التدقيق.
   * تُستخدم في صفحات "المديونية" و"المشتركين" كمصدر موحّد للذمة.
   *
   * Returns customer outstanding debt from journal AR, clamping negatives to 0.
   * Negative values indicate overpayment — handled by the audit module.
   * Used by Outstanding and Subscribers pages as the unified debt source.
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns الذمة المستحقة (≥ 0) | Outstanding debt (≥ 0)
   * @since V20.2
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
   * المصدر الرسمي لرصيد الديون في V20.3 — قراءة حساب 1300 من اليومية.
   * يستبدل كل استهلاك `wallet.debt` الذي يتطلب الرقم المصرفي الدقيق.
   * يُثبِّت عند الصفر (القيم السالبة تُعرض عبر `getCustomerArSnapshot`).
   *
   * V20.3 Phase 35 canonical debt accessor — reads live AR on account 1300.
   * Replaces `wallet.debt` consumers needing the bank-grade figure.
   * Clamped at 0; signed values available via `getCustomerArSnapshot`.
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns رصيد الدين الرسمي (≥ 0) | Canonical debt balance (≥ 0)
   * @since V20.3
   */
  async getCustomerDebtFromJournalAR(
    customerId: string,
  ): Promise<Prisma.Decimal> {
    return this.getCustomerOutstandingFromJournal(customerId);
  }
}
