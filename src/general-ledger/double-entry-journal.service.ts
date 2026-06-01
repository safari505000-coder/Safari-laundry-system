import { ConflictException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PosPaymentMethod, Prisma } from '@prisma/client';
import { DebtSource } from '../finance/enums/debt-source.enum';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialPeriodsService } from '../finance/periods/financial-periods.service';

// Phase 0: pure helpers/constants/formatters now live in a sibling module and
// are re-exported so external import paths stay unchanged.
export * from './double-entry-journal.helpers';
import {
  JOURNAL_ACCOUNTS,
  UUID_SEGMENT,
  normalizeLegacyJournalSourceRef,
  parseSubscriptionIdFromJournalRef,
  parseOrderIdFromInvoiceJournalRef,
  paymentMethodLabelFromMeta,
  inferPaymentChannelArFromJournalLines,
  CriticalJournalFailureError,
  CRITICAL_FAILURE_THRESHOLD,
  CRITICAL_FAILURE_WINDOW_MS,
  JournalStatementRow,
  CallCenterBankStatementRow,
  BANK_STATEMENT_PAY_IN_CODES,
  aggregateJournalEntryForBankColumns,
  entryRefTail,
  describeJournalEntry,
  parsePlanNameFromContextLabel,
  describeJournalEntryForCustomerFacing,
  humanizeJournalSourceRef,
} from './double-entry-journal.helpers';

// Service-internal operation contracts (kept with the writer they describe).
type Db = PrismaService | Prisma.TransactionClient;

type JournalLineInput = {
  accountCode: string;
  debit?: Prisma.Decimal | string | number;
  credit?: Prisma.Decimal | string | number;
  meta?: Prisma.InputJsonValue;
};

type AppendJournalInput = {
  source: string;
  sourceRef: string;
  actorUserId: string;
  customerId?: string | null;
  orderId?: string | null;
  /**
   * V20.5 — Phase 9 branch attribution. Optional and nullable;
   * pre-Phase 9 callers continue to work unchanged. New writers
   * pass the resolved branch (handover shift → user → null).
   */
  branchId?: string | null;
  /**
   * V20.6 — Phase 1 period-lock attribution.
   *
   * Effective accounting date used by `FinancialPeriodsService.assertWriteAllowed`
   * to decide whether the (year, month) the row falls into is OPEN
   * or CLOSED. Defaults to "now" when omitted.
   *
   * Pre-V20.6 callers do not need to change — the guard derives the
   * period from the current timestamp, which matches the previous
   * implicit behaviour.
   */
  effectiveAt?: Date | null;
  /**
   * V20.6 — Phase 1 reversal opt-in.
   *
   * When `true`, this entry is ALLOWED into a CLOSED period (a
   * violation row is still recorded for the auditor — it just
   * doesn't reject the write). Set this only on REVERSAL writers
   * such as `appendInvoiceCancellationEntry` and
   * `appendSubscriptionRefundEntry`.
   */
  allowReversal?: boolean;
  lines: JournalLineInput[];
};

type MirrorDebtLedgerInput = {
  source: DebtSource | string;
  amount: Prisma.Decimal | string | number;
  sourceRef?: string | null;
  actorUserId?: string | null;
  customerId: string;
  orderId?: string | null;
  paymentMethod?: PosPaymentMethod | string | null;
  note?: string | null;
};

@Injectable()
export class DoubleEntryJournalService {
  private readonly logger = new Logger(DoubleEntryJournalService.name);

  private logJournalWriteFailure(
    errorCode: string | null,
    message: string,
  ): void {
    this.logger.error(
      `[JOURNAL_WRITE_FAILED] code=${errorCode ?? 'UNKNOWN'} message=${message.slice(0, 240)}`,
    );
  }

  /**
   * V20.6 — Phase 1 enforcement flag.
   *
   * When `PERIOD_LOCK_ENFORCE !== 'true'` the guard is skipped
   * entirely (current behaviour). When `'true'`, every
   * `appendBalanced` call falls through `assertWriteAllowed`
   * before any journal row is created. Read at every call so an
   * operator can flip the flag without restarting the process
   * (useful during incident response).
   */
  private isPeriodLockEnforced(): boolean {
    return process.env.PERIOD_LOCK_ENFORCE === 'true';
  }

  /**
   * Fail-closed switch for the two CRITICAL journal wrappers only:
   * {@link appendExternalPaymentEntrySafe} and
   * {@link appendInvoiceIssuanceEntrySafe}.
   *
   * When `JOURNAL_FAIL_CLOSED_CRITICAL === 'true'`, a journal write
   * failure on those paths (after period-lock re-throw and P2002
   * idempotency recovery, and AFTER the failure is logged +
   * persisted to `JournalFailureLog`) re-throws the original error
   * so the surrounding business `$transaction` ROLLS BACK — no
   * payment / invoice is committed without its matching journal
   * entry.
   *
   * When unset / not `'true'`, behaviour is unchanged (swallow +
   * trip breaker + return null). Read at every call so an operator
   * can flip the flag without a restart, mirroring
   * {@link isPeriodLockEnforced}.
   *
   * Scope is deliberately limited to the two highest-frequency
   * money-movement entries; the remaining `*Safe` wrappers keep
   * the legacy fail-open contract for now.
   */
  private isFailClosedCriticalEnabled(): boolean {
    return process.env.JOURNAL_FAIL_CLOSED_CRITICAL === 'true';
  }

  /**
   * CORRUPT-4: Re-throw period lock ConflictException from every Safe wrapper.
   * A ConflictException whose message includes 'CLOSED' or 'period' is a
   * period-lock rejection — it MUST abort the surrounding business transaction
   * so the journal, wallet, and order state stay consistent.
   */
  private rethrowIfPeriodLock(err: unknown): void {
    if (err instanceof ConflictException) {
      const msg = (err.message ?? '').toLowerCase();
      if (msg.includes('closed') || msg.includes('period')) {
        throw err;
      }
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FinancialPeriodsService)
    @Optional()
    private readonly periodGuard: FinancialPeriodsService | null = null,
  ) {}

  /**
   * يكتب قيدًا محاسبيًا متوازنًا في دفتر اليومية.
   * يتحقق من: وجود مُنفِّذ العملية، صحة `sourceRef`، ووجود سطرَين على الأقل،
   * عدم سلبية القيم، توازن المدين والدائن (±0.001 د.ك)، وصحة رموز الحسابات.
   * القيد مكرر (idempotent): إذا وُجد `sourceRef` في قاعدة البيانات يُعيد القيد القائم.
   * يطبّق قفل الفترة المحاسبية إذا كان `PERIOD_LOCK_ENFORCE=true`.
   *
   * Writes a balanced double-entry journal record.
   * Validates: actor present, non-empty `sourceRef`, at least two lines,
   * no negative values, debit/credit balance (±0.001 KWD), all account codes exist.
   * Idempotent on `sourceRef` — returns the existing entry on duplicate.
   * Applies period-lock guard when `PERIOD_LOCK_ENFORCE=true`.
   *
   * @param db - عميل Prisma أو معاملة نشطة | Prisma client or active transaction
   * @param input - بيانات القيد (المصدر، المرجع، الأسطر، إلخ) | Entry data
   * @returns معرف القيد المُنشأ أو القائم | ID of created or existing entry
   * @throws `JOURNAL_ACTOR_REQUIRED` إذا كان `actorUserId` فارغًا
   * @throws `JOURNAL_SOURCE_REF_REQUIRED` إذا كان `sourceRef` فارغًا
   * @throws `JOURNAL_MINIMUM_TWO_LINES` إذا كانت الأسطر أقل من اثنين
   * @throws `UNBALANCED_JOURNAL` إذا لم يتوازن المدين مع الدائن
   * @throws `JOURNAL_ACCOUNT_NOT_FOUND:<code>` إذا كان رمز الحساب غير موجود في قاعدة البيانات
   * @since V20.1
   */
  async appendBalanced(
    db: Db,
    input: AppendJournalInput,
  ): Promise<{ id: string }> {
    if (!input.actorUserId) throw new Error('JOURNAL_ACTOR_REQUIRED');
    if (!input.sourceRef?.trim()) throw new Error('JOURNAL_SOURCE_REF_REQUIRED');
    if (input.lines.length < 2) throw new Error('JOURNAL_MINIMUM_TWO_LINES');

    // V20.6 — Phase 1: idempotency check FIRST. A second call with
    // the same sourceRef must always short-circuit with the existing
    // row, even on a CLOSED period. Reasoning: the row was committed
    // when the period was OPEN; rejecting the retry now would surface
    // a phantom failure to a caller that already succeeded.
    const existing = await db.journalEntry.findUnique({
      where: { sourceRef: input.sourceRef },
      select: { id: true },
    });
    if (existing) return existing;

    // V20.6 — Phase 1 period-lock guard. Only fires when:
    //   1) PERIOD_LOCK_ENFORCE=true, AND
    //   2) the FinancialPeriodsService is wired into the DI graph
    //      (it is, via the @Global() PeriodsModule from V20.6).
    // The guard logs a violation row inside its own connection so
    // the audit trail survives even if the writer's transaction
    // rolls back as a result of the throw.
    if (this.isPeriodLockEnforced() && this.periodGuard) {
      const effectiveAt = input.effectiveAt ?? new Date();
      await this.periodGuard.assertWriteAllowed({
        effectiveAt,
        actorUserId: input.actorUserId ?? null,
        writerName: `DoubleEntryJournalService.${input.source}`,
        sourceRef: input.sourceRef,
        allowReversal: input.allowReversal ?? false,
        payload: {
          customerId: input.customerId ?? null,
          orderId: input.orderId ?? null,
          branchId: input.branchId ?? null,
        },
      });
    }

    const normalized = input.lines.map((line) => ({
      ...line,
      debit: this.decimal(line.debit ?? 0),
      credit: this.decimal(line.credit ?? 0),
    }));

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    for (const line of normalized) {
      if (line.debit.lessThan(0) || line.credit.lessThan(0)) {
        throw new Error('NEGATIVE_JOURNAL_LINE');
      }
      if (line.debit.gt(0) && line.credit.gt(0)) {
        throw new Error('AMBIGUOUS_JOURNAL_LINE');
      }
      if (line.debit.equals(0) && line.credit.equals(0)) {
        throw new Error('EMPTY_JOURNAL_LINE');
      }
      totalDebit = totalDebit.add(line.debit);
      totalCredit = totalCredit.add(line.credit);
    }

    if (totalDebit.sub(totalCredit).abs().gt(new Prisma.Decimal('0.001'))) {
      throw new Error('UNBALANCED_JOURNAL');
    }

    const accounts = await db.account.findMany({
      where: {
        code: { in: normalized.map((line) => line.accountCode) },
        isActive: true,
      },
      select: { id: true, code: true },
    });
    const accountIdByCode = new Map(accounts.map((a) => [a.code, a.id]));
    for (const line of normalized) {
      if (!accountIdByCode.has(line.accountCode)) {
        throw new Error(`JOURNAL_ACCOUNT_NOT_FOUND:${line.accountCode}`);
      }
    }

    return db.journalEntry.create({
      data: {
        source: input.source,
        sourceRef: input.sourceRef,
        actorUserId: input.actorUserId,
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        branchId: input.branchId ?? null,
        lines: {
          create: normalized.map((line) => ({
            accountId: accountIdByCode.get(line.accountCode)!,
            debit: line.debit,
            credit: line.credit,
            ...(line.meta !== undefined ? { meta: line.meta } : {}),
          })),
        },
      },
      select: { id: true },
    });
  }

  /**
   * V20.1-v4 (was v2 Phase 9) — Non-blocking mirror with persistent
   * failure log and circuit breaker.
   *
   * Wraps {@link mirrorDebtLedgerEntry} so journal-side failures
   * (missing seeded account, balance check, unique constraint, DB
   * timeout, …) NEVER abort the surrounding business transaction
   * for the FIRST few attempts. Every failure:
   *   1) emits a `[JOURNAL_WRITE_FAILED]` log line
   *   2) persists a row in `JournalFailureLog` (best-effort: a
   *      failed persist is itself swallowed, so a degraded DB
   *      cannot rollback the business flow)
   *   3) checks recent failure density for the customer; if more
   *      than {@link CRITICAL_FAILURE_THRESHOLD} failures occurred
   *      in {@link CRITICAL_FAILURE_WINDOW_MS}, throws
   *      {@link CriticalJournalFailureError} so the caller's
   *      transaction rolls back and the operator is forced to
   *      triage before the divergence accumulates further.
   *
   * The breaker uses a SEPARATE Prisma client (`this.prisma`),
   * not the transaction client `db`, so the failure log persists
   * even if the surrounding transaction rolls back.
   */
  /**
   * @alias appendJournalMirrorEntrySafe — canonical name since V1.7.0.
   * DebtLedger is deleted; the method now appends a balanced journal
   * mirror entry (DR asset/AR / CR AR/revenue). The old name is kept
   * to avoid a disruptive rename across 15+ callers.
   */
  appendJournalMirrorEntrySafe = this.mirrorDebtLedgerEntrySafe.bind(this);

  async mirrorDebtLedgerEntrySafe(
    db: Db,
    input: MirrorDebtLedgerInput,
  ): Promise<{ id: string } | null> {
    try {
      return await this.mirrorDebtLedgerEntry(db, input);
    } catch (err) {
      // FINANCIAL HARDENING — route through the shared Phase 16 handler so
      // this wrapper honours JOURNAL_FAIL_CLOSED_CRITICAL too. Default
      // (flag off) behaviour is unchanged: persist + trip breaker + null.
      return this.handleCriticalSafeFailure(db, err, input);
    }
  }

  /**
   * Persist a journal failure to {@link JournalFailureLog}. Uses the
   * raw prisma instance (not the transaction client) so the row
   * survives a rollback of the surrounding business transaction.
   * Best-effort: a failure to persist the failure is logged but
   * never propagated.
   */
  private async persistFailure(
    input: MirrorDebtLedgerInput,
    message: string,
    errorCode: string | null,
  ): Promise<void> {
    try {
      const amountDecimal =
        input.amount instanceof Prisma.Decimal
          ? input.amount
          : new Prisma.Decimal(String(input.amount));
      await this.prisma.journalFailureLog.create({
        data: {
          customerId: input.customerId ?? null,
          orderId: input.orderId ?? null,
          source: typeof input.source === 'string' ? input.source : String(input.source),
          sourceRef: input.sourceRef ?? null,
          amount: amountDecimal,
          errorCode,
          errorMessage: message,
          context: {
            paymentMethod: input.paymentMethod ?? null,
            note: input.note ?? null,
          },
        },
      });
    } catch (persistErr) {
      this.logger.error(
        `[JOURNAL_FAILURE_PERSIST_FAILED] customerId=${input.customerId} message=${(persistErr as Error)?.message}`,
      );
    }
  }

  /**
   * Phase 16 circuit breaker. Counts persisted failures for the
   * customer in the recent window; throws
   * {@link CriticalJournalFailureError} if the threshold is exceeded.
   *
   * Note: failures are counted from `JournalFailureLog`, NOT from
   * an in-process counter, so the breaker survives process restarts
   * and works correctly across horizontally-scaled instances.
   */
  private async tripBreakerIfNeeded(customerId: string | null | undefined): Promise<void> {
    if (!customerId) return;
    try {
      const since = new Date(Date.now() - CRITICAL_FAILURE_WINDOW_MS);
      const count = await this.prisma.journalFailureLog.count({
        where: { customerId, createdAt: { gte: since } },
      });
      if (count > CRITICAL_FAILURE_THRESHOLD) {
        throw new CriticalJournalFailureError(
          customerId,
          count,
          CRITICAL_FAILURE_WINDOW_MS,
        );
      }
    } catch (err) {
      if (err instanceof CriticalJournalFailureError) throw err;
      this.logger.error(
        `[JOURNAL_FAILURE_BREAKER_CHECK_FAILED] customerId=${customerId} message=${(err as Error)?.message}`,
      );
    }
  }

  /**
   * Shared catch-path for the two CRITICAL `*Safe` wrappers
   * ({@link appendExternalPaymentEntrySafe} and
   * {@link appendInvoiceIssuanceEntrySafe}). Runs the full Phase 16
   * safety sequence in a fixed order:
   *
   *   1. Re-throw period-lock conflicts (always fail-closed).
   *   2. P2002 idempotency recovery — a concurrent writer already
   *      committed this `sourceRef`; return the existing entry so a
   *      benign race never rolls back a real payment/invoice.
   *   3. Emit `[JOURNAL_WRITE_FAILED]` + persist a `JournalFailureLog`
   *      row on the SEPARATE prisma client (survives rollback).
   *   4. Fail-closed branch ({@link isFailClosedCriticalEnabled}):
   *      re-throw the original error → the caller's `$transaction`
   *      rolls back. The breaker is intentionally skipped here — the
   *      abort already prevents the divergence the breaker guards
   *      against.
   *   5. Legacy fail-open branch (flag off): trip the breaker and
   *      return null (unchanged behaviour).
   *
   * @throws the original `err` when fail-closed is enabled and the
   *         failure is not a recoverable P2002 / period-lock case.
   */
  private async handleCriticalSafeFailure(
    db: Db,
    err: unknown,
    failureInput: MirrorDebtLedgerInput,
  ): Promise<{ id: string } | null> {
    this.rethrowIfPeriodLock(err);

    const sourceRef = failureInput.sourceRef?.trim();
    if (
      sourceRef &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const existing = await db.journalEntry.findUnique({
        where: { sourceRef },
        select: { id: true },
      });
      if (existing) return existing;
    }

    const message = (err as Error)?.message ?? String(err);
    const errorCode =
      err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
    this.logJournalWriteFailure(errorCode, message);
    await this.persistFailure(failureInput, message, errorCode);

    if (this.isFailClosedCriticalEnabled()) {
      throw err;
    }

    await this.tripBreakerIfNeeded(failureInput.customerId);
    return null;
  }

  /**
   * V20.3 — Phase 31 invoice issuance journal entry.
   *
   * Writes the full invoice amount to AR + REVENUE on order
   * issuance so the journal reflects the gross receivable, not
   * the post-wallet remainder. This is the "true" accounting
   * model: every invoice is recognised as revenue at issuance,
   * and subsequent payments (wallet absorption, cash, KNET,
   * payment-link) credit AR back down.
   *
   * Lines:
   *   DR ACCOUNTS_RECEIVABLE  (full invoice amount — what the customer owes)
   *   CR REVENUE              (full invoice amount — service value rendered)
   *
   * sourceRef: `JOURNAL:INVOICE_ISSUED:<orderId>`. Deterministic so
   * `appendBalanced` is idempotent on retry / re-entry.
   */
  async appendInvoiceIssuanceEntry(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    return this.appendBalanced(db, {
      source: 'INVOICE_ISSUED',
      sourceRef: `JOURNAL:INVOICE_ISSUED:${input.orderId}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          debit: amount,
          meta: { event: 'INVOICE_ISSUED', orderId: input.orderId },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.REVENUE,
          credit: amount,
          meta: { event: 'INVOICE_ISSUED', orderId: input.orderId },
        },
      ],
    });
  }

  /**
   * V20.3 — Phase 31 safe variant. Same Phase 16 contract as
   * {@link mirrorDebtLedgerEntrySafe}: failure logs + persists +
   * trips breaker, never aborts the surrounding business
   * transaction directly.
   */
  async appendInvoiceIssuanceEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendInvoiceIssuanceEntry(db, input);
    } catch (err) {
      // CRITICAL wrapper: fail-closed when JOURNAL_FAIL_CLOSED_CRITICAL=true.
      return this.handleCriticalSafeFailure(db, err, {
        source: 'INVOICE_ISSUED',
        sourceRef: `JOURNAL:INVOICE_ISSUED:${input.orderId}`,
        customerId: input.customerId,
        orderId: input.orderId,
        amount: input.amount,
        actorUserId: input.actorUserId,
      });
    }
  }

  /**
   * V20.3 — Phase 33 wallet absorption journal entry (true model).
   *
   * The literal V20.2 prompt's shape: DR WALLET_LIABILITY / CR
   * ACCOUNTS_RECEIVABLE. Valid ONLY when `appendInvoiceIssuanceEntry`
   * has already DEBITED AR by the FULL invoice amount; otherwise
   * crediting AR pushes it negative. Use under
   * `V20_3_TRUE_ACCOUNTING=true` only.
   *
   * Lines:
   *   DR WALLET_LIABILITY     (we owe the customer N less)
   *   CR ACCOUNTS_RECEIVABLE  (customer owes us N less)
   *
   * sourceRef: `JOURNAL:WALLET_ABSORPTION_V3:<orderId>:APPLIED`
   * (distinct from the V20.2 sourceRef so both can coexist
   * during the migration window).
   */
  async appendWalletAbsorptionEntryV3(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    return this.appendBalanced(db, {
      source: 'WALLET_ABSORPTION_V3',
      sourceRef: `JOURNAL:WALLET_ABSORPTION_V3:${input.orderId}:APPLIED`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
          debit: amount,
          meta: { event: 'WALLET_ABSORPTION_V3', orderId: input.orderId },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          credit: amount,
          meta: { event: 'WALLET_ABSORPTION_V3', orderId: input.orderId },
        },
      ],
    });
  }

  /**
   * V20.3 — Phase 33 safe variant.
   */
  async appendWalletAbsorptionEntryV3Safe(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendWalletAbsorptionEntryV3(db, input);
    } catch (err) {
      // FINANCIAL HARDENING — fail-closed-aware (default unchanged).
      return this.handleCriticalSafeFailure(db, err, {
        source: 'WALLET_ABSORPTION_V3',
        sourceRef: `JOURNAL:WALLET_ABSORPTION_V3:${input.orderId}:APPLIED`,
        customerId: input.customerId,
        orderId: input.orderId,
        amount: input.amount,
        actorUserId: input.actorUserId,
      });
    }
  }

  /**
   * V20.3 — Phase 34 external payment journal entry.
   *
   * Writes `DR <CASH/BANK_KNET/BANK_ONLINE> / CR ACCOUNTS_RECEIVABLE`
   * for every external payment. Replaces the V20.1
   * `mirrorDebtLedgerEntry(PAYMENT, …)` path under V20.3 — the
   * substantive difference is that this entry is keyed by the
   * payment event (deterministic on the `paymentRef`) rather than
   * by the DebtLedgerEntry sourceRef, which is itself derived
   * data under the new model.
   *
   * sourceRef: `JOURNAL:EXTERNAL_PAYMENT:<paymentRef>` (caller
   * provides the unique `paymentRef`, e.g. `<orderId>:CASH`,
   * `<orderId>:KNET:<txId>`, `<paymentBundleId>:GATEWAY`).
   */
  async appendExternalPaymentEntry(
    db: Db,
    input: {
      customerId: string;
      orderId?: string | null;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
      paymentMethod: PosPaymentMethod | string;
      paymentRef: string;
      note?: string | null;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    if (!input.paymentRef?.trim()) {
      throw new Error('JOURNAL_EXTERNAL_PAYMENT_REF_REQUIRED');
    }
    const debitAccount = this.externalPaymentAssetAccount(input.paymentMethod);
    return this.appendBalanced(db, {
      source: 'EXTERNAL_PAYMENT',
      sourceRef: `JOURNAL:EXTERNAL_PAYMENT:${input.paymentRef}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId ?? null,
      lines: [
        {
          accountCode: debitAccount,
          debit: amount,
          meta: {
            event: 'EXTERNAL_PAYMENT',
            paymentMethod: input.paymentMethod,
            note: input.note ?? null,
          },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          credit: amount,
          meta: { event: 'EXTERNAL_PAYMENT', paymentRef: input.paymentRef },
        },
      ],
    });
  }

  /**
   * V20.3 — Phase 34 safe variant.
   */
  async appendExternalPaymentEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId?: string | null;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
      paymentMethod: PosPaymentMethod | string;
      paymentRef: string;
      note?: string | null;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendExternalPaymentEntry(db, input);
    } catch (err) {
      // CRITICAL wrapper: fail-closed when JOURNAL_FAIL_CLOSED_CRITICAL=true.
      return this.handleCriticalSafeFailure(db, err, {
        source: 'EXTERNAL_PAYMENT',
        sourceRef: `JOURNAL:EXTERNAL_PAYMENT:${input.paymentRef}`,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        amount: input.amount,
        actorUserId: input.actorUserId,
        paymentMethod: input.paymentMethod,
      });
    }
  }

  /**
   * V20.3 — resolve the asset account for an external payment.
   * Mirrors the {@link paymentAssetAccount} branching but accepts
   * a paymentMethod directly (no DebtLedgerEntry to inspect).
   */
  private externalPaymentAssetAccount(
    method: PosPaymentMethod | string,
  ): string {
    if (method === PosPaymentMethod.KNET) return JOURNAL_ACCOUNTS.BANK_KNET;
    if (
      method === PosPaymentMethod.ONLINE ||
      method === PosPaymentMethod.PAYMENT_LINK
    ) {
      return JOURNAL_ACCOUNTS.BANK_ONLINE;
    }
    if (method === PosPaymentMethod.CASH) return JOURNAL_ACCOUNTS.CASH;
    throw new Error(`UNKNOWN_PAYMENT_ASSET_ACCOUNT:${method}`);
  }

  /**
   * V20.2 — Phase 27 wallet-absorption journal entry (revised).
   *
   * Writes a balanced, AR-neutral journal entry that recognises
   * the wallet portion of an invoice as revenue while reducing
   * the wallet liability we owed the customer. Required to satisfy
   * the v4 invariant "every wallet deduction has 3 entries"
   * (TransactionHistory + DebtLedgerEntry PAYMENT + JournalEntry).
   *
   * Lines:
   *   DR WALLET_LIABILITY  (we owe the customer 5 KD less)
   *   CR REVENUE           (5 KD of service was rendered)
   *
   * Why CR REVENUE and not CR ACCOUNTS_RECEIVABLE (deviation from
   * the literal V20.2 prompt):
   *   • The matching `INVOICE_SHORTFALL` row already carries the
   *     post-wallet remainder (e.g. SHORTFALL = 15 KD when the
   *     invoice was 20 KD and wallet absorbed 5 KD), so the AR
   *     journal balance for that order is 15 KD.
   *   • Crediting AR by another 5 KD here would push journal AR
   *     to 10 KD while the DebtLedgerEntry net stays at 15 KD,
   *     tripping the Phase 29 lockstep on every wallet absorption.
   *   • The cleanest fix (gross-invoice SHORTFALL = full 20 KD,
   *     plus a separate AR-issuance entry) requires changing the
   *     SHORTFALL semantic across the entire system and is queued
   *     for V20.3. Until then, CR REVENUE keeps the journal AR in
   *     lockstep with the DebtLedger AR while still recognising
   *     the wallet portion as revenue.
   *
   * sourceRef: `JOURNAL:WALLET_ABSORPTION:<orderId>:APPLIED`
   * (deterministic — appendBalanced is idempotent on sourceRef).
   */
  async appendWalletAbsorptionEntry(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    return this.appendBalanced(db, {
      source: 'WALLET_ABSORPTION',
      sourceRef: `JOURNAL:WALLET_ABSORPTION:${input.orderId}:APPLIED`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
          debit: amount,
          meta: { event: 'WALLET_ABSORPTION', orderId: input.orderId },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.REVENUE,
          credit: amount,
          meta: { event: 'WALLET_ABSORPTION', orderId: input.orderId },
        },
      ],
    });
  }

  /**
   * @deprecated V1.7.0 — prefer {@link appendWalletAbsorptionEntryV3Safe} when
   * `V20_3_TRUE_ACCOUNTING=true`. This V20.2 path (DR WALLET_LIABILITY / CR REVENUE)
   * remains active for non-true-accounting deployments. Do not delete until
   * all deployments have `V20_3_TRUE_ACCOUNTING=true`.
   */
  async appendWalletAbsorptionEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendWalletAbsorptionEntry(db, input);
    } catch (err) {
      // FINANCIAL HARDENING — fail-closed-aware (default unchanged).
      return this.handleCriticalSafeFailure(db, err, {
        source: 'WALLET_ABSORPTION',
        sourceRef: `JOURNAL:WALLET_ABSORPTION:${input.orderId}:APPLIED`,
        customerId: input.customerId,
        orderId: input.orderId,
        amount: input.amount,
        actorUserId: input.actorUserId,
      });
    }
  }

  /**
   * يُنشئ قيد اليومية المقابل لقيد دفتر الديون (DebtLedgerEntry).
   * يُعالج نوعَي المصدر: `PAYMENT` (مدين حساب الأصول / دائن الذمم)
   * و`INVOICE_SHORTFALL / SUBSCRIPTION_OVERUSE` (مدين الذمم / دائن الإيرادات).
   * يتجاهل مدفوعات المحفظة (`PAYMENT:WALLET:`) لأن `appendWalletAbsorptionEntry`
   * تتولى معالجتها بشكل منفصل.
   * تُستخدم بشكل رئيسي في مسار V20.1 - V20.2؛ مسار V20.3+ يُفضّل
   * `appendExternalPaymentEntry` و`appendInvoiceIssuanceEntry`.
   *
   * Creates a journal entry mirroring a `DebtLedgerEntry` mutation.
   * Handles two source types: `PAYMENT` (DR asset / CR AR) and
   * `INVOICE_SHORTFALL / SUBSCRIPTION_OVERUSE` (DR AR / CR REVENUE).
   * Wallet payments (`PAYMENT:WALLET:`) are skipped — handled separately
   * by `appendWalletAbsorptionEntry`. Primarily used in V20.1–V20.2 path;
   * V20.3+ prefers `appendExternalPaymentEntry` / `appendInvoiceIssuanceEntry`.
   *
   * @param db - عميل Prisma أو معاملة نشطة | Prisma client or active transaction
   * @param input - بيانات مرآة قيد الدين | Debt ledger mirror input
   * @returns معرف القيد المُنشأ، أو `null` إذا تجاهلت العملية | Entry ID or `null` if skipped
   * @throws `JOURNAL_ACTOR_REQUIRED` إذا كان `actorUserId` غائبًا
   * @since V20.1
   */
  async mirrorDebtLedgerEntry(
    db: Db,
    input: MirrorDebtLedgerInput,
  ): Promise<{ id: string } | null> {
    if (!input.actorUserId) throw new Error('JOURNAL_ACTOR_REQUIRED');
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;

    const sourceRef = input.sourceRef?.trim();
    if (!sourceRef) {
      throw new Error('JOURNAL_SOURCE_REF_REQUIRED');
    }

    if (input.source === DebtSource.PAYMENT || input.source === 'PAYMENT') {
      // V20.1 — Wallet-absorption PAYMENTs are recorded in DebtLedgerEntry
      // for audit (see WALLET_ABSORPTION_SOURCE_REF_PREFIXES), but they
      // must NOT be mirrored as DR <asset> / CR AR. Today the matching
      // INVOICE_SHORTFALL only carries the *remainder* (post-wallet),
      // so crediting AR by the wallet portion would push the journal
      // AR balance below the DebtLedgerEntry net (induced drift).
      // Revenue recognition for the wallet portion is a separate
      // cleanup tracked under V20.2 (full POS revenue → journal).
      if (sourceRef.startsWith('PAYMENT:WALLET:')) {
        return null;
      }
      const assetAccount = this.paymentAssetAccount(input);
      const isAdjustment = assetAccount === JOURNAL_ACCOUNTS.ADJUSTMENTS;
      const payMeta =
        input.paymentMethod != null
          ? {
              posPaymentMethod: input.paymentMethod,
              note: input.note ?? null,
            }
          : { note: input.note ?? null };
      return this.appendBalanced(db, {
        source: isAdjustment ? 'ADJUSTMENT' : 'PAYMENT',
        sourceRef,
        actorUserId: input.actorUserId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        lines: [
          {
            accountCode: assetAccount,
            debit: amount,
            meta: payMeta,
          },
          {
            accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
            credit: amount,
            meta: {
              debtSource: input.source,
              ...(input.paymentMethod != null
                ? { posPaymentMethod: input.paymentMethod }
                : {}),
            },
          },
        ],
      });
    }

    if (
      input.source === DebtSource.INVOICE_SHORTFALL ||
      input.source === DebtSource.SUBSCRIPTION_OVERUSE ||
      input.source === 'INVOICE_SHORTFALL' ||
      input.source === 'SUBSCRIPTION_OVERUSE'
    ) {
      return this.appendBalanced(db, {
        source: 'INVOICE',
        sourceRef,
        actorUserId: input.actorUserId,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        lines: [
          {
            accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
            debit: amount,
            meta: { debtSource: input.source },
          },
          {
            accountCode: JOURNAL_ACCOUNTS.REVENUE,
            credit: amount,
            meta: { note: input.note ?? null },
          },
        ],
      });
    }

    return null;
  }

  // ====================================================================
  //   V20.4 — FINAL CANONICAL BANKING CORE — PHASE 1 ENTRY TYPES
  // ====================================================================
  //
  // The V20.3.4 forensic audit found three flows that mutate balances
  // without any journal trail:
  //   1. Subscription cancellation refund (cash + gift removal).
  //   2. Subscription activation under `accrueSaleOnAccount=true`
  //      (plan-sale revenue recognition deferred to AR).
  //   3. CC partial-payment discount portion (goodwill writedown).
  // Plus one drift source:
  //   4. Invoice cancellation never reverses the original issuance.
  //
  // These four `appendXxxEntry` / `appendXxxEntrySafe` pairs close
  // the gaps. All sourceRefs are deterministic so retries are
  // idempotent (P2002 → return existing entry, no double-post).

  /**
   * V20.4 — Phase 1 invoice cancellation reversal entry.
   *
   * Reverses the issuance entry's REVENUE recognition by
   * debiting REVENUE_RETURNS, and clears the AR debit by
   * crediting ACCOUNTS_RECEIVABLE for whatever portion is
   * still on the books for that order.
   *
   * Call site MUST pass `remainingArAmount` = the remaining
   * AR balance for the order at the moment of cancellation
   * (computed from prior journal lines on this order). If
   * the order was already fully paid, pass 0 and the helper
   * returns null without writing.
   *
   * Lines:
   *   DR REVENUE_RETURNS         (recognise the contra-revenue)
   *   CR ACCOUNTS_RECEIVABLE     (clear the outstanding AR)
   *
   * sourceRef: `JOURNAL:INVOICE_CANCELED:<orderId>`.
   */
  async appendInvoiceCancellationEntry(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      remainingArAmount: Prisma.Decimal | string | number;
      reason?: string | null;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.remainingArAmount);
    if (amount.lessThanOrEqualTo(0)) return null;
    return this.appendBalanced(db, {
      source: 'INVOICE_CANCELED',
      sourceRef: `JOURNAL:INVOICE_CANCELED:${input.orderId}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId,
      // V20.6 — Phase 1: explicit reversal opt-in. Cancellation of
      // a previously-issued invoice is the canonical reversal flow
      // and must remain permitted even after the period closes.
      allowReversal: true,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.REVENUE_RETURNS,
          debit: amount,
          meta: {
            event: 'INVOICE_CANCELED',
            orderId: input.orderId,
            reason: input.reason ?? null,
          },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          credit: amount,
          meta: { event: 'INVOICE_CANCELED', orderId: input.orderId },
        },
      ],
    });
  }

  /**
   * النسخة الآمنة من `appendInvoiceCancellationEntry` — عقد المرحلة 16 ذاته:
   * يُسجِّل الإخفاق في `JournalFailureLog` ويُفعِّل قاطع الدائرة، ولا يُوقف
   * العملية التجارية مباشرةً إلا عند تجاوز عتبة القاطع.
   *
   * Safe variant of `appendInvoiceCancellationEntry` — same Phase 16 contract:
   * logs failures to `JournalFailureLog`, trips the circuit breaker on threshold,
   * never directly aborts the surrounding business transaction.
   *
   * @param db - عميل Prisma أو معاملة نشطة | Prisma client or active transaction
   * @param input - بيانات إلغاء الفاتورة | Invoice cancellation input
   * @returns معرف القيد أو `null` إذا أُهملت العملية أو فشلت | Entry ID or `null`
   * @since V20.4
   */
  async appendInvoiceCancellationEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId: string;
      actorUserId: string;
      remainingArAmount: Prisma.Decimal | string | number;
      reason?: string | null;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendInvoiceCancellationEntry(db, input);
    } catch (err) {
      // FINANCIAL HARDENING — fail-closed-aware (default unchanged).
      return this.handleCriticalSafeFailure(db, err, {
        source: 'INVOICE_CANCELED',
        sourceRef: `JOURNAL:INVOICE_CANCELED:${input.orderId}`,
        customerId: input.customerId,
        orderId: input.orderId,
        amount: input.remainingArAmount,
        actorUserId: input.actorUserId,
      });
    }
  }

  /**
   * V20.4 — Phase 1 debt-discount entry.
   *
   * Recognises a CC-granted goodwill discount as an expense and
   * clears the matching AR. Replaces the legacy single-entry
   * `GeneralLedgerEntry.DEBT_ADJUSTMENT` write that was the only
   * record of the discount until V20.4.
   *
   * Lines:
   *   DR DEBT_DISCOUNTS        (P&L expense — goodwill writedown)
   *   CR ACCOUNTS_RECEIVABLE   (AR cleared by the discounted amount)
   *
   * sourceRef: `JOURNAL:DEBT_DISCOUNT:<discountRef>` — caller
   * supplies a deterministic ref (e.g. `<customerId>:<thRowId>`).
   */
  async appendDebtDiscountEntry(
    db: Db,
    input: {
      customerId: string;
      orderId?: string | null;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
      discountRef: string;
      note?: string | null;
    },
  ): Promise<{ id: string } | null> {
    const amount = this.decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) return null;
    if (!input.discountRef?.trim()) {
      throw new Error('JOURNAL_DEBT_DISCOUNT_REF_REQUIRED');
    }
    return this.appendBalanced(db, {
      source: 'DEBT_DISCOUNT',
      sourceRef: `JOURNAL:DEBT_DISCOUNT:${input.discountRef}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: input.orderId ?? null,
      lines: [
        {
          accountCode: JOURNAL_ACCOUNTS.DEBT_DISCOUNTS,
          debit: amount,
          meta: { event: 'DEBT_DISCOUNT', note: input.note ?? null },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE,
          credit: amount,
          meta: { event: 'DEBT_DISCOUNT', discountRef: input.discountRef },
        },
      ],
    });
  }

  /**
   * النسخة الآمنة من `appendDebtDiscountEntry` — عقد المرحلة 16.
   *
   * Safe variant of `appendDebtDiscountEntry` — Phase 16 contract.
   *
   * @param db - عميل Prisma أو معاملة نشطة | Prisma client or active transaction
   * @param input - بيانات خصم الديون | Debt discount input
   * @returns معرف القيد أو `null` | Entry ID or `null`
   * @since V20.4
   */
  async appendDebtDiscountEntrySafe(
    db: Db,
    input: {
      customerId: string;
      orderId?: string | null;
      actorUserId: string;
      amount: Prisma.Decimal | string | number;
      discountRef: string;
      note?: string | null;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendDebtDiscountEntry(db, input);
    } catch (err) {
      // FINANCIAL HARDENING — fail-closed-aware (default unchanged).
      return this.handleCriticalSafeFailure(db, err, {
        source: 'DEBT_DISCOUNT',
        sourceRef: `JOURNAL:DEBT_DISCOUNT:${input.discountRef}`,
        customerId: input.customerId,
        orderId: input.orderId ?? null,
        amount: input.amount,
        actorUserId: input.actorUserId,
      });
    }
  }

  /**
   * V20.4 — Phase 1 subscription refund entry.
   *
   * Records the journal-side effect of `cancelSubscriptionForCustomer`.
   * Two independent legs are required because gift removal and cash
   * refund have different P&L treatments:
   *
   *   GIFT REMOVAL (we void promotional credit we previously gave):
   *     DR WALLET_LIABILITY    (we owe customer N less)
   *     CR PROMOTIONAL_EXPENSE (reverses the promotional spend)
   *
   *   CASH REFUND (we return cash to the customer):
   *     DR WALLET_LIABILITY    (we owe customer N less)
   *     CR CASH                (cash leaves the till)
   *
   * Either leg may be zero (e.g. only gift was unused). The helper
   * writes both legs in a single balanced entry; if one leg is zero
   * it is omitted. If both are zero the helper returns null.
   *
   * sourceRef: `JOURNAL:SUBSCRIPTION_REFUND:<subscriptionId>`.
   */
  async appendSubscriptionRefundEntry(
    db: Db,
    input: {
      customerId: string;
      subscriptionId: string;
      actorUserId: string;
      giftRemovalAmount: Prisma.Decimal | string | number;
      cashRefundAmount: Prisma.Decimal | string | number;
      reason?: string | null;
    },
  ): Promise<{ id: string } | null> {
    const giftAmount = this.decimal(input.giftRemovalAmount);
    const cashAmount = this.decimal(input.cashRefundAmount);
    if (giftAmount.lessThanOrEqualTo(0) && cashAmount.lessThanOrEqualTo(0)) {
      return null;
    }
    const lines: JournalLineInput[] = [];
    if (giftAmount.greaterThan(0)) {
      lines.push(
        {
          accountCode: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
          debit: giftAmount,
          meta: {
            event: 'SUBSCRIPTION_REFUND_GIFT',
            subscriptionId: input.subscriptionId,
          },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.PROMOTIONAL_EXPENSE,
          credit: giftAmount,
          meta: {
            event: 'SUBSCRIPTION_REFUND_GIFT',
            subscriptionId: input.subscriptionId,
            reason: input.reason ?? null,
          },
        },
      );
    }
    if (cashAmount.greaterThan(0)) {
      lines.push(
        {
          accountCode: JOURNAL_ACCOUNTS.WALLET_LIABILITY,
          debit: cashAmount,
          meta: {
            event: 'SUBSCRIPTION_REFUND_CASH',
            subscriptionId: input.subscriptionId,
          },
        },
        {
          accountCode: JOURNAL_ACCOUNTS.CASH,
          credit: cashAmount,
          meta: {
            event: 'SUBSCRIPTION_REFUND_CASH',
            subscriptionId: input.subscriptionId,
            reason: input.reason ?? null,
          },
        },
      );
    }
    return this.appendBalanced(db, {
      source: 'SUBSCRIPTION_REFUND',
      sourceRef: `JOURNAL:SUBSCRIPTION_REFUND:${input.subscriptionId}`,
      actorUserId: input.actorUserId,
      customerId: input.customerId,
      orderId: null,
      // V20.6 — Phase 1: subscription refunds (gift removal +
      // cash refund) are P&L reversals and must be permitted on
      // CLOSED periods as long as the operator explicitly opted
      // in (this flag is the explicit opt-in for ALL callers of
      // this helper).
      allowReversal: true,
      lines,
    });
  }

  /**
   * النسخة الآمنة من `appendSubscriptionRefundEntry` — عقد المرحلة 16.
   *
   * Safe variant of `appendSubscriptionRefundEntry` — Phase 16 contract.
   *
   * @param db - عميل Prisma أو معاملة نشطة | Prisma client or active transaction
   * @param input - بيانات استرداد الاشتراك | Subscription refund input
   * @returns معرف القيد أو `null` | Entry ID or `null`
   * @since V20.4
   */
  async appendSubscriptionRefundEntrySafe(
    db: Db,
    input: {
      customerId: string;
      subscriptionId: string;
      actorUserId: string;
      giftRemovalAmount: Prisma.Decimal | string | number;
      cashRefundAmount: Prisma.Decimal | string | number;
      reason?: string | null;
    },
  ): Promise<{ id: string } | null> {
    try {
      return await this.appendSubscriptionRefundEntry(db, input);
    } catch (err) {
      // FINANCIAL HARDENING — fail-closed-aware (default unchanged).
      const totalAmount = this.decimal(input.giftRemovalAmount).add(
        this.decimal(input.cashRefundAmount),
      );
      return this.handleCriticalSafeFailure(db, err, {
        source: 'SUBSCRIPTION_REFUND',
        sourceRef: `JOURNAL:SUBSCRIPTION_REFUND:${input.subscriptionId}`,
        customerId: input.customerId,
        orderId: null,
        amount: totalAmount,
        actorUserId: input.actorUserId,
      });
    }
  }

  /**
   * V20.4 — Phase 1 helper used by `appendInvoiceCancellationEntry`
   * call sites to compute the remaining AR for an order at the
   * moment of cancellation. Reads journal-only — works under both
   * V20.2 and V20.3 because both models converge on AR being
   * the source of truth for "still outstanding".
   *
   * Returns Decimal(0) for orders never journal-issued (legacy
   * orders pre-V20.3) so the caller naturally skips the no-op.
   */
  async getOrderArBalance(orderId: string): Promise<Prisma.Decimal> {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { orderId },
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
      select: { debit: true, credit: true },
    });
    let balance = new Prisma.Decimal(0);
    for (const line of lines) {
      balance = balance.add(line.debit).sub(line.credit);
    }
    return balance.lessThan(0) ? new Prisma.Decimal(0) : balance;
  }

  /**
   * يُحسب رصيد الذمم الحالي للعميل من سجل اليومية (حساب 1300).
   * يُجمع جميع الأسطر المدينة والدائنة لحساب الذمم ويُعيد الرصيد الإيجابي
   * (الحد الأدنى صفر — لا يُعيد أرقامًا سالبة).
   *
   * Reads the customer's current AR balance from the journal (account 1300).
   * Sums all debit and credit lines for the AR account and returns the
   * net balance clamped to zero (negative balances return 0).
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns رصيد الذمم كـ `Prisma.Decimal` (≥ 0) | AR balance as `Prisma.Decimal` (≥ 0)
   * @since V20.4
   */
  async getCustomerBalanceFromJournal(
    customerId: string,
  ): Promise<Prisma.Decimal> {
    const rows = await this.prisma.journalLine.findMany({
      where: {
        entry: { customerId },
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
      select: { debit: true, credit: true },
    });
    const balance = rows.reduce(
      (sum, row) => sum.add(row.debit).sub(row.credit),
      new Prisma.Decimal(0),
    );
    return balance.lessThan(0) ? new Prisma.Decimal(0) : balance;
  }

  /**
   * Batch variant of {@link getCustomerBalanceFromJournal}.
   *
   * Fetches account-1300 (AR) lines for all requested customers in a
   * SINGLE query, aggregates in-process, and returns a Map keyed by
   * customerId. Customers with no journal history are included in the
   * Map with a zero balance so callers don't need to null-guard.
   *
   * Use this instead of calling `getCustomerBalanceFromJournal` inside
   * a loop — converts an N-query pattern to 1 query.
   */
  async getCustomerBalancesBatch(
    customerIds: string[],
  ): Promise<Map<string, Prisma.Decimal>> {
    const map = new Map<string, Prisma.Decimal>();
    if (customerIds.length === 0) return map;

    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { customerId: { in: customerIds } },
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
      select: {
        debit: true,
        credit: true,
        entry: { select: { customerId: true } },
      },
    });

    for (const line of lines) {
      const cid = (line.entry as { customerId: string | null }).customerId;
      if (!cid) continue;
      const cur = map.get(cid) ?? new Prisma.Decimal(0);
      map.set(
        cid,
        cur
          .add(new Prisma.Decimal(line.debit.toString()))
          .sub(new Prisma.Decimal(line.credit.toString())),
      );
    }

    // Clamp negatives to 0 (mirrors getCustomerBalanceFromJournal behaviour).
    for (const [cid, bal] of map) {
      if (bal.lessThan(0)) map.set(cid, new Prisma.Decimal(0));
    }

    // Ensure every requested ID has an entry (default 0 if no AR history).
    for (const cid of customerIds) {
      if (!map.has(cid)) map.set(cid, new Prisma.Decimal(0));
    }

    return map;
  }

  /**
   * يُسجِّل في السجل انحرافًا بين رصيد دفتر الديون القديم ورصيد اليومية.
   * تُستخدم في Cron الفحص اليومي — لا تُوقف أي عملية، فقط تُصدر تحذيرًا في السجل.
   * الانحراف المسموح به ±0.001 د.ك (نفس حد `appendBalanced`).
   *
   * Logs an AR drift warning when the legacy debt-ledger balance differs
   * from the journal AR balance. Used by the daily drift cron — never
   * throws, only emits a logger warning. Tolerance is ±0.001 KWD.
   *
   * @param customerId - معرف العميل | Customer ID
   * @param ledgerBalance - رصيد دفتر الديون القديم | Legacy debt-ledger balance
   * @since V20.4
   */
  /**
   * @deprecated V1.7.0 — DebtLedgerEntry table removed in V20.4.
   * The `ledgerBalance` param is now itself read from Journal via
   * `getCustomerNetDebtFromDebtLedgerAgg`, so this method always
   * compares Journal vs Journal — the drift it was meant to surface
   * (Journal vs DebtLedger) no longer exists.
   *
   * Retained as a no-op so existing callers don't break; remove together
   * with the journal.controller.ts endpoint that invokes it.
   */
  async logCustomerDrift(
    customerId: string,
    ledgerBalance: Prisma.Decimal | string | number,
  ): Promise<void> {
    const journalBalance = await this.getCustomerBalanceFromJournal(customerId);
    const ledger = this.decimal(ledgerBalance);
    if (ledger.sub(journalBalance).abs().gt(new Prisma.Decimal('0.001'))) {
      this.logger.warn('[JOURNAL_DRIFT] (deprecated — now comparing Journal vs Journal)', {
        customerId,
        ledgerBalance: ledger.toFixed(4),
        journalBalance: journalBalance.toFixed(4),
      });
    }
  }

  /**
   * V25 — shared enrichment for subscription plan name + payment channel
   * (journal line meta + asset accounts). Used by AR statement rows and
   * full-entry views.
   */
  private async resolveContextLabelsByEntryId(
    entries: ReadonlyArray<{
      id: string;
      source: string;
      sourceRef: string;
      lines: ReadonlyArray<{
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
        meta: Prisma.JsonValue | null;
        account: { code: string };
      }>;
    }>,
  ): Promise<Map<string, string | undefined>> {
    const subIds = new Set<string>();
    for (const e of entries) {
      const sid = parseSubscriptionIdFromJournalRef(e.source, e.sourceRef);
      if (sid) subIds.add(sid);
    }
    const planBySub =
      subIds.size === 0
        ? new Map<string, string>()
        : new Map(
            (
              await this.prisma.customerSubscription.findMany({
                where: { id: { in: [...subIds] } },
                select: { id: true, planNameSnapshot: true },
              })
            ).map((s) => [s.id, s.planNameSnapshot]),
          );

    const map = new Map<string, string | undefined>();
    for (const e of entries) {
      const subId = parseSubscriptionIdFromJournalRef(e.source, e.sourceRef);
      const planName = subId ? planBySub.get(subId) : undefined;
      const payChannel = inferPaymentChannelArFromJournalLines([...e.lines]);
      const bits: string[] = [];
      if (planName?.trim()) bits.push(`الباقة: ${planName.trim()}`);
      if (payChannel?.trim()) bits.push(`الدفع: ${payChannel.trim()}`);
      map.set(e.id, bits.length > 0 ? bits.join(' · ') : undefined);
    }
    return map;
  }

  private async resolveOrderRefLabelByOrderId(
    orderIds: ReadonlyArray<string>,
  ): Promise<Map<string, string>> {
    const unique = [...new Set(orderIds.filter((id) => id?.trim()))];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.order.findMany({
      where: { id: { in: unique } },
      select: { id: true, serialNumber: true, invoiceNumber: true },
    });
    const map = new Map<string, string>();
    for (const o of rows) {
      if (o.serialNumber?.trim()) {
        map.set(o.id, `طلب ${o.serialNumber.trim()}`);
      } else if (o.invoiceNumber?.trim()) {
        map.set(o.id, `فاتورة ورقية ${o.invoiceNumber.trim()}`);
      }
    }
    return map;
  }

  private collectOrderIdsForCustomerFacingDescriptions(
    entries: ReadonlyArray<{
      orderId: string | null;
      source: string;
      sourceRef: string;
    }>,
  ): string[] {
    const ids: string[] = [];
    for (const e of entries) {
      const oid =
        e.orderId ??
        parseOrderIdFromInvoiceJournalRef(e.source, e.sourceRef);
      if (oid) ids.push(oid);
    }
    return ids;
  }

  /**
   * يُعيد كشف الحساب المحاسبي للعميل: صف واحد لكل سطر في حساب الذمم (1300)
   * مع وصف عربي وسياق الباقة ووسيلة الدفع ورصيد تراكمي بعد كل حركة.
   * مُصمَّم لصفحة "كشف الحساب" في واجهة المستخدم.
   *
   * Returns the customer AR statement: one row per AR journal line (account 1300)
   * with Arabic description, subscription/payment context, and running balance.
   * Designed for the customer "كشف الحساب" statement UI.
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns الرصيد الحالي + صفوف الكشف | Current balance + statement rows
   * @since V21
   */
  async getCustomerStatement(
    customerId: string,
  ): Promise<{ balance: string; rows: JournalStatementRow[] }> {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { customerId },
        account: { code: JOURNAL_ACCOUNTS.ACCOUNTS_RECEIVABLE },
      },
      orderBy: [{ entry: { createdAt: 'asc' } }, { id: 'asc' }],
      select: {
        debit: true,
        credit: true,
        entry: {
          select: {
            id: true,
            source: true,
            sourceRef: true,
            createdAt: true,
            orderId: true,
          },
        },
      },
    });

    const entryIds = [...new Set(lines.map((l) => l.entry.id))];
    const entriesForContext =
      entryIds.length === 0
        ? []
        : await this.prisma.journalEntry.findMany({
            where: { id: { in: entryIds } },
            select: {
              id: true,
              source: true,
              sourceRef: true,
              orderId: true,
              lines: {
                orderBy: { id: 'asc' },
                select: {
                  debit: true,
                  credit: true,
                  meta: true,
                  account: { select: { code: true } },
                },
              },
            },
          });

    const contextByEntry =
      await this.resolveContextLabelsByEntryId(entriesForContext);

    const labelByOrder = await this.resolveOrderRefLabelByOrderId(
      this.collectOrderIdsForCustomerFacingDescriptions(entriesForContext),
    );
    const entryIdToOrderLabel = new Map<string, string | null>();
    const entryLinesById = new Map(
      entriesForContext.map((e) => [e.id, e.lines] as const),
    );
    for (const e of entriesForContext) {
      const oid =
        e.orderId ??
        parseOrderIdFromInvoiceJournalRef(e.source, e.sourceRef);
      const label = oid ? labelByOrder.get(oid) ?? null : null;
      entryIdToOrderLabel.set(e.id, label);
    }

    let balance = new Prisma.Decimal(0);
    const rows = lines.map((line) => {
      balance = balance.add(line.debit).sub(line.credit);
      const fullLines = entryLinesById.get(line.entry.id) ?? [];
      return {
        entryId: line.entry.id,
        date: line.entry.createdAt.toISOString(),
        description: describeJournalEntryForCustomerFacing(
          line.entry.source,
          line.entry.sourceRef,
          entryIdToOrderLabel.get(line.entry.id) ?? null,
          parsePlanNameFromContextLabel(contextByEntry.get(line.entry.id)),
          inferPaymentChannelArFromJournalLines(fullLines),
        ),
        contextLabel: contextByEntry.get(line.entry.id),
        debit: line.debit.toFixed(4),
        credit: line.credit.toFixed(4),
        balance: balance.toFixed(4),
      };
    });

    return { balance: balance.toFixed(4), rows };
  }

  /**
   * كشف «بنكي» لمركز الاتصال: صف واحد لكل قيد كامل مع أعمدة دفع العميل /
   * دعم الشركة / حركة المحفظة (2100) / الجانب المحاسبي للذمم، ورصيد ذمم
   * تراكمي بعد كل قيد. القراءة من `JournalEntry` كما في
   * {@link getCustomerJournalEntries}، والرياضيات هنا فقط على الخادم.
   */
  async getCustomerCallCenterBankStatement(
    customerId: string,
  ): Promise<{ balance: string; rows: CallCenterBankStatementRow[] }> {
    const entries = await this.prisma.journalEntry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        source: true,
        sourceRef: true,
        orderId: true,
        createdAt: true,
        lines: {
          orderBy: { id: 'asc' },
          select: {
            debit: true,
            credit: true,
            meta: true,
            account: { select: { code: true } },
          },
        },
      },
    });

    const contextByEntry = await this.resolveContextLabelsByEntryId(entries);

    const labelByOrder = await this.resolveOrderRefLabelByOrderId(
      this.collectOrderIdsForCustomerFacingDescriptions(entries),
    );

    let arRunning = new Prisma.Decimal(0);
    const rows: CallCenterBankStatementRow[] = entries.map((entry) => {
      const agg = aggregateJournalEntryForBankColumns(entry.lines);
      arRunning = arRunning
        .add(new Prisma.Decimal(agg.arDebitKd))
        .sub(new Prisma.Decimal(agg.arCreditKd));

      const oid =
        entry.orderId ??
        parseOrderIdFromInvoiceJournalRef(entry.source, entry.sourceRef);
      const orderRefLabel = oid ? labelByOrder.get(oid) ?? null : null;
      const payCh = inferPaymentChannelArFromJournalLines([...entry.lines]);

      return {
        entryId: entry.id,
        date: entry.createdAt.toISOString(),
        description: describeJournalEntryForCustomerFacing(
          entry.source,
          entry.sourceRef,
          orderRefLabel,
          parsePlanNameFromContextLabel(contextByEntry.get(entry.id)),
          payCh,
        ),
        contextLabel: contextByEntry.get(entry.id),
        customerPaidKd: agg.customerPaidKd,
        companySupportKd: agg.companySupportKd,
        debtGoodwillDiscountKd: agg.debtGoodwillDiscountKd,
        walletCreditKd: agg.walletCreditKd,
        walletDebitKd: agg.walletDebitKd,
        arDebitKd: agg.arDebitKd,
        arCreditKd: agg.arCreditKd,
        arBalanceKd: arRunning.toFixed(4),
      };
    });

    return { balance: arRunning.toFixed(4), rows };
  }

  /**
   * V22 Phase 6 — full double-entry journal view for a single customer.
   *
   * `getCustomerStatement` projects only the AR slice (one row per
   * AR-side line) which is correct for a "كشف حساب" but does NOT
   * surface the actual double-entry shape: every balanced entry has
   * 2+ lines across multiple accounts (Dr CASH / Cr AR, Dr AR / Cr
   * REVENUE, …). Operators kept asking "where is the matching
   * double-entry?" because they only saw one side.
   *
   * This method returns every JournalEntry that mentions the customer
   * (entry.customerId = customerId), with ALL of its lines and the
   * resolved account `code` + `name`, plus a per-entry trial-balance
   * check (Σ debit − Σ credit MUST be ≤ 0.001 by appendBalanced
   * guard). The frontend renders both sides verbatim so the audit
   * trail is visually self-evident.
   *
   * Append-only / read-side: this is a pure SELECT that reuses the
   * existing `JournalEntry_customerId_createdAt_idx`. No mutation,
   * no derived calculation — every value is canonical Decimal(19,4).
   */
  /**
   * يُعيد كشف القيود المزدوجة الكاملة للعميل: قيد واحد لكل `JournalEntry`
   * مع جميع أسطره (المدين والدائن) وأسماء الحسابات ومجاميع التوازن.
   * يُستخدم في واجهة مراجعة الكول سنتر البنكية والتدقيق المحاسبي.
   * قراءة فقط من `JournalEntry_customerId_createdAt_idx` — بدون حسابات مشتقة.
   *
   * Returns the full double-entry view for a customer: one record per `JournalEntry`
   * with all its lines, account names, and per-entry balance verification.
   * Used by the CC bank statement and accounting audit views.
   * Read-only via `JournalEntry_customerId_createdAt_idx` — no derived arithmetic.
   *
   * @param customerId - معرف العميل | Customer ID
   * @returns القيود الكاملة مع الأسطر والحسابات | Full entries with lines and accounts
   * @since V22
   */
  async getCustomerJournalEntries(
    customerId: string,
    filters?: {
      /** Filter entries to only those involving orders with these payment methods. */
      paymentMethods?: PosPaymentMethod[];
      /** Inclusive lower-bound on `createdAt`. */
      dateFrom?: Date;
      /** Inclusive upper-bound on `createdAt` (set to end of day by caller). */
      dateTo?: Date;
    },
  ): Promise<{
    customerId: string;
    entries: Array<{
      entryId: string;
      source: string;
      sourceRef: string;
      /** UI subtitle — Arabic expansion of `sourceRef` (technical ref still in `sourceRef`). */
      referenceLabel: string;
      /** e.g. `الباقة: … · الدفع: …` when resolvable from subscription + journal lines. */
      contextLabel?: string;
      /**
       * When the journal row is tied to an Order, the POS payment method on that order.
       * Lets clients distinguish ONLINE vs PAYMENT_LINK (both post to the same GL bank account).
       */
      posPaymentMethod: PosPaymentMethod | null;
      description: string;
      createdAt: string;
      totalDebitKd: string;
      totalCreditKd: string;
      balanced: boolean;
      lines: Array<{
        accountCode: string;
        accountName: string;
        debitKd: string;
        creditKd: string;
      }>;
    }>;
  }> {
    const dateFilter =
      filters?.dateFrom || filters?.dateTo
        ? {
            gte: filters.dateFrom,
            lte: filters.dateTo,
          }
        : undefined;

    // When filtering by payment method, first resolve which order IDs match,
    // then filter JournalEntry by those IDs or by source string for orderless entries.
    let paymentMethodOrderIds: string[] | undefined;
    if (filters?.paymentMethods?.length) {
      const matchingOrders = await this.prisma.order.findMany({
        where: {
          customerId,
          posPaymentMethod: { in: filters.paymentMethods },
        },
        select: { id: true },
      });
      paymentMethodOrderIds = matchingOrders.map((o) => o.id);
    }

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        customerId,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        ...(paymentMethodOrderIds !== undefined
          ? {
              OR: [
                { orderId: { in: paymentMethodOrderIds } },
                {
                  orderId: null,
                  source: {
                    in: this.paymentMethodsToSources(filters!.paymentMethods!),
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        source: true,
        sourceRef: true,
        orderId: true,
        createdAt: true,
        lines: {
          orderBy: { id: 'asc' },
          select: {
            debit: true,
            credit: true,
            meta: true,
            account: { select: { code: true, name: true } },
          },
        },
      },
    });

    const orderIdsForPaymentMethod = [
      ...new Set(entries.map((e) => e.orderId).filter((id): id is string => id != null)),
    ];
    const ordersForPosMethod =
      orderIdsForPaymentMethod.length > 0
        ? await this.prisma.order.findMany({
            where: { id: { in: orderIdsForPaymentMethod } },
            select: { id: true, posPaymentMethod: true },
          })
        : [];
    const posPaymentMethodByOrderId = new Map(
      ordersForPosMethod.map((o) => [o.id, o.posPaymentMethod]),
    );

    const contextByEntry = await this.resolveContextLabelsByEntryId(entries);

    const labelByOrder = await this.resolveOrderRefLabelByOrderId(
      this.collectOrderIdsForCustomerFacingDescriptions(entries),
    );

    const out = entries.map((entry) => {
      let totalDebit = new Prisma.Decimal(0);
      let totalCredit = new Prisma.Decimal(0);
      const lines = entry.lines.map((line) => {
        totalDebit = totalDebit.add(line.debit);
        totalCredit = totalCredit.add(line.credit);
        return {
          accountCode: line.account.code,
          accountName: line.account.name,
          debitKd: line.debit.toFixed(4),
          creditKd: line.credit.toFixed(4),
        };
      });
      const balanced = totalDebit.sub(totalCredit).abs().lte(new Prisma.Decimal('0.001'));

      const contextLabel = contextByEntry.get(entry.id);

      const oid =
        entry.orderId ??
        parseOrderIdFromInvoiceJournalRef(entry.source, entry.sourceRef);
      const orderRefLabel = oid ? labelByOrder.get(oid) ?? null : null;
      const payCh = inferPaymentChannelArFromJournalLines([...entry.lines]);
      const posPaymentMethod = entry.orderId
        ? posPaymentMethodByOrderId.get(entry.orderId) ?? null
        : null;

      return {
        entryId: entry.id,
        source: entry.source,
        sourceRef: entry.sourceRef,
        referenceLabel: humanizeJournalSourceRef(
          entry.source,
          entry.sourceRef,
        ),
        contextLabel,
        posPaymentMethod,
        description: describeJournalEntryForCustomerFacing(
          entry.source,
          entry.sourceRef,
          orderRefLabel,
          parsePlanNameFromContextLabel(contextLabel),
          payCh,
        ),
        createdAt: entry.createdAt.toISOString(),
        totalDebitKd: totalDebit.toFixed(4),
        totalCreditKd: totalCredit.toFixed(4),
        balanced,
        lines,
      };
    });

    return { customerId, entries: out };
  }

  private paymentAssetAccount(input: MirrorDebtLedgerInput): string {
    const ref = input.sourceRef ?? '';
    const method = input.paymentMethod ?? '';
    const note = input.note?.toLowerCase() ?? '';
    if (ref.includes(':KNET:') || method === PosPaymentMethod.KNET) {
      return JOURNAL_ACCOUNTS.BANK_KNET;
    }
    if (
      ref.includes(':ONLINE:') ||
      ref.includes(':PAYMENT_LINK:') ||
      method === PosPaymentMethod.ONLINE ||
      method === PosPaymentMethod.PAYMENT_LINK
    ) {
      return JOURNAL_ACCOUNTS.BANK_ONLINE;
    }
    if (ref.includes(':CASH:') || method === PosPaymentMethod.CASH) {
      return JOURNAL_ACCOUNTS.CASH;
    }
    if (ref.startsWith('ADJUSTMENT:') || note.includes('void') || note.includes('edit')) {
      return JOURNAL_ACCOUNTS.ADJUSTMENTS;
    }
    throw new Error(`UNKNOWN_PAYMENT_ASSET_ACCOUNT:${method || 'NONE'}`);
  }

  /**
   * Maps requested PosPaymentMethod values to the journal `source` strings
   * used by entries that have no `orderId` (e.g. direct CC debt payments).
   * CASH/KNET/ONLINE/PAYMENT_LINK map to the PAYMENT source; wallet-based
   * entries use WALLET_FUNDING; debt-only entries use INVOICE.
   */
  private paymentMethodsToSources(methods: PosPaymentMethod[]): string[] {
    const sources = new Set<string>();
    for (const m of methods) {
      if (
        m === PosPaymentMethod.CASH ||
        m === PosPaymentMethod.KNET ||
        m === PosPaymentMethod.ONLINE ||
        m === PosPaymentMethod.PAYMENT_LINK
      ) {
        sources.add('PAYMENT');
        sources.add('PROCESS_TRANSACTION');
      }
      if (m === PosPaymentMethod.SUBSCRIPTION_WALLET) {
        sources.add('WALLET_FUNDING');
        sources.add('PROCESS_TRANSACTION');
      }
      if (m === PosPaymentMethod.DEBT_ON_ACCOUNT) {
        sources.add('INVOICE');
      }
    }
    return [...sources];
  }

  private decimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
    return value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(value.toString());
  }
}
