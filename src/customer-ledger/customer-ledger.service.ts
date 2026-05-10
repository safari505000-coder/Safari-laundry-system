import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  CashStatus,
  CustomerSubscriptionStatus,
  DebtEntityCategory,
  DebtSource,
  GeneralLedgerEntryType,
  LedgerTransactionType,
  OrderStatus,
  PosPaymentMethod,
  Prisma,
  SafariRole,
} from '@prisma/client';
import { cashStatusForPaymentMethod } from '../common/utils/cash-status-for-method';
import {
  minorToAmountString,
  toMinorFromFixed4,
} from '../finance/finance-money';
import {
  assertDebtLedgerPaymentWrite,
  isRealDebtLedgerPayment,
  traceDebtLedgerPaymentWrite,
} from '../finance/debt-ledger-payment-origin.util';
import {
  computeOrderRemainingBalancesBatch,
  INVOICE_REMAINING_TOLERANCE_KD,
  isV20_3TrueAccountingEnabled,
} from '../finance/debt-customer-aggregates.util';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { DoubleEntryJournalService } from '../general-ledger/double-entry-journal.service';
import { JournalSourceService } from '../general-ledger/journal-source.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertUiConsistency,
  type UiConsistencyContext,
} from '../finance/audit/assert-ui-consistency';
import { FinancialDomainEventPublisher } from '../domain-events/financial-domain-event.publisher';
import { SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS } from '../call-center/dto/activate-subscription.dto';
import type { SubscriptionActivationPaymentMethod } from '../call-center/dto/activate-subscription.dto';
import type {
  SubscriptionActivationSettlement,
  SubscriptionCancellationSettlement,
} from './subscription-settlement.types';

export type PrismaTx = Prisma.TransactionClient;

/** When the caller already loaded order fields (e.g. POS checkout), skip extra reads inside the tx. */
export type OrderWalletSettlementPrefetch = {
  customerId: string;
  totalPrice: Prisma.Decimal;
  posPaymentMethod: PosPaymentMethod | null;
  walletSettledAt: Date | null;
  /** POS path: performer was validated before the transaction */
  skipPerformerLookup?: boolean;
};

@Injectable()
export class CustomerLedgerService {
  private readonly logger = new Logger(CustomerLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generalLedger: GeneralLedgerService,
    private readonly journal: DoubleEntryJournalService,
    private readonly journalSource: JournalSourceService,
    private readonly inventory: InventoryService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    /**
     * V20.4 — Phase 5 typed financial-event bus. Optional so
     * existing tests built against the V20.3 5-arg signature
     * can construct the service without wiring the publisher;
     * production injection always provides it via
     * {@link DomainEventsModule}.
     */
    private readonly events?: FinancialDomainEventPublisher,
  ) {}

  /**
   * V20.4 — Phase 5 typed event-fan-out helper. Centralised so
   * each call site stays a single line and the absence of a
   * wired publisher (legacy tests) silently skips. Failures
   * inside `publish()` are absorbed by the publisher itself.
   */
  emitFinancialEvent: FinancialDomainEventPublisher['publish'] = ((
    name: Parameters<FinancialDomainEventPublisher['publish']>[0],
    payload: Parameters<FinancialDomainEventPublisher['publish']>[1],
  ): void => {
    this.events?.publish(name, payload);
  }) as FinancialDomainEventPublisher['publish'];

  /**
   * V20.3.2 — Phase 5 fire-and-forget UI consistency log.
   *
   * MUST be called from outside any active transaction (i.e.
   * after the `$transaction` callback has returned), because
   * the helper reads the OUTER `this.prisma` which only sees
   * committed data. Calling from inside a tx will read pre-
   * commit state and produce noisy false positives.
   *
   * Wrapped here so external call sites stay one-liner. Never
   * throws, never blocks the caller longer than the assertion
   * itself; failures are absorbed by {@link assertUiConsistency}
   * (logged as `[UI_CONSISTENCY_CHECK_FAILED]`).
   */
  postWriteUiConsistencyAssert(
    customerId: string,
    context: UiConsistencyContext,
  ): void {
    void assertUiConsistency({
      db: this.prisma,
      journal: this.journalSource,
      customerId,
      context,
    });
  }

  private async resolveFallbackOwnerIdTx(tx: PrismaTx): Promise<string | null> {
    const owner = await tx.user.findFirst({
      where: { safariRole: SafariRole.OWNER },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return owner?.id ?? null;
  }

  /**
   * FIFO-settle UNPAID orders using positive prepaid `CustomerWallet.balance`
   * (subscription credit). Oldest `createdAt` first; only **full** invoice
   * amounts (same invariant as POS `SUBSCRIPTION_WALLET` checkout). Skips
   * bundled gateway orders (`posPaymentBundleId` set) — those stay on the
   * multi-pay link flow.
   *
   * Intended to run at the end of subscription activation and whenever
   * prepaid balance increases, so operators are not dependent on a frontend
   * `autoCloseInvoices` flag for “balance pays open invoices”.
   */
  async autoReconcileUnpaidInvoicesFromPrepaidBalanceTx(
    tx: PrismaTx,
    customerId: string,
    performedByUserId: string | null | undefined,
  ): Promise<{ paidOrderIds: string[] }> {
    const paidOrderIds: string[] = [];
    const performerId =
      performedByUserId ?? (await this.resolveFallbackOwnerIdTx(tx));
    if (!performerId) {
      this.logger.warn(
        `[prepaid-auto-reconcile] No OWNER user to attribute ledger — skip customerId=${customerId}`,
      );
      return { paidOrderIds };
    }

    const maxPasses = 50;
    for (let pass = 0; pass < maxPasses; pass++) {
      const wallet = await this.getOrCreateWalletTx(tx, customerId);
      const balanceMinor = toMinorFromFixed4(wallet.balance);
      if (balanceMinor <= 0n) break;

      const next = await tx.order.findFirst({
        where: {
          customerId,
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
          walletSettledAt: null,
          posPaymentBundleId: null,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          totalPrice: true,
          status: true,
          completedAt: true,
          driverId: true,
          customerId: true,
        },
      });
      if (!next) break;

      const invMinor = toMinorFromFixed4(next.totalPrice);
      if (invMinor <= 0n) break;
      if (invMinor > balanceMinor) break;

      const wasIncomplete = next.status !== OrderStatus.COMPLETED;

      await tx.order.update({
        where: { id: next.id },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: next.completedAt ?? new Date(),
          posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
          cashStatus: cashStatusForPaymentMethod(
            PosPaymentMethod.SUBSCRIPTION_WALLET,
          ),
        },
      });

      await this.applyOrderWalletSettlementForCompletedOrder(
        tx,
        next.id,
        performerId,
        {
          customerId: next.customerId,
          totalPrice: next.totalPrice,
          posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
          walletSettledAt: null,
          skipPerformerLookup: true,
        },
        {
          autoReconciledFromPrepaidBalance: true,
          reportingCategory: 'PREPAID_AUTO_RECONCILE',
        },
      );

      if (wasIncomplete) {
        await this.generalLedger.append(tx, {
          entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
          amount: next.totalPrice,
          memo: 'POS checkout (prepaid auto-reconcile)',
          orderId: next.id,
          customerId: next.customerId,
          actorUserId: performerId,
          metadata: {
            posPaymentMethod: PosPaymentMethod.SUBSCRIPTION_WALLET,
            source: 'PREPAID_AUTO_RECONCILE',
          },
        });

        const actorRow = await tx.user.findUnique({
          where: { id: performerId },
          select: { branchId: true },
        });
        const driverRow = next.driverId
          ? await tx.user.findUnique({
              where: { id: next.driverId },
              select: { branchId: true },
            })
          : null;
        await this.inventory.applyOrderStockDecrement(tx, {
          orderId: next.id,
          actorUserId: performerId,
          branchId: driverRow?.branchId ?? actorRow?.branchId ?? null,
          reference: `AUTO-PREPAID-${next.id.slice(0, 8)}`,
        });
      }

      paidOrderIds.push(next.id);
    }

    if (paidOrderIds.length > 0) {
      this.logger.log(
        `[prepaid-auto-reconcile] customerId=${customerId} count=${paidOrderIds.length} orderIds=${paidOrderIds.join(',')}`,
      );
    }

    return { paidOrderIds };
  }

  /**
   * Standalone transaction wrapper for future callers (cron, admin tools)
   * after any prepaid balance increase.
   */
  async runPrepaidAutoReconcileForCustomer(
    customerId: string,
    performedByUserId?: string | null,
  ): Promise<{ paidOrderIds: string[] }> {
    const result = await this.prisma.$transaction(
      async (tx) =>
        this.autoReconcileUnpaidInvoicesFromPrepaidBalanceTx(
          tx,
          customerId,
          performedByUserId ?? null,
        ),
      { maxWait: 15_000, timeout: 45_000 },
    );
    // V20.3.2 — Phase 5 post-commit consistency log. Wallet
    // absorption changes both the canonical AR balance and the
    // remaining-balance sum, so it's a high-signal hook.
    this.postWriteUiConsistencyAssert(customerId, {
      source: 'WALLET_ABSORPTION',
      correlationId:
        result.paidOrderIds.length > 0 ? result.paidOrderIds[0] : null,
    });
    // V20.4 — Phase 5 fan-out. Listener side
    // (`FinancialSnapshotListener`) refreshes the projection
    // for this customer; never blocks the caller.
    if (result.paidOrderIds.length > 0) {
      this.emitFinancialEvent('finance.wallet.absorbed', {
        customerId,
        orderId: result.paidOrderIds[0],
        correlationId: result.paidOrderIds[0],
        occurredAt: new Date().toISOString(),
        amountKd: '0.0000',
      });
    }
    return result;
  }

  private decimalFromMinor(minor: bigint): Prisma.Decimal {
    return new Prisma.Decimal(minorToAmountString(minor));
  }

  /**
   * Concurrent checkouts for the same new customer can race on `upsert` create;
   * the second tx may get P2002 on `customerId` unique — re-read the row.
   */
  async getOrCreateWalletTx(tx: PrismaTx, customerId: string) {
    try {
      return await tx.customerWallet.upsert({
        where: { customerId },
        create: { customerId },
        update: {},
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return tx.customerWallet.findUniqueOrThrow({
          where: { customerId },
        });
      }
      throw e;
    }
  }

  /**
   * V20.1-v2 — Phase 13 concurrency safety helper.
   *
   * Acquires a row-level lock on the `CustomerWallet` row for the
   * duration of the enclosing transaction (PostgreSQL `SELECT … FOR
   * UPDATE`). Any other transaction attempting `SELECT … FOR UPDATE`
   * or `UPDATE` on the same row will block until commit/rollback,
   * eliminating the race between concurrent wallet settlements.
   *
   * Best-effort: errors (e.g. non-PG engine in tests, transient
   * connection error) are swallowed and logged; the downstream
   * `tx.customerWallet.update` is the final integrity gate.
   */
  private async lockCustomerWalletForUpdateTx(
    tx: PrismaTx,
    walletId: string,
  ): Promise<void> {
    try {
      await tx.$queryRaw`SELECT 1 FROM "CustomerWallet" WHERE "id" = ${walletId}::uuid FOR UPDATE`;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[WALLET_FOR_UPDATE_LOCK_FAILED]',
        JSON.stringify({
          walletId,
          message: (err as Error)?.message ?? String(err),
        }),
      );
    }
  }

  private resolveDebtCategory(role: SafariRole): DebtEntityCategory {
    if (role === SafariRole.OWNER) return DebtEntityCategory.OWNER;
    if (role === SafariRole.DRIVER) return DebtEntityCategory.DRIVER;
    if (
      role === SafariRole.CALL_CENTER ||
      role === SafariRole.CALL_CENTER_SUPERVISOR
    )
      return DebtEntityCategory.CALL_CENTER;
    return DebtEntityCategory.BRANCH;
  }

  /**
   * First transaction attribution: lock customer origin branch once.
   */
  private async ensureCustomerOriginBranchTx(
    tx: PrismaTx,
    customerId: string,
    branchId?: string | null,
  ): Promise<void> {
    if (!branchId) return;
    await tx.customer.updateMany({
      where: { id: customerId, originBranchId: null },
      data: { originBranchId: branchId },
    });
  }

  /**
   * Deduct wallet balance toward the order total; any uncovered amount adds to debt.
   * Idempotent via `order.walletSettledAt`.
   */
  async applyOrderWalletSettlementForCompletedOrder(
    tx: PrismaTx,
    orderId: string,
    performedByUserId: string,
    prefetch?: OrderWalletSettlementPrefetch,
    /**
     * V1.6.0 — extra fields merged into the ledger row's `metadata` JSON.
     * Used by the payment-gateway finalize path to tag rows as
     * `debtSettlementViaLink = true` with `debtSettled` + original method,
     * so the "Collected Today" KPI and Accountant reports can
     * distinguish these from ordinary POS sales.
     */
    extraMetadata?: Record<string, Prisma.JsonValue>,
  ): Promise<void> {
    const o: OrderWalletSettlementPrefetch | null =
      prefetch ??
      (await tx.order.findUnique({
        where: { id: orderId },
        select: {
          walletSettledAt: true,
          customerId: true,
          totalPrice: true,
          posPaymentMethod: true,
        },
      }));
    if (!o) {
      throw new NotFoundException('Order not found');
    }
    if (o.walletSettledAt) {
      return;
    }

    const actor = await tx.user.findUnique({
      where: { id: performedByUserId },
      select: { id: true, safariRole: true, branchId: true },
    });
    if (!actor) {
      throw new NotFoundException(
        'Performing user not found — cannot record wallet settlement',
      );
    }
    await this.ensureCustomerOriginBranchTx(tx, o.customerId, actor.branchId);

    const totalMinor = toMinorFromFixed4(o.totalPrice);
    if (totalMinor < 0n) {
      throw new BadRequestException('Order total cannot be negative');
    }

    const wallet = await this.getOrCreateWalletTx(tx, o.customerId);

    // V20.1-v2 — Phase 13 concurrency safety.
    //
    // Acquire a row-level lock on the wallet for the rest of this
    // transaction. Without this, two concurrent settlement attempts
    // (e.g. driver finalises POS while CC manually marks the same
    // order paid) could both observe the same `balance` snapshot and
    // both deduct, double-spending the wallet credit.
    //
    // `tx.customerWallet.update` would also acquire a row-level lock,
    // but only at write time — between `findUnique`/`upsert` and
    // `update` there is a small race window. An explicit `FOR UPDATE`
    // closes the window: any other transaction touching this wallet
    // will block until this one commits or rolls back.
    //
    // Best-effort: silently skipped on engines that don't support
    // it (e.g. tests with non-PG mocks). The downstream `update`
    // remains the final integrity gate.
    await this.lockCustomerWalletForUpdateTx(tx, wallet.id);

    const balanceMinor = toMinorFromFixed4(wallet.balance);
    const debtMinor = toMinorFromFixed4(wallet.debt);

    // V20.1 — Wallet drain hotfix.
    //
    // Pre-V20.1, `takeMinor = min(balance, total)` was applied for ANY
    // posPaymentMethod, so the wallet was silently debited even when
    // the customer was paying externally (CASH/KNET/ONLINE/PAYMENT_LINK).
    // No compensating DebtLedgerEntry was written for the drained portion,
    // making the wallet leak invisible to AR / Customer-360 / Subscribers.
    // See V20-FORENSIC §C-1, §C-2.
    //
    // The wallet may now be touched ONLY when the resolved payment
    // method is one that legitimately settles against wallet credit:
    //   • SUBSCRIPTION_WALLET — operator explicitly chose to settle from
    //     the wallet (POS auto-resolved when wallet covers the full total).
    //   • DEBT_ON_ACCOUNT     — invoice is going on the customer's tab;
    //     wallet credit (if any) absorbs the matching portion first.
    //
    // For every other method, the wallet stays untouched here. POS
    // operators wanting to mix wallet + external on the same invoice
    // is a UX change deferred to V20.3 (see Phase 4 deferred note).
    const isSubscriptionWalletPayment =
      o.posPaymentMethod === PosPaymentMethod.SUBSCRIPTION_WALLET;
    const isDebtOnAccount =
      o.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT;
    const shouldUseWallet = isSubscriptionWalletPayment || isDebtOnAccount;

    // V20.1 (v2 audit) — DELIBERATE rename `takeMinor` → `safeTakeMinor`.
    // The pre-V20.1 codebase used `takeMinor = min(balance, total)` as the
    // single source of "wallet portion to consume", and that variable name
    // is still searched-for by older diagnostic queries / SQL probes. The
    // new name is the load-bearing one going forward; downstream math
    // MUST use `safeTakeMinor` ONLY. Do not reintroduce a `takeMinor`
    // alias — it was the seat of V20-FORENSIC §C-1.
    const safeTakeMinor =
      shouldUseWallet && balanceMinor > 0n
        ? (balanceMinor < totalMinor ? balanceMinor : totalMinor)
        : 0n;
    const shortfallMinor = totalMinor - safeTakeMinor;
    const beforeSubscriptionDebtMinor = balanceMinor < 0n ? -balanceMinor : 0n;
    const newBalanceMinor = balanceMinor - safeTakeMinor;
    const externalCoversShortfall =
      o.posPaymentMethod === PosPaymentMethod.CASH ||
      o.posPaymentMethod === PosPaymentMethod.KNET ||
      o.posPaymentMethod === PosPaymentMethod.ONLINE ||
      o.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK;
    const addInvoiceDebt =
      isDebtOnAccount ||
      isSubscriptionWalletPayment ||
      (!isSubscriptionWalletPayment && !externalCoversShortfall);
    let newDebtMinor =
      addInvoiceDebt && shortfallMinor > 0n ? debtMinor + shortfallMinor : debtMinor;

    /**
     * V19.26 — Gateway / CC "debt collected" paths pass `metadata.debtSettled`
     * (and `debtSettlementViaLink` / `debtSettlementViaCallCenter`). We always
     * wrote PAYMENT rows + GL, but **never reduced `CustomerWallet.debt`**, so
     * aggregate debt stayed high after a successful link payment. That broke
     * "تحويل مديونية → اشتراك" (activation saw stale debt = 0 effect on prepaid)
     * and debt-tracking tiles. Pay down aggregate debt by the portion of the
     * settlement that actually retires receivables, capped by current debt.
     */
    const debtSettledRawEarly =
      extraMetadata !== undefined ? extraMetadata.debtSettled : null;
    let debtPaydownFromSettlementMinor = 0n;
    const debtSettledStr =
      typeof debtSettledRawEarly === 'string' && debtSettledRawEarly.trim()
        ? debtSettledRawEarly.trim()
        : typeof debtSettledRawEarly === 'number' &&
            Number.isFinite(debtSettledRawEarly)
          ? String(debtSettledRawEarly)
          : null;
    if (debtSettledStr) {
      const declaredSettledMinor = toMinorFromFixed4(
        new Prisma.Decimal(debtSettledStr),
      );
      if (declaredSettledMinor > 0n && newDebtMinor > 0n) {
        debtPaydownFromSettlementMinor =
          declaredSettledMinor < newDebtMinor
            ? declaredSettledMinor
            : newDebtMinor;
        newDebtMinor -= debtPaydownFromSettlementMinor;
      }
    }

    const afterSubscriptionDebtMinor = newBalanceMinor < 0n ? -newBalanceMinor : 0n;
    const addedSubscriptionDebtMinor =
      isSubscriptionWalletPayment &&
      afterSubscriptionDebtMinor > beforeSubscriptionDebtMinor
        ? afterSubscriptionDebtMinor - beforeSubscriptionDebtMinor
        : 0n;
    const addedInvoiceDebtMinor =
      addInvoiceDebt && shortfallMinor > 0n ? shortfallMinor : 0n;

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: {
        balance: this.decimalFromMinor(newBalanceMinor),
        debt: this.decimalFromMinor(newDebtMinor),
      },
    });

    // V19.4 — CC pack #11. Tag the order + its ledger row with the
    // currently-active CustomerSubscription (if any) so the customer
    // statement can group invoices by subscription. Nullable by design:
    // walk-in / ad-hoc invoices never had a subscription and must still
    // work. We pick the ACTIVE row; an expired or rolled-over row is
    // ignored because the invoice is being settled "under" the window
    // the customer is currently sitting on.
    const activeSubscription = await tx.customerSubscription.findFirst({
      where: {
        customerId: o.customerId,
        status: CustomerSubscriptionStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (activeSubscription) {
      await tx.order.update({
        where: { id: orderId },
        data: { subscriptionId: activeSubscription.id },
      });
    }

    await tx.transactionHistory.create({
      data: {
        type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
        customerId: o.customerId,
        orderId,
        subscriptionId: activeSubscription?.id ?? null,
        amount: o.totalPrice,
        balanceBefore: wallet.balance,
        balanceAfter: this.decimalFromMinor(newBalanceMinor),
        debtBefore: wallet.debt,
        debtAfter: this.decimalFromMinor(newDebtMinor),
        performedById: performedByUserId,
        metadata: {
          appliedFromWallet: minorToAmountString(safeTakeMinor),
          orderTotal: o.totalPrice.toString(),
          addedToDebt: minorToAmountString(addedInvoiceDebtMinor),
          addedSubscriptionDebt: minorToAmountString(addedSubscriptionDebtMinor),
          posPaymentMethod: o.posPaymentMethod ?? null,
          externalCoversShortfall:
            externalCoversShortfall && shortfallMinor > 0n ? true : false,
          ...(debtPaydownFromSettlementMinor > 0n
            ? {
                debtPaydownFromSettlement: minorToAmountString(
                  debtPaydownFromSettlementMinor,
                ),
              }
            : {}),
          reportingCategory: 'DAILY_SALES',
          subscriptionId: activeSubscription?.id ?? null,
          // Caller-supplied fields (e.g. debt-settlement tagging from the
          // payment gateway) take precedence over the defaults above.
          ...(extraMetadata ?? {}),
        },
      },
    });

    const debtCategory = this.resolveDebtCategory(actor.safariRole);

    // V20.3 — Phase 31 invoice issuance entry.
    //
    // Under the true-accounting model, every invoice — regardless
    // of whether it has a shortfall — is recognised in the journal
    // at the FULL invoice amount on issuance:
    //
    //   DR ACCOUNTS_RECEIVABLE = totalPrice
    //   CR REVENUE             = totalPrice
    //
    // Subsequent payments (wallet absorption + external) credit AR
    // back down. Invoice issuance is idempotent on `orderId` via
    // the deterministic sourceRef inside the journal service, so
    // re-entry from `walletSettledAt` resets is a no-op.
    //
    // Default V20.2 model: skip — the SHORTFALL mirror below already
    // writes AR for the post-wallet remainder.
    const trueAccounting = isV20_3TrueAccountingEnabled();
    if (trueAccounting && totalMinor > 0n) {
      await this.journal.appendInvoiceIssuanceEntrySafe(tx, {
        customerId: o.customerId,
        orderId,
        actorUserId: actor.id,
        amount: o.totalPrice,
      });
    }

    // V20.3 — Phase 32 SHORTFALL semantic change.
    //
    // Under true-accounting the SHORTFALL row records the FULL
    // invoice amount (not the post-wallet remainder), so the
    // DebtLedgerEntry stream reflects gross billing. Wallet
    // absorption and external payments are PAYMENT rows that
    // drive the net down — same shape as the journal.
    //
    // The journal mirror is SKIPPED under V20.3 because Phase 31
    // already wrote the full invoice to AR. Mirroring SHORTFALL
    // again would double-count.
    const recordedShortfallMinor = trueAccounting
      ? addInvoiceDebt && totalMinor > 0n
        ? totalMinor
        : 0n
      : addedInvoiceDebtMinor;
    if (recordedShortfallMinor > 0n) {
      // V20.4 — Phase 5 deterministic sourceRef. The function is
      // idempotent on `order.walletSettledAt` so the SHORTFALL
      // row is at most written once per order; on a transaction
      // retry the unique-index P2002 path returns the existing
      // row instead of creating a duplicate.
      const sourceRef = `INVOICE:${orderId}:SHORTFALL`;
      try {
        await tx.debtLedgerEntry.create({
          data: {
            customerId: o.customerId,
            orderId,
            source: DebtSource.INVOICE_SHORTFALL,
            category: debtCategory,
            amount: this.decimalFromMinor(recordedShortfallMinor),
            branchId: actor.branchId,
            actorUserId: actor.id,
            sourceRef,
            note: trueAccounting
              ? 'Invoice issued (full receivable)'
              : 'Invoice shortfall recorded as receivable',
          },
        });
      } catch (err) {
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError) ||
          err.code !== 'P2002'
        ) {
          throw err;
        }
        // Idempotent retry — row already exists for this orderId
        // SHORTFALL. Continue without re-writing.
      }
      if (!trueAccounting) {
        await this.journal.mirrorDebtLedgerEntrySafe(tx, {
          source: DebtSource.INVOICE_SHORTFALL,
          amount: this.decimalFromMinor(recordedShortfallMinor),
          sourceRef,
          actorUserId: actor.id,
          customerId: o.customerId,
          orderId,
          note: 'Invoice shortfall recorded as receivable',
        });
      }
      // Dastur §5 — mirror the debt change onto the unified GL so every
      // financial movement surfaces on one audit stream.
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: this.decimalFromMinor(recordedShortfallMinor),
        memo: trueAccounting
          ? 'Invoice issued (full receivable)'
          : 'Invoice shortfall recorded as receivable',
        customerId: o.customerId,
        orderId,
        actorUserId: actor.id,
        metadata: {
          source: DebtSource.INVOICE_SHORTFALL,
          category: debtCategory,
          branchId: actor.branchId,
          v20_3: trueAccounting,
        },
      });
    }
    if (addedSubscriptionDebtMinor > 0n) {
      // V20.4 — Phase 5 deterministic sourceRef.
      const sourceRef = `INVOICE:${orderId}:SUBSCRIPTION_OVERUSE`;
      try {
        await tx.debtLedgerEntry.create({
          data: {
            customerId: o.customerId,
            orderId,
            source: DebtSource.SUBSCRIPTION_OVERUSE,
            category: debtCategory,
            amount: this.decimalFromMinor(addedSubscriptionDebtMinor),
            branchId: actor.branchId,
            actorUserId: actor.id,
            sourceRef,
            note: 'Subscription balance allowed to go negative',
          },
        });
      } catch (err) {
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError) ||
          err.code !== 'P2002'
        ) {
          throw err;
        }
        // Idempotent retry — row already exists.
      }
      await this.journal.mirrorDebtLedgerEntrySafe(tx, {
        source: DebtSource.SUBSCRIPTION_OVERUSE,
        amount: this.decimalFromMinor(addedSubscriptionDebtMinor),
        sourceRef,
        actorUserId: actor.id,
        customerId: o.customerId,
        orderId,
        note: 'Subscription balance allowed to go negative',
      });
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: this.decimalFromMinor(addedSubscriptionDebtMinor),
        memo: 'Subscription balance allowed to go negative',
        customerId: o.customerId,
        orderId,
        actorUserId: actor.id,
        metadata: {
          source: DebtSource.SUBSCRIPTION_OVERUSE,
          category: debtCategory,
          branchId: actor.branchId,
        },
      });
    }

    // V20.1 — Wallet-absorption audit row.
    //
    // When the wallet was legitimately used (DEBT_ON_ACCOUNT or
    // SUBSCRIPTION_WALLET path), record the wallet portion as a
    // DebtSource.PAYMENT row tagged with `PAYMENT:WALLET:` so the
    // wallet credit applied to this invoice is visible to AR /
    // Customer-360 / Subscribers / statements.
    //
    // CRITICAL: this row IS audit evidence; it is NOT subtracted from
    // outstanding debt. `isRealDebtLedgerPayment()` excludes the
    // `PAYMENT:WALLET:` prefix precisely because the matching
    // INVOICE_SHORTFALL is already the post-wallet remainder; counting
    // wallet PAYMENT against AR would double-credit the customer.
    //
    // V20.1-v2 — Phase 3.1 deterministic + idempotent.
    // The sourceRef is now `PAYMENT:WALLET:<orderId>:APPLIED` (no
    // timestamp). Together with the existing `@@unique` on
    // `DebtLedgerEntry.sourceRef`, this makes the insert idempotent
    // by construction: a second call (e.g. caused by the V20-FORENSIC
    // §C-8 `walletSettledAt: null` reset path in
    // `manuallyMarkOrderPaidByMethod`) cannot create a duplicate row.
    // We catch P2002 explicitly and log+continue.
    //
    // Journal mirroring is intentionally skipped for this prefix
    // (see DoubleEntryJournalService.mirrorDebtLedgerEntry) — see V20.2
    // follow-up for full revenue recognition into the journal.
    if (safeTakeMinor > 0n) {
      const walletSourceRef = `PAYMENT:WALLET:${orderId}:APPLIED`;
      const walletPaymentPayload = {
        amount: this.decimalFromMinor(safeTakeMinor).toString(),
        customerId: o.customerId,
        orderId,
        source: DebtSource.PAYMENT,
        actorUserId: actor.id,
        sourceRef: walletSourceRef,
        metadata: {
          origin: 'WALLET_ABSORPTION',
          posPaymentMethod: o.posPaymentMethod ?? null,
        },
      };
      assertDebtLedgerPaymentWrite(walletPaymentPayload);
      traceDebtLedgerPaymentWrite({
        sourceFile: 'src/customer-ledger/customer-ledger.service.ts',
        functionName: 'applyOrderWalletSettlementForCompletedOrder.walletAbsorption',
        payload: walletPaymentPayload,
      });
      try {
        await tx.debtLedgerEntry.create({
          data: {
            customerId: o.customerId,
            orderId,
            source: DebtSource.PAYMENT,
            category: debtCategory,
            amount: this.decimalFromMinor(safeTakeMinor),
            branchId: actor.branchId,
            actorUserId: actor.id,
            sourceRef: walletSourceRef,
            note: 'Wallet credit applied to invoice (audit only — not AR-reducing)',
          },
        });
      } catch (err) {
        // V20.1-v2 — Phase 3.1 idempotency guard.
        // P2002 = unique constraint violation on `sourceRef`. Means a
        // wallet-absorption row for this order already exists (re-entry
        // after walletSettledAt reset, or concurrent settlement that
        // raced past the FOR UPDATE lock by skipping the lock helper).
        // Treat as success — the historical row is the source of truth.
        const isUniqueViolation =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';
        if (!isUniqueViolation) throw err;
        // eslint-disable-next-line no-console
        console.warn(
          '[WALLET_ABSORPTION_DUPLICATE_SKIPPED]',
          JSON.stringify({
            orderId,
            customerId: o.customerId,
            sourceRef: walletSourceRef,
            safeTakeMinor: minorToAmountString(safeTakeMinor),
          }),
        );
      }
      // Intentionally NOT appending to GeneralLedger here — the
      // DebtLedgerEntry above is the audit record. A zero-amount
      // DEBT_ADJUSTMENT row would pollute KPI sums, and a non-zero
      // value would risk double-counting against POS_SALE_COMPLETED /
      // INVOICE_SHORTFALL totals already on the GeneralLedger stream.

      // V20.1-v3 — Phase 9 invariant guard.
      //
      // FINAL PRINCIPLE: "Every wallet deduction must have a ledger
      // PAYMENT." We just deducted the wallet (newBalanceMinor below
      // is committed at the end of this tx) and either created the
      // PAYMENT:WALLET:<orderId>:APPLIED row above, or accepted that
      // a prior identical row exists (P2002). Re-read inside the same
      // transaction to confirm — if the row is missing despite both
      // paths, the only explanation is a future refactor bug or a
      // race that bypassed our controls. Abort the entire settlement
      // so the wallet update is rolled back together.
      const auditExists = await tx.debtLedgerEntry.findUnique({
        where: { sourceRef: walletSourceRef },
        select: { id: true },
      });
      if (!auditExists) {
        // eslint-disable-next-line no-console
        console.error(
          '[INVALID_PAYMENT]',
          JSON.stringify({
            reason: 'WALLET_DEDUCTION_WITHOUT_PAYMENT_RECORD',
            orderId,
            customerId: o.customerId,
            sourceRef: walletSourceRef,
            safeTakeMinor: minorToAmountString(safeTakeMinor),
          }),
        );
        throw new Error('WALLET_DEDUCTION_WITHOUT_PAYMENT_RECORD');
      }

      // V20.3 — Phase 33 wallet absorption journal entry (true model).
      //
      // Under V20.3, the issuance entry above already DEBITED AR by
      // the FULL invoice, so wallet absorption can correctly CREDIT
      // AR by the wallet portion: DR WALLET_LIABILITY / CR AR. The
      // resulting AR balance equals the customer's actual debt.
      //
      // V20.2 fallback: AR was only debited for the post-wallet
      // remainder via the SHORTFALL mirror, so wallet absorption
      // must stay AR-neutral (DR WALLET_LIABILITY / CR REVENUE).
      //
      // "NO MONEY MOVES WITHOUT 3 ENTRIES" — TransactionHistory was
      // written above (line ~478), the DebtLedgerEntry PAYMENT:WALLET:
      // was written/asserted above, and the third entry (Journal) is
      // written here. The Safe variant feeds the Phase 16 circuit
      // breaker on failure but does not abort this transaction.
      if (trueAccounting) {
        await this.journal.appendWalletAbsorptionEntryV3Safe(tx, {
          customerId: o.customerId,
          orderId,
          actorUserId: actor.id,
          amount: this.decimalFromMinor(safeTakeMinor),
        });
      } else {
        await this.journal.appendWalletAbsorptionEntrySafe(tx, {
          customerId: o.customerId,
          orderId,
          actorUserId: actor.id,
          amount: this.decimalFromMinor(safeTakeMinor),
        });
      }
    }

    await tx.order.updateMany({
      where: { id: orderId, walletSettledAt: null },
      data: { walletSettledAt: new Date() },
    });

    // V19.11 — Unified DebtLedgerEntry: when a settlement is tagged as a
    // real debt payment (CC "تم الدفع" = `debtSettlementViaCallCenter`,
    // gateway callback = `debtSettlementViaLink`), mirror the **actual**
    // aggregate debt pay-down (see `debtPaydownFromSettlementMinor` above)
    // as a PAYMENT row. Amount may be less than `debtSettled` when the
    // customer had no open debt.
    if (debtPaydownFromSettlementMinor > 0n) {
      const trigger =
        extraMetadata?.debtSettlementViaCallCenter === true
          ? 'CALL_CENTER_MANUAL'
          : extraMetadata?.debtSettlementViaLink === true
            ? 'PAYMENT_LINK_CALLBACK'
            : 'WALLET_SETTLEMENT';
      const origin =
        o.posPaymentMethod === PosPaymentMethod.CASH ||
        o.posPaymentMethod === PosPaymentMethod.KNET ||
        o.posPaymentMethod === PosPaymentMethod.ONLINE ||
        o.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK
          ? o.posPaymentMethod
          : trigger;
      // V20.4 — Phase 5 deterministic sourceRef. The function is
      // idempotent on `walletSettledAt`, so the PAYMENT row is at
      // most written once per (orderId, origin, trigger). Retry
      // safely lands on P2002 → no-op.
      const sourceRef = `PAYMENT:${origin}:${orderId}:${trigger}`;
      const paymentPayload = {
        amount: this.decimalFromMinor(debtPaydownFromSettlementMinor).toString(),
        customerId: o.customerId,
        orderId,
        source: DebtSource.PAYMENT,
        actorUserId: actor.id,
        sourceRef,
        metadata: { origin, trigger },
      };
      assertDebtLedgerPaymentWrite(paymentPayload);
      traceDebtLedgerPaymentWrite({
        sourceFile: 'src/customer-ledger/customer-ledger.service.ts',
        functionName: 'applyOrderWalletSettlementForCompletedOrder',
        payload: paymentPayload,
      });
      try {
        await tx.debtLedgerEntry.create({
          data: {
            customerId: o.customerId,
            orderId,
            source: DebtSource.PAYMENT,
            category: debtCategory,
            amount: this.decimalFromMinor(debtPaydownFromSettlementMinor),
            branchId: actor.branchId,
            actorUserId: actor.id,
            sourceRef,
            note: 'Invoice debt settled (wallet settlement)',
          },
        });
      } catch (err) {
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError) ||
          err.code !== 'P2002'
        ) {
          throw err;
        }
        // Idempotent retry — PAYMENT row already recorded.
      }
      // V20.3 — Phase 34 external payment journal entry.
      //
      // Under true-accounting, every external payment writes
      // DR <CASH/BANK> / CR ACCOUNTS_RECEIVABLE keyed on a
      // payment-event-level paymentRef (vs the legacy DebtLedger
      // sourceRef-keyed mirror). The legacy mirror is skipped to
      // avoid a double credit on AR.
      if (trueAccounting && o.posPaymentMethod) {
        await this.journal.appendExternalPaymentEntrySafe(tx, {
          customerId: o.customerId,
          orderId,
          actorUserId: actor.id,
          amount: this.decimalFromMinor(debtPaydownFromSettlementMinor),
          paymentMethod: o.posPaymentMethod,
          paymentRef: `${orderId}:${o.posPaymentMethod}:${trigger}`,
          note: 'Invoice debt settled (wallet settlement)',
        });
      } else {
        await this.journal.mirrorDebtLedgerEntrySafe(tx, {
          source: DebtSource.PAYMENT,
          amount: this.decimalFromMinor(debtPaydownFromSettlementMinor),
          sourceRef,
          actorUserId: actor.id,
          customerId: o.customerId,
          orderId,
          paymentMethod: o.posPaymentMethod,
          note: 'Invoice debt settled (wallet settlement)',
        });
      }
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: `-${minorToAmountString(debtPaydownFromSettlementMinor)}`,
        memo: 'Debt payment recorded on unified ledger',
        customerId: o.customerId,
        orderId,
        actorUserId: actor.id,
        metadata: {
          source: DebtSource.PAYMENT,
          category: debtCategory,
          branchId: actor.branchId,
          trigger,
          declaredDebtSettled: debtSettledStr,
        },
      });
    }

    // V20.1-v4 — Phase 18 real-time drift blocker.
    //
    // After ALL writes are queued in this transaction (wallet update,
    // SHORTFALL/OVERUSE rows, wallet absorption PAYMENT, journal
    // entries, debt-paydown PAYMENT), recompute the customer's
    // ledger-net debt and compare to the wallet.debt that's about to
    // commit. They MUST match within 0.001 KD — otherwise this
    // transaction would commit a state that already has a known drift.
    //
    // Throwing here forces the entire transaction to roll back:
    //   • CustomerWallet.balance / debt update      → reverted
    //   • New DebtLedgerEntry rows                   → reverted
    //   • New JournalEntry / JournalLine rows        → reverted
    //   • New TransactionHistory row                 → reverted
    //   • Order.walletSettledAt update               → reverted
    //
    // Cost: one DebtLedgerEntry aggregation query per settlement —
    // unavoidable to satisfy the v4 invariant. If profiling shows
    // this becomes a hot path, the aggregation can be replaced by
    // an in-process accumulator that tracks deltas as we go.
    await this.assertSettlementInvariantTx(tx, o.customerId);

    // V20.2 — Phase 29 journal-ledger lockstep.
    //
    // Compare the live DebtLedger AR (computed from
    // assertSettlementInvariantTx scope: SHORTFALL+OVERUSE − real
    // PAYMENT) to the journal AR balance for this customer (sum of
    // debits − credits on account 1300). Within the same tx, both
    // numbers reflect the about-to-commit state. If they diverge by
    // more than 0.001 KD this transaction is committing a known
    // ledger/journal split — refuse and roll everything back so the
    // operator must triage before more drift accumulates.
    //
    // Failure modes captured here:
    //   • A `mirrorDebtLedgerEntrySafe` write silently dropped (and
    //     the breaker hasn't tripped yet because the failure window
    //     was below threshold).
    //   • A new SHORTFALL prefix introduced by future code that
    //     forgot to mirror to the journal.
    //   • A wallet-absorption journal entry that accidentally hit
    //     AR (V20.3 refactor regression).
    await this.assertJournalLedgerLockstepTx(tx, o.customerId);

    // V20.2 — Phase 28 hard global invariant.
    //
    // Recompute walletBalance + totalPayments + totalDebt vs
    // totalInvoices for this customer using the still-uncommitted
    // tx view. The historical baseline is loud (wallet balances
    // were never recorded as a counter-entry in DebtLedger), so the
    // STRICT enforcement (throw) is gated on
    // `STRICT_GLOBAL_INVARIANT=true`. By default we LOG only — the
    // existing audit endpoint stays the source of truth for
    // operators triaging legacy data.
    await this.assertGlobalInvariantTx(tx, o.customerId);
  }

  /**
   * V20.2 — Phase 29 lockstep helper.
   *
   * Within the open transaction, recomputes the DebtLedger net AR
   * (the same waterfall used by the v4 Phase 18 assertion) and the
   * journal AR balance (Σ(debit) − Σ(credit) on account 1300 for
   * this customer). Throws `LEDGER_JOURNAL_DIVERGENCE` when
   * `|delta| > 0.001 KD`, rolling the transaction back.
   *
   * V20.3 — under `V20_3_TRUE_ACCOUNTING=true` the SHORTFALL row is
   * gross and wallet PAYMENTs reduce AR, matching the journal side.
   */
  private async assertJournalLedgerLockstepTx(
    tx: PrismaTx,
    customerId: string,
  ): Promise<void> {
    const trueAccounting = isV20_3TrueAccountingEnabled();
    const rows = await tx.debtLedgerEntry.findMany({
      where: { customerId },
      select: {
        source: true,
        amount: true,
        actorUserId: true,
        sourceRef: true,
        note: true,
      },
    });
    let inv = new Prisma.Decimal(0);
    let sub = new Prisma.Decimal(0);
    let pay = new Prisma.Decimal(0);
    for (const r of rows) {
      const amt = new Prisma.Decimal(r.amount?.toString() ?? '0');
      if (r.source === DebtSource.INVOICE_SHORTFALL) inv = inv.add(amt);
      else if (r.source === DebtSource.SUBSCRIPTION_OVERUSE) sub = sub.add(amt);
      else if (r.source === DebtSource.PAYMENT) {
        if (trueAccounting || isRealDebtLedgerPayment(r)) pay = pay.add(amt);
      }
    }
    const invPaid = inv.lessThanOrEqualTo(pay) ? inv : pay;
    const payAfterInv = pay.sub(invPaid);
    const subPaid = sub.lessThanOrEqualTo(payAfterInv) ? sub : payAfterInv;
    const ledgerNet = inv.sub(invPaid).add(sub.sub(subPaid));

    const lines = await tx.journalLine.findMany({
      where: {
        entry: { customerId },
        account: { code: '1300' },
      },
      select: { debit: true, credit: true },
    });
    let journalAr = new Prisma.Decimal(0);
    for (const line of lines) {
      journalAr = journalAr
        .add(new Prisma.Decimal(line.debit.toString()))
        .sub(new Prisma.Decimal(line.credit.toString()));
    }

    const delta = ledgerNet.sub(journalAr).abs();
    if (delta.greaterThan(new Prisma.Decimal('0.001'))) {
      // eslint-disable-next-line no-console
      console.error(
        '[LEDGER_JOURNAL_DIVERGENCE]',
        JSON.stringify({
          customerId,
          ledgerNetKd: ledgerNet.toFixed(4),
          journalArKd: journalAr.toFixed(4),
          deltaKd: delta.toFixed(4),
          v20_3: trueAccounting,
        }),
      );
      throw new Error('LEDGER_JOURNAL_DIVERGENCE');
    }
  }

  /**
   * V20.2 — Phase 28 global invariant helper.
   *
   * Recomputes the customer's `walletBalance + totalPayments +
   * totalDebt` versus `totalInvoices` from the in-tx view. By
   * default this is a LOG-only signal (mirrors the v4
   * `checkGlobalInvariant` audit endpoint) because the historical
   * baseline is noisy: wallet balances were never recorded as a
   * counter-entry in DebtLedger when the system was first seeded,
   * so legacy customers can show non-zero drift even with perfectly
   * consistent live writes.
   *
   * To enable the literal V20.2 contract (THROW
   * "GLOBAL_INVARIANT_VIOLATION"), set
   * `STRICT_GLOBAL_INVARIANT=true`. Operators are expected to
   * verify the audit endpoint shows zero violations before
   * flipping the flag, otherwise every wallet settlement will
   * roll back.
   */
  private async assertGlobalInvariantTx(
    tx: PrismaTx,
    customerId: string,
  ): Promise<void> {
    const wallet = await tx.customerWallet.findUnique({
      where: { customerId },
      select: { balance: true, debt: true },
    });
    if (!wallet) return;
    const rows = await tx.debtLedgerEntry.findMany({
      where: { customerId },
      select: { source: true, amount: true, sourceRef: true },
    });
    let invoices = new Prisma.Decimal(0);
    let payments = new Prisma.Decimal(0);
    for (const r of rows) {
      const amt = new Prisma.Decimal(r.amount?.toString() ?? '0');
      if (
        r.source === DebtSource.INVOICE_SHORTFALL ||
        r.source === DebtSource.SUBSCRIPTION_OVERUSE
      ) {
        invoices = invoices.add(amt);
      } else if (r.source === DebtSource.PAYMENT) {
        payments = payments.add(amt);
      }
    }
    const walletBalance = new Prisma.Decimal(wallet.balance.toString());
    const walletDebt = new Prisma.Decimal(wallet.debt.toString());
    const lhs = walletBalance.add(payments).add(walletDebt);
    const rhs = invoices;
    const delta = lhs.sub(rhs).abs();
    if (delta.greaterThan(new Prisma.Decimal('0.001'))) {
      const strict =
        (process.env.STRICT_GLOBAL_INVARIANT ?? '').toString().trim() ===
          'true' ||
        (process.env.STRICT_GLOBAL_INVARIANT ?? '').toString().trim() === '1';
      const payload = JSON.stringify({
        customerId,
        walletBalanceKd: walletBalance.toFixed(4),
        totalPaymentsKd: payments.toFixed(4),
        totalDebtKd: walletDebt.toFixed(4),
        totalInvoicesKd: invoices.toFixed(4),
        lhsKd: lhs.toFixed(4),
        rhsKd: rhs.toFixed(4),
        deltaKd: delta.toFixed(4),
        strict,
      });
      // eslint-disable-next-line no-console
      console.error('[GLOBAL_INVARIANT_VIOLATION]', payload);
      if (strict) {
        throw new Error('GLOBAL_INVARIANT_VIOLATION');
      }
    }
  }

  /**
   * V20.1-v4 — Phase 18 invariant assertion helper.
   *
   * Computes the live ledgerNet for the customer (using the
   * still-uncommitted transaction view) and asserts it equals
   * the wallet.debt that's about to commit. Throws
   * `FINANCIAL_INCONSISTENCY_DETECTED` on mismatch — the only safe
   * action when wallet and ledger disagree.
   *
   * V20.3 — when `V20_3_TRUE_ACCOUNTING=true` the SHORTFALL row
   * carries the FULL invoice amount and wallet PAYMENT rows
   * actively reduce AR (because the issuance entry already
   * debited AR for the full invoice). To keep this invariant
   * meaningful we must therefore COUNT wallet PAYMENT rows in
   * the deduction side.
   */
  private async assertSettlementInvariantTx(
    tx: PrismaTx,
    customerId: string,
  ): Promise<void> {
    const wallet = await tx.customerWallet.findUnique({
      where: { customerId },
      select: { debt: true, balance: true },
    });
    if (!wallet) return;
    const walletDebt = new Prisma.Decimal(wallet.debt.toString());
    const balance = new Prisma.Decimal(wallet.balance.toString());
    const subscriptionOveruseDebt = balance.lessThan(0)
      ? balance.abs()
      : new Prisma.Decimal(0);
    const totalWalletDebtKd = walletDebt.plus(subscriptionOveruseDebt);

    const trueAccounting = isV20_3TrueAccountingEnabled();
    const rows = await tx.debtLedgerEntry.findMany({
      where: { customerId },
      select: {
        source: true,
        amount: true,
        actorUserId: true,
        sourceRef: true,
        note: true,
      },
    });
    let inv = new Prisma.Decimal(0);
    let sub = new Prisma.Decimal(0);
    let pay = new Prisma.Decimal(0);
    for (const r of rows) {
      const amt = new Prisma.Decimal(r.amount?.toString() ?? '0');
      if (r.source === DebtSource.INVOICE_SHORTFALL) inv = inv.add(amt);
      else if (r.source === DebtSource.SUBSCRIPTION_OVERUSE)
        sub = sub.add(amt);
      else if (r.source === DebtSource.PAYMENT) {
        // Under V20.3 the wallet PAYMENT row is a true reducer
        // of AR (the issuance entry credited AR for the gross
        // invoice). Count every PAYMENT, not just the v2 "real"
        // subset (which excluded `PAYMENT:WALLET:`).
        if (trueAccounting || isRealDebtLedgerPayment(r)) pay = pay.add(amt);
      }
    }
    const invPaid = inv.lessThanOrEqualTo(pay) ? inv : pay;
    const payAfterInv = pay.sub(invPaid);
    const subPaid = sub.lessThanOrEqualTo(payAfterInv) ? sub : payAfterInv;
    const ledgerNet = inv.sub(invPaid).add(sub.sub(subPaid));

    const drift = totalWalletDebtKd.sub(ledgerNet).abs();
    if (drift.greaterThan(new Prisma.Decimal('0.001'))) {
      // eslint-disable-next-line no-console
      console.error(
        '[FINANCIAL_INCONSISTENCY_DETECTED]',
        JSON.stringify({
          customerId,
          walletDebtKd: totalWalletDebtKd.toFixed(4),
          ledgerNetKd: ledgerNet.toFixed(4),
          driftKd: drift.toFixed(4),
          v20_3: trueAccounting,
        }),
      );
      throw new Error('FINANCIAL_INCONSISTENCY_DETECTED');
    }
  }

  /**
   * Subscription / top-up: cash collected (`plan.salePrice`) retires customer debt first
   * (up to min(existing debt, salePrice)), then prepaid balance increases by
   * max(0, plan.actualBalance − debtRetired). Cannot be bypassed — all activations go through here.
   */
  async activateSubscriptionPlan(
    tx: PrismaTx,
    params: {
      customerId: string;
      planId: string;
      performedByUserId: string;
      /**
       * V19.7.4 — "Convert debt → subscription" opt-in: FIFO-close
       * the customer's unpaid invoices using the debt-settled portion
       * of this activation. Default false keeps the regular Upgrade
       * flow unchanged (invoices stay open as receivables).
       */
      autoCloseInvoices?: boolean;
      /**
       * How `{@link SubscriptionPlan.salePrice}` collection was recognised.
       * Mandatory on every activation (same enum as ActivateSubscriptionDto).
       */
      paymentMethod: SubscriptionActivationPaymentMethod;
      /**
       * When true, skip the prepaid FIFO auto-reconcile pass at the end so the
       * caller can run `runPrepaidAutoReconcileForCustomer` in a separate
       * transaction — avoids one long interactive transaction (P2028).
       */
      skipPrepaidAutoReconcile?: boolean;
    },
  ): Promise<SubscriptionActivationSettlement> {
    const plan = await tx.subscriptionPlan.findUnique({
      where: { id: params.planId },
    });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    if (!plan.isActive) {
      throw new BadRequestException('This subscription plan is not active');
    }
    const customer = await tx.customer.findUnique({
      where: { id: params.customerId },
      select: { id: true, originBranchId: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const wallet = await this.getOrCreateWalletTx(tx, params.customerId);
    // V20.4 — Phase 5 row-level lock. Closes the lost-update race
    // between concurrent activations and concurrent invoice
    // settlements on the same customer. Without this, two CC
    // agents activating on the same wallet can both read the
    // pre-balance and overwrite each other's update, producing a
    // wallet that's off by exactly one activation amount while
    // the journal carries both entries.
    await this.lockCustomerWalletForUpdateTx(tx, wallet.id);
    const actor = await tx.user.findUnique({
      where: { id: params.performedByUserId },
      select: { id: true, branchId: true, safariRole: true },
    });
    if (!actor) {
      throw new NotFoundException('Performing user not found');
    }
    await this.ensureCustomerOriginBranchTx(tx, params.customerId, actor.branchId);
    const refreshedCustomer = await tx.customer.findUnique({
      where: { id: params.customerId },
      select: { originBranchId: true },
    });
    const subsidyBranchId = refreshedCustomer?.originBranchId ?? actor.branchId ?? null;
    const balanceMinor = toMinorFromFixed4(wallet.balance);
    const debtMinor = toMinorFromFixed4(wallet.debt);
    const debtBreakdown = await this.orders.getOperationalDebtKdBreakdown(
      params.customerId,
      wallet.debt,
      tx,
    );
    const implicitReceivableMinor = toMinorFromFixed4(
      debtBreakdown.collectionsReceivableKd,
    );
    const operationalDebtMinor = toMinorFromFixed4(debtBreakdown.operationalDebtKd);
    const priceMinor = toMinorFromFixed4(plan.salePrice);
    const creditMinor = toMinorFromFixed4(plan.actualBalance);

    if (priceMinor < 0n || creditMinor < 0n) {
      throw new BadRequestException('Plan price and credit amount must be non-negative');
    }

    // V19.7.2 — guard against misconfigured plans that have salePrice=0
    // AND actualBalance=0. Without this check, activation "succeeds" but
    // leaves debt and balance untouched, so the operator sees a green
    // toast while the numbers on the subscriber list never change. That
    // exact symptom ("ترقية الاشتراك مو شغال / ولاتخصم / تحويل المديونية
    // مايخصم المتبقي") was traced to the seed plan "اشتراك 20" having
    // price=0 and credit=0 in the DB. Refusing activation up-front with
    // a clear message tells the Owner to fix the plan pricing instead
    // of letting the number drift silently.
    if (priceMinor === 0n && creditMinor === 0n) {
      throw new BadRequestException(
        `Subscription plan "${plan.name}" is misconfigured: both sale price and credit amount are 0. Ask the Owner to set them in Subscription Plans before activating.`,
      );
    }

    let collectionPaymentMethod: PosPaymentMethod;
    if (!params.paymentMethod) {
      throw new BadRequestException(
        'paymentMethod is required for every subscription activation',
      );
    }
    if (
      !(SUBSCRIPTION_ACTIVATION_PAYMENT_METHODS as readonly string[]).includes(
        params.paymentMethod,
      )
    ) {
      throw new BadRequestException(
        'Invalid paymentMethod for subscription activation',
      );
    }
    collectionPaymentMethod = params.paymentMethod;

    // V19.7.3 — Owner directive: the subscription's CREDIT amount
    // (`actualBalance`) is what reduces existing debt, NOT the sale
    // price. Previous logic "debtPaid = min(debt, salePrice)" produced
    // counter-intuitive numbers in the "Convert debt → subscription"
    // flow (owner said: "مو يخصم قيمة الاشتراك بس المبلغ المضاف إلى
    // الاشتراك يخصم من المديونية"). Under the new rule the full
    // plan value handed to the customer is applied against outstanding
    // debt first; only whatever remains after debt is cleared lands in
    // the wallet.
    //
    // Example (plan 20/25 cash/credit, customer owes 100):
    //   OLD: debtPaid=20 → newDebt=80, wallet +5
    //   NEW: debtPaid=25 → newDebt=75, wallet +0
    //
    // Behavior for debt-free customers is unchanged: debtPaid=0, the
    // full credit still lands in the wallet.
    //
    // V19.12.1 — **operationalDebtKd** mirrors `DebtLedgerEntry` net + snapshot
    // reconciliation. This is NOT the canonical Customer 360 financial number;
    // do not add wallet.debt twice here (`operationalDebtMinor` is totals from breakdown).
    const debtPaidMinor =
      operationalDebtMinor < creditMinor ? operationalDebtMinor : creditMinor;
    let newDebtMinor =
      debtMinor - (debtPaidMinor < debtMinor ? debtPaidMinor : debtMinor);
    const accrueSaleOnAccount =
      priceMinor > 0n &&
      collectionPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT;
    if (accrueSaleOnAccount) {
      newDebtMinor += priceMinor;
    }

    this.logger.log(
      `[subscription-activation] customerId=${params.customerId} planId=${params.planId} ` +
        `walletDebtMinor=${debtMinor.toString()} implicitUnpostedMinor=${implicitReceivableMinor.toString()} ` +
        `operationalDebtMinor=${operationalDebtMinor.toString()} planCreditMinor=${creditMinor.toString()} ` +
        `debtPaidMinor=${debtPaidMinor.toString()} autoCloseInvoices=${params.autoCloseInvoices === true} ` +
        `collectionPaymentMethod=${collectionPaymentMethod} accrueSaleOnAccount=${accrueSaleOnAccount}`,
    );
    const rawCreditMinor = creditMinor - debtPaidMinor;
    const balanceIncreaseMinor =
      rawCreditMinor > 0n ? rawCreditMinor : 0n;
    const newBalanceMinor = balanceMinor + balanceIncreaseMinor;

    const activatedAt = new Date();
    const validityDays = plan.validityDays > 0 ? plan.validityDays : 30;
    const subscriptionExpiresAt = new Date(activatedAt.getTime());
    subscriptionExpiresAt.setUTCDate(
      subscriptionExpiresAt.getUTCDate() + validityDays,
    );

    // V19.4 — CC pack #2/#11/#12: per-subscription ledger.
    //
    // Close the predecessor (if any) and open a new CustomerSubscription
    // row BEFORE we mutate the wallet. The carried balance snapshots the
    // *pre-activation* wallet state so the operator can later see
    // exactly what the customer was holding when the rollover happened
    // — including whether it was prepaid credit (+) or outstanding
    // debt (-). Option 2-A: even if the previous subscription has been
    // expired for months, we still roll its ledger forward; this keeps
    // old debts visible instead of quietly forgiving them.
    const previousSubscription = await tx.customerSubscription.findFirst({
      where: {
        customerId: params.customerId,
        status: {
          in: [
            CustomerSubscriptionStatus.ACTIVE,
            CustomerSubscriptionStatus.EXPIRED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const carriedBalanceMinor = balanceMinor - debtMinor;
    const carriedBalanceStr = minorToAmountString(carriedBalanceMinor);
    const carriedBalanceDecimal = new Prisma.Decimal(carriedBalanceStr);

    const newSubscription = await tx.customerSubscription.create({
      data: {
        customerId: params.customerId,
        planId: plan.id,
        status: CustomerSubscriptionStatus.ACTIVE,
        planNameSnapshot: plan.name,
        planSalePriceSnapshot: plan.salePrice,
        planActualBalanceSnapshot: plan.actualBalance,
        planValidityDaysSnapshot: validityDays,
        carriedBalanceKd: carriedBalanceDecimal,
        parentSubscriptionId: previousSubscription?.id ?? null,
        activatedAt,
        expiresAt: subscriptionExpiresAt,
      },
    });

    if (previousSubscription) {
      await tx.customerSubscription.update({
        where: { id: previousSubscription.id },
        data: {
          status: CustomerSubscriptionStatus.ROLLED_OVER,
          closedAt: activatedAt,
          closedReason: 'ROLLOVER',
        },
      });
    }

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: {
        balance: this.decimalFromMinor(newBalanceMinor),
        debt: this.decimalFromMinor(newDebtMinor),
        subscriptionActivatedAt: activatedAt,
        subscriptionExpiresAt,
        subscriptionPlanId: plan.id,
        subscriptionPlanName: plan.name,
      },
    });

    const totalCollectedStr = minorToAmountString(priceMinor);
    const debtSettledStr = minorToAmountString(debtPaidMinor);
    const creditedStr = minorToAmountString(balanceIncreaseMinor);
    const subsidyMinor = creditMinor > priceMinor ? creditMinor - priceMinor : 0n;
    const subsidyStr = minorToAmountString(subsidyMinor);

    await tx.transactionHistory.create({
      data: {
        type: LedgerTransactionType.SUBSCRIPTION_ACTIVATION,
        customerId: params.customerId,
        subscriptionId: newSubscription.id,
        amount: plan.actualBalance,
        balanceBefore: wallet.balance,
        balanceAfter: this.decimalFromMinor(newBalanceMinor),
        debtBefore: wallet.debt,
        debtAfter: this.decimalFromMinor(newDebtMinor),
        performedById: params.performedByUserId,
        metadata: {
          planId: plan.id,
          planName: plan.name,
          salePrice: plan.salePrice.toString(),
          actualBalance: plan.actualBalance.toString(),
          totalCollected: totalCollectedStr,
          debtSettled: debtSettledStr,
          creditedToBalance: creditedStr,
          subsidy: subsidyStr,
          subsidyBranchId,
          automaticDebtSettlement: true,
          rolledOverFromSubscriptionId: previousSubscription?.id ?? null,
          carriedBalanceKd: carriedBalanceStr,
          implicitUnpostedReceivableKd: minorToAmountString(implicitReceivableMinor),
          operationalDebtForActivationKd: minorToAmountString(operationalDebtMinor),
          effectiveDebtForActivationKd: minorToAmountString(operationalDebtMinor),
          posPaymentMethod: collectionPaymentMethod,
          planSaleSettlement: accrueSaleOnAccount
            ? 'ACCOUNTS_RECEIVABLE'
            : priceMinor > 0n
              ? 'IMMEDIATE_COLLECTION'
              : 'NONE',
        },
      },
    });

    if (priceMinor > 0n && !accrueSaleOnAccount) {
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.POS_SALE_COMPLETED,
        amount: plan.salePrice,
        memo: 'Subscription activation — plan sale (immediate collection)',
        customerId: params.customerId,
        actorUserId: params.performedByUserId,
        metadata: {
          posPaymentMethod: collectionPaymentMethod,
          source: 'CALL_CENTER_SUBSCRIPTION_ACTIVATION',
          subscriptionId: newSubscription.id,
          planId: plan.id,
        },
      });
    }
    if (accrueSaleOnAccount && priceMinor > 0n) {
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: plan.salePrice.toString(),
        memo: 'Subscription activation — plan sale on account (wallet debt)',
        customerId: params.customerId,
        actorUserId: params.performedByUserId,
        metadata: {
          event: 'SUBSCRIPTION_PLAN_DEFERRED',
          source: 'CALL_CENTER_SUBSCRIPTION_ACTIVATION',
          posPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          subscriptionId: newSubscription.id,
          planId: plan.id,
        },
      });
    }

    // V19.7.4 — FIFO invoice auto-closure (opt-in via `autoCloseInvoices`).
    // Context: `wallet.debt` is posted aggregate receivable; UNPAID orders
    // may still exist (e.g. payment-link pending) and are folded into
    // `operationalDebtMinor` above. When this flag is true and `debtPaidMinor`
    // is positive, we FIFO-close matching UNPAID rows so collections matches
    // wallet state.
    //
    // Algorithm: walk completed+unpaid invoices oldest-first and mark
    // any fully covered by `debtPaidMinor` as PAID_TO_DRIVER. We do not
    // split a single invoice (no partial allocation) so the audit trail
    // remains clean. We also do NOT re-run wallet settlement — the
    // wallet update above already absorbed these invoices' receivables
    // via the original `applyOrderWalletSettlementForCompletedOrder`
    // call; double-counting would leave the wallet off by 2×.
    //
    // V19.8.2 — the candidate predicate now EXACTLY mirrors the red
    // "إجمالي الديون السوقية" tile (UNPAID AND NOT CANCELED) so every
    // invoice the tile counts is fair game for FIFO closure, including
    // legacy orders seeded with `status=PENDING` and
    // `walletSettledAt=NULL` whose receivables were already captured
    // in `wallet.debt` at import/migration time. Earlier we required
    // `status=COMPLETED AND walletSettledAt != null`, which excluded
    // the entire legacy set and left the red tile stuck even after
    // the wallet-level debt had been paid down by the activation. The
    // no-double-count guarantee still holds: flipping `cashStatus` to
    // PAID_TO_DRIVER is a pure status flag change and does NOT touch
    // the wallet balance again.
    const closedInvoiceIds: string[] = [];
    /** FIFO allocation by invoice, including partial allocations. */
    const invoicePaymentAmountById = new Map<string, Prisma.Decimal>();
    if (params.autoCloseInvoices === true && debtPaidMinor > 0n) {
      const candidates = await tx.order.findMany({
        where: {
          customerId: params.customerId,
          cashStatus: CashStatus.UNPAID,
          status: { not: OrderStatus.CANCELED },
        },
        select: { id: true, totalPrice: true },
        orderBy: { createdAt: 'asc' },
      });
      // V20.3.1 — measure each candidate against its REMAINING
      // balance (gross − payments − wallet) instead of the gross
      // `totalPrice`. Without this, an invoice that already
      // received a partial payment outside the activation flow
      // could never be auto-closed by a budget that is short of
      // the gross but enough to cover the remaining.
      const remainingByOrder = await computeOrderRemainingBalancesBatch(
        tx,
        candidates.map((c) => c.id),
      );
      const tolMinor = toMinorFromFixed4(
        new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD),
      );
      let remainingMinor = debtPaidMinor;
      for (const inv of candidates) {
        if (remainingMinor <= 0n) break;
        const invRem = remainingByOrder.get(inv.id) ?? inv.totalPrice;
        if (invRem.lessThanOrEqualTo(0)) continue;
        const invRemMinor = toMinorFromFixed4(invRem);
        if (invRemMinor <= tolMinor) continue;
        const appliedMinor =
          invRemMinor < remainingMinor ? invRemMinor : remainingMinor;
        invoicePaymentAmountById.set(inv.id, this.decimalFromMinor(appliedMinor));
        remainingMinor -= appliedMinor;
        if (appliedMinor >= invRemMinor) {
          closedInvoiceIds.push(inv.id);
        }
      }
      if (closedInvoiceIds.length > 0) {
        // One UPDATE instead of N sequential updates — critical on high-
        // latency links (P2028) when many small invoices FIFO-close here.
        await tx.order.updateMany({
          where: {
            customerId: params.customerId,
            id: { in: closedInvoiceIds },
          },
          data: { cashStatus: CashStatus.PAID_TO_DRIVER },
        });
      }
    }

    // Dastur §5 — if this activation paid down existing debt, record the
    // reduction in the unified GL so collections/adjustments never hide.
    if (debtPaidMinor > 0n) {
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: `-${debtSettledStr}`,
        memo: 'Subscription activation settled existing debt',
        customerId: params.customerId,
        actorUserId: params.performedByUserId,
        metadata: {
          event: 'DEBT_SETTLED',
          source: 'SUBSCRIPTION_ACTIVATION',
          planId: plan.id,
          planName: plan.name,
          subsidyBranchId,
          subscriptionId: newSubscription.id,
          rolledOverFromSubscriptionId: previousSubscription?.id ?? null,
          // V19.7.4 — audit trail: which invoices were FIFO-closed by
          // this activation. Empty array when `autoCloseInvoices` was
          // off or no invoice was fully covered.
          autoClosedInvoiceIds: closedInvoiceIds,
          autoClosedInvoiceCount: closedInvoiceIds.length,
        },
      });

      // V19.11/V22 — Unified DebtLedgerEntry. FIFO-write one PAYMENT row per
      // invoice allocation, including partial allocations, plus a residual
      // customer-level PAYMENT only when the settled debt had no invoice row
      // to attach to. This keeps Customer360/order remaining balances aligned:
      // a 30.250 invoice settled by 25.000 subscription credit now shows
      // 5.250 remaining instead of looking either fully unpaid or detached.
      const category = this.resolveDebtCategory(actor.safariRole);
      let coveredMinor = 0n;
      for (const [, amt] of invoicePaymentAmountById) {
        if (!amt) continue;
        coveredMinor += toMinorFromFixed4(amt);
      }
      if (invoicePaymentAmountById.size > 0) {
        const paymentRows = Array.from(invoicePaymentAmountById.entries()).flatMap(([invoiceId, amt]) => {
          if (!amt) return [];
          const sourceRef = `PAYMENT:SUBSCRIPTION_ACTIVATION:${newSubscription.id}:${invoiceId}`;
          const payload = {
            customerId: params.customerId,
            orderId: invoiceId,
            source: DebtSource.PAYMENT,
            category,
            amount: amt,
            branchId: subsidyBranchId,
            actorUserId: params.performedByUserId,
            sourceRef,
            note: 'Invoice closed by subscription activation (FIFO)',
          };
          assertDebtLedgerPaymentWrite(payload);
          traceDebtLedgerPaymentWrite({
            sourceFile: 'src/customer-ledger/customer-ledger.service.ts',
            functionName: 'activateSubscriptionPlan.closedInvoices',
            payload: {
              amount: amt.toString(),
              customerId: params.customerId,
              orderId: invoiceId,
              source: DebtSource.PAYMENT,
              actorUserId: params.performedByUserId,
              sourceRef,
              metadata: { origin: 'SUBSCRIPTION_ACTIVATION' },
            },
          });
          return payload;
        });
        await tx.debtLedgerEntry.createMany({
          data: paymentRows,
        });
        for (const row of paymentRows) {
          await this.journal.mirrorDebtLedgerEntrySafe(tx, {
            source: DebtSource.PAYMENT,
            amount: row.amount,
            sourceRef: row.sourceRef,
            actorUserId: row.actorUserId,
            customerId: row.customerId,
            orderId: row.orderId,
            paymentMethod: params.paymentMethod,
            note: row.note,
          });
        }
      }
      const residualMinor = debtPaidMinor - coveredMinor;
      if (residualMinor > 0n) {
        const sourceRef = `PAYMENT:SUBSCRIPTION_ACTIVATION:${newSubscription.id}:RESIDUAL`;
        const paymentPayload = {
          amount: this.decimalFromMinor(residualMinor).toString(),
          customerId: params.customerId,
          orderId: null,
          source: DebtSource.PAYMENT,
          actorUserId: params.performedByUserId,
          sourceRef,
          metadata: { origin: 'SUBSCRIPTION_ACTIVATION' },
        };
        assertDebtLedgerPaymentWrite(paymentPayload);
        traceDebtLedgerPaymentWrite({
          sourceFile: 'src/customer-ledger/customer-ledger.service.ts',
          functionName: 'activateSubscriptionPlan.residual',
          payload: paymentPayload,
        });
        await tx.debtLedgerEntry.create({
          data: {
            customerId: params.customerId,
            orderId: null,
            source: DebtSource.PAYMENT,
            category,
            amount: this.decimalFromMinor(residualMinor),
            branchId: subsidyBranchId,
            actorUserId: params.performedByUserId,
            sourceRef,
            note: 'Residual debt cleared by subscription activation',
          },
        });
        await this.journal.mirrorDebtLedgerEntrySafe(tx, {
          source: DebtSource.PAYMENT,
          amount: this.decimalFromMinor(residualMinor),
          sourceRef,
          actorUserId: params.performedByUserId,
          customerId: params.customerId,
          orderId: null,
          paymentMethod: params.paymentMethod,
          note: 'Residual debt cleared by subscription activation',
        });
      }
    }

    const prepaidReconciled = params.skipPrepaidAutoReconcile
      ? { paidOrderIds: [] as string[] }
      : await this.autoReconcileUnpaidInvoicesFromPrepaidBalanceTx(
          tx,
          params.customerId,
          params.performedByUserId,
        );

    const walletFinal = await tx.customerWallet.findUniqueOrThrow({
      where: { customerId: params.customerId },
      select: { balance: true, debt: true },
    });

    return {
      totalCollected: totalCollectedStr,
      debtSettled: debtSettledStr,
      creditedToBalance: creditedStr,
      previousBalance: wallet.balance.toString(),
      previousDebt: wallet.debt.toString(),
      newBalance: walletFinal.balance.toString(),
      newDebt: walletFinal.debt.toString(),
      subscriptionId: newSubscription.id,
      rolledOverFromSubscriptionId: previousSubscription?.id ?? null,
      carriedBalanceKd: carriedBalanceStr,
      closedInvoiceIds,
      prepaidAutoReconciledOrderIds: prepaidReconciled.paidOrderIds,
    };
  }

  /**
   * V1.7.6 — Call-Center «تم الدفع» for an order sold as
   * {@link PosPaymentMethod.DEBT_ON_ACCOUNT}.
   *
   * POS checkout already ran {@link applyOrderWalletSettlementForCompletedOrder}
   * and set `walletSettledAt`, so `manuallyMarkOrderPaidByMethod` used to
   * think the invoice was fully done and returned `{ alreadySettled: true }`.
   * Physically collecting cash/KNET at the office is a second step: we
   * record the pay-down on `CustomerWallet.debt`, write invoice-scoped
   * `DebtSource.PAYMENT`, emit a tagged `ORDER_WALLET_SETTLEMENT` row, and
   * flip `posPaymentMethod`/`cashStatus` — without duplicating
   * `POS_SALE_COMPLETED`, stock movement, or the first settlement snapshot.
   */
  async recordDebtInvoiceCollectedAtCallCenter(
    tx: PrismaTx,
    params: {
      orderId: string;
      confirmedMethod: Exclude<
        PosPaymentMethod,
        'SUBSCRIPTION_WALLET' | 'DEBT_ON_ACCOUNT'
      >;
      performedByUserId: string;
    },
  ): Promise<{ kind: 'applied' } | { kind: 'already_cleared' }> {
    const { orderId, confirmedMethod, performedByUserId } = params;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        customerId: true,
        totalPrice: true,
        posPaymentMethod: true,
        walletSettledAt: true,
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === OrderStatus.CANCELED) {
      throw new BadRequestException(
        'Order is canceled — cannot record collection',
      );
    }
    if (order.posPaymentMethod !== PosPaymentMethod.DEBT_ON_ACCOUNT) {
      throw new BadRequestException(
        'This path only applies to invoices that were sold as debt-on-account',
      );
    }
    if (!order.walletSettledAt) {
      throw new BadRequestException(
        'Invoice has no ledger booking yet — use the standard manual mark flow',
      );
    }

    const [shortAgg, payAgg] = await Promise.all([
      tx.debtLedgerEntry.aggregate({
        where: {
          orderId,
          source: DebtSource.INVOICE_SHORTFALL,
        },
        _sum: { amount: true },
      }),
      tx.debtLedgerEntry.aggregate({
        where: {
          orderId,
          source: DebtSource.PAYMENT,
        },
        _sum: { amount: true },
      }),
    ]);

    const shortfall = new Prisma.Decimal(shortAgg._sum.amount?.toString() ?? '0');
    const paidDirect = new Prisma.Decimal(payAgg._sum.amount?.toString() ?? '0');
    const remaining = shortfall.minus(paidDirect);

    if (remaining.lessThanOrEqualTo(new Prisma.Decimal(0))) {
      await tx.order.update({
        where: { id: orderId },
        data: {
          posPaymentMethod: confirmedMethod,
          cashStatus: cashStatusForPaymentMethod(confirmedMethod),
        },
      });
      return { kind: 'already_cleared' };
    }

    const wallet = await this.getOrCreateWalletTx(tx, order.customerId);
    // V20.4 — Phase 5 row-level lock for the CC debt-invoice
    // collection path. Without it, two CC agents settling debt
    // for the same customer can both read `wallet.debt` at the
    // same value, both deduct, and both write the same lower
    // value — losing one of the payments at the wallet layer
    // even though both PAYMENT rows land in the journal.
    await this.lockCustomerWalletForUpdateTx(tx, wallet.id);
    const debtMinor = toMinorFromFixed4(wallet.debt);
    const remainingMinor = toMinorFromFixed4(remaining);
    const paydownMinor =
      remainingMinor < debtMinor ? remainingMinor : debtMinor;

    if (paydownMinor <= 0n) {
      throw new BadRequestException(
        'Aggregate wallet debt is zero while this invoice still carries an open balance — contact accounting',
      );
    }

    const newDebtMinor = debtMinor - paydownMinor;
    const paydownKdStr = minorToAmountString(paydownMinor);

    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: { debt: this.decimalFromMinor(newDebtMinor) },
    });

    const actor = await tx.user.findUnique({
      where: { id: performedByUserId },
      select: { id: true, safariRole: true, branchId: true },
    });
    if (!actor) {
      throw new NotFoundException('Performing user not found');
    }

    const cust = await tx.customer.findUnique({
      where: { id: order.customerId },
      select: { originBranchId: true },
    });
    const branchId = cust?.originBranchId ?? actor.branchId ?? null;
    const category = this.resolveDebtCategory(actor.safariRole);

    await tx.transactionHistory.create({
      data: {
        type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
        customerId: order.customerId,
        orderId,
        subscriptionId: null,
        amount: this.decimalFromMinor(paydownMinor),
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance,
        debtBefore: wallet.debt,
        debtAfter: this.decimalFromMinor(newDebtMinor),
        performedById: performedByUserId,
        metadata: {
          debtSettled: paydownKdStr,
          debtSettlementViaCallCenter: true,
          confirmedPaymentMethod: confirmedMethod,
          originalPaymentMethod: PosPaymentMethod.DEBT_ON_ACCOUNT,
          reportingCategory: 'DEBT_INVOICE_PHYSICAL_COLLECTION',
        },
      },
    });

    // V20.4 — Phase 5 deterministic sourceRef. Keyed on the
    // (orderId, confirmedMethod) tuple — calling this method
    // again for the same invoice + method (e.g. a transaction
    // retry inside the controller) lands on the existing PAYMENT
    // row via P2002 instead of double-crediting the customer.
    const sourceRef = `PAYMENT:CC_DEBT_INVOICE_PHYSICAL:${orderId}:${confirmedMethod}`;
    const paymentPayload = {
      amount: this.decimalFromMinor(paydownMinor).toString(),
      customerId: order.customerId,
      orderId,
      source: DebtSource.PAYMENT,
      actorUserId: performedByUserId,
      sourceRef,
      metadata: {
        origin: 'CC_DEBT_INVOICE_PHYSICAL',
        confirmedPaymentMethod: confirmedMethod,
      },
    };
    assertDebtLedgerPaymentWrite(paymentPayload);
    traceDebtLedgerPaymentWrite({
      sourceFile: 'src/customer-ledger/customer-ledger.service.ts',
      functionName: 'recordDebtInvoiceCollectedAtCallCenter',
      payload: paymentPayload,
    });
    try {
      await tx.debtLedgerEntry.create({
        data: {
          customerId: order.customerId,
          orderId,
          source: DebtSource.PAYMENT,
          category,
          amount: this.decimalFromMinor(paydownMinor),
          branchId,
          actorUserId: performedByUserId,
          sourceRef,
          note: 'Debt-on-account invoice collected at Call Center',
        },
      });
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== 'P2002'
      ) {
        throw err;
      }
      // Idempotent retry — already collected for this orderId+method.
    }
    await this.journal.mirrorDebtLedgerEntrySafe(tx, {
      source: DebtSource.PAYMENT,
      amount: this.decimalFromMinor(paydownMinor),
      sourceRef,
      actorUserId: performedByUserId,
      customerId: order.customerId,
      orderId,
      paymentMethod: confirmedMethod,
      note: 'Debt-on-account invoice collected at Call Center',
    });

    await this.generalLedger.append(tx, {
      entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
      amount: `-${paydownKdStr}`,
      memo: 'Debt-on-account invoice collected via Call Center',
      customerId: order.customerId,
      orderId,
      actorUserId: performedByUserId,
      metadata: {
        event: 'DEBT_COLLECTED',
        source: 'CC_DEBT_INVOICE_PHYSICAL',
        posPaymentMethod: confirmedMethod,
        category,
        branchId,
      },
    });

    // V20.3.1 — only close the invoice when the paydown actually
    // clears the remaining balance. Earlier code unconditionally
    // flipped `cashStatus` after any pay-down, so when wallet.debt
    // was smaller than the invoice's open balance (paydown <
    // remaining) the invoice was wrongly marked as PAID even
    // though the ledger still showed an open shortfall. After this
    // fix, a partial pay-down preserves `cashStatus` on the order
    // — collections, red KPI, and Outstanding keep showing the
    // row, and the next collection event will close it once
    // remaining ≤ tolerance.
    if (paydownMinor >= remainingMinor) {
      await tx.order.update({
        where: { id: orderId },
        data: {
          posPaymentMethod: confirmedMethod,
          cashStatus: cashStatusForPaymentMethod(confirmedMethod),
        },
      });
    }

    return { kind: 'applied' };
  }

  /**
   * V19.4 — CC pack #1. Partial debt payment with optional discount.
   *
   * Models the operator sitting with a customer on the phone who says
   * "I'll pay 5 of the 7 I owe, can you waive the last 2?". The
   * collected portion is real cash (and goes into the daily collection
   * KPI); the discount portion is goodwill forgiveness (reduces the
   * debt but does NOT count as a collection in any report). The two
   * are written as separate GL entries so the accountant can reconcile
   * cash on hand vs. total debt reduction without having to subtract
   * discounts after the fact.
   *
   * Intentionally re-uses `LedgerTransactionType.ORDER_WALLET_SETTLEMENT`
   * with a null `orderId` + `metadata.debtPaymentOnly=true` rather than
   * introducing a new enum value. The enum is referenced by a dozen
   * aggregation queries across reports, subscribers, and finance — a
   * new value would quietly disappear from every one that filters on
   * the existing two values. The metadata flag keeps existing reports
   * working while letting any future dedicated query opt into it.
   *
   * `amount + discount` is capped by operational debt
   * (`getOperationalDebtKdBreakdown.operationalDebtKd`; same subscriber total as conversion).
   * This is NOT the canonical Customer 360 financial number. After reducing `wallet.debt`,
   * UNPAID invoices are FIFO-closed with the same budget (full-amount
   * rows only), matching `activateSubscriptionPlan` (`autoCloseInvoices`).
   *
   * Runs inside a single transaction so wallet + history + GL + debt-
   * ledger entries can never drift apart on a mid-call failure.
   */
  async recordPartialDebtPayment(params: {
    customerId: string;
    amountKd: string;
    discountKd?: string;
    paymentMethod: PosPaymentMethod;
    performedByUserId: string;
    note?: string;
  }): Promise<{
    amountCollectedKd: string;
    discountAppliedKd: string;
    totalReducedKd: string;
    previousDebtKd: string;
    newDebtKd: string;
    walletBalanceKd: string;
    paymentMethod: PosPaymentMethod;
    /** Ledger row used as سند reference in customer WhatsApp/SMS. */
    transactionHistoryId: string;
  }> {
    // V19.7.1 — lift Prisma's default 5 s transaction budget. The
    // partial-debt-payment flow writes 3–4 rows (wallet update,
    // TransactionHistory insert, plus 1–2 GeneralLedger appends for
    // collection and optional discount). On a warm DB it's well under a
    // second, but connection-pool contention was causing P2028 aborts
    // mid-call. Aligns with the 10/15 s budget used elsewhere for the
    // same atomic 3-table invariant.
    const result = await this.prisma.$transaction(
      async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: params.customerId },
          select: { id: true, originBranchId: true },
        });
        if (!customer) {
          throw new NotFoundException('Customer not found');
        }
        const actor = await tx.user.findUnique({
          where: { id: params.performedByUserId },
          select: { id: true, safariRole: true, branchId: true },
        });
        if (!actor) {
          throw new NotFoundException('Performing user not found');
        }

        const wallet = await this.getOrCreateWalletTx(tx, params.customerId);
        // V20.4 — Phase 5 row-level lock for the customer-level
        // partial-debt-payment path (CC "تم الدفع"). Without it
        // 1000 concurrent partial payments would lose updates
        // (forensic stress test, V20.3.4 §9). The lock serialises
        // the read-modify-write at the wallet level; journal
        // writes already serialise via the unique sourceRef.
        await this.lockCustomerWalletForUpdateTx(tx, wallet.id);
        const amountMinor = toMinorFromFixed4(
          new Prisma.Decimal(params.amountKd),
        );
        const discountMinor =
          params.discountKd !== undefined
            ? toMinorFromFixed4(new Prisma.Decimal(params.discountKd))
            : 0n;
        const totalMinor = amountMinor + discountMinor;
        const debtMinor = toMinorFromFixed4(wallet.debt);
        const outstandingBreakdown = await this.orders.getOperationalDebtKdBreakdown(
          params.customerId,
          wallet.debt,
          tx,
        );
        const ceilingMinor = toMinorFromFixed4(outstandingBreakdown.operationalDebtKd);

        if (amountMinor < 0n || discountMinor < 0n) {
          throw new BadRequestException(
            'Amount and discount must both be non-negative',
          );
        }
        if (totalMinor === 0n) {
          throw new BadRequestException(
            'At least one of amount or discount must be greater than zero',
          );
        }
        if (totalMinor > ceilingMinor) {
          throw new BadRequestException(
            `Amount + discount cannot exceed total outstanding debt (${outstandingBreakdown.operationalDebtKd.toFixed(4)} KD)`,
          );
        }

        const debtPaidMinor = totalMinor;
        const walletDeductionMinor =
          debtPaidMinor < debtMinor ? debtPaidMinor : debtMinor;
        const newDebtMinor = debtMinor - walletDeductionMinor;
        const amountStr = minorToAmountString(amountMinor);
        const discountStr = minorToAmountString(discountMinor);
        const totalStr = minorToAmountString(totalMinor);

        await tx.customerWallet.update({
          where: { id: wallet.id },
          data: { debt: this.decimalFromMinor(newDebtMinor) },
        });

        // V20.3.1 — Partial-payment correctness patch.
        //
        // Pre-V20.3.1 this loop measured each invoice against
        // `inv.totalPrice` (the gross), which silently broke the
        // partial-payment lifecycle: an invoice paid down 30 / 100
        // earlier today could never be auto-closed by a later 70 KD
        // call-center payment because the loop kept comparing the
        // gross 100 against the new 70 budget and skipping it.
        //
        // The fix uses per-invoice REMAINING balance (gross −
        // payments − wallet absorption, clamped at 0) sourced from
        // the canonical helper in `debt-customer-aggregates.util`.
        // An invoice is only closed when its remaining ≤ tolerance.
        // Same FIFO ordering as before (oldest first), same budget
        // (`debtPaidMinor`) so reconciliation against the
        // operational debt ceiling above is unchanged.
        const closedInvoiceIds: string[] = [];
        const invoicePaymentAmountById = new Map<string, Prisma.Decimal>();
        if (debtPaidMinor > 0n) {
          const candidates = await tx.order.findMany({
            where: {
              customerId: params.customerId,
              cashStatus: CashStatus.UNPAID,
              status: { not: OrderStatus.CANCELED },
            },
            select: { id: true, totalPrice: true },
            orderBy: { createdAt: 'asc' },
          });
          const remainingByOrder = await computeOrderRemainingBalancesBatch(
            tx,
            candidates.map((c) => c.id),
          );
          const tolMinor = toMinorFromFixed4(
            new Prisma.Decimal(INVOICE_REMAINING_TOLERANCE_KD),
          );
          let remainingMinor = debtPaidMinor;
          for (const inv of candidates) {
            if (remainingMinor <= 0n) break;
            const invRem = remainingByOrder.get(inv.id);
            if (!invRem || invRem.lessThanOrEqualTo(0)) continue;
            const invRemMinor = toMinorFromFixed4(invRem);
            if (invRemMinor <= tolMinor) continue;
            const appliedMinor =
              invRemMinor < remainingMinor ? invRemMinor : remainingMinor;
            invoicePaymentAmountById.set(
              inv.id,
              this.decimalFromMinor(appliedMinor),
            );
            remainingMinor -= appliedMinor;
            if (appliedMinor >= invRemMinor) {
              await tx.order.update({
                where: { id: inv.id },
                data: { cashStatus: CashStatus.PAID_TO_DRIVER },
              });
              closedInvoiceIds.push(inv.id);
            }
          }
        }

        const refreshedWallet = await tx.customerWallet.findUnique({
          where: { id: wallet.id },
          select: { debt: true },
        });
        const endingBreakdown = await this.orders.getOperationalDebtKdBreakdown(
          params.customerId,
          refreshedWallet!.debt,
          tx,
        );
        const newOperationalDebtKdStr = endingBreakdown.operationalDebtKd.toFixed(4);

        // V19.4 — CC pack #1. Re-use ORDER_WALLET_SETTLEMENT so existing
        // debt-recovery aggregations naturally pick up the collected
        // portion via metadata.debtSettled. No orderId because this row
        // is customer-level, not invoice-level.
        const thDebtRow = await tx.transactionHistory.create({
          data: {
            type: LedgerTransactionType.ORDER_WALLET_SETTLEMENT,
            customerId: params.customerId,
            orderId: null,
            subscriptionId: null,
            amount: this.decimalFromMinor(totalMinor),
            balanceBefore: wallet.balance,
            balanceAfter: wallet.balance,
            debtBefore: wallet.debt,
            debtAfter: this.decimalFromMinor(newDebtMinor),
            performedById: params.performedByUserId,
            metadata: {
              debtPaymentOnly: true,
              debtSettled: amountStr,
              debtDiscount: discountStr,
              debtReduced: totalStr,
              posPaymentMethod: params.paymentMethod,
              reportingCategory: 'DEBT_COLLECTION_CC',
              note: params.note ?? null,
              autoClosedInvoiceIds: closedInvoiceIds,
              autoClosedInvoiceCount: closedInvoiceIds.length,
              operationalDebtAfterKd: newOperationalDebtKdStr,
              effectiveDebtAfterKd: newOperationalDebtKdStr,
            },
          },
        });

        const branchId = customer.originBranchId ?? actor.branchId ?? null;
        const category = this.resolveDebtCategory(actor.safariRole);

        // Cash receipt GL entry — counts in "Collected Today" KPIs.
        if (amountMinor > 0n) {
          await this.generalLedger.append(tx, {
            entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
            amount: `-${amountStr}`,
            memo: 'Partial debt payment collected via Call Center',
            customerId: params.customerId,
            actorUserId: params.performedByUserId,
            metadata: {
              event: 'DEBT_COLLECTED',
              source: 'CC_PARTIAL_DEBT_PAYMENT',
              posPaymentMethod: params.paymentMethod,
              category,
              branchId,
              note: params.note ?? null,
            },
          });

          // V19.11 — Unified DebtLedgerEntry. The *collected* portion is a
          // real PAYMENT (reduces open debt). `orderId` stays null because
          // this flow is customer-level, not invoice-level — reports
          // aggregate by customerId when the payment isn't tied to a
          // specific invoice. The discount portion is intentionally NOT
          // mirrored here: it reduces `wallet.debt` but is recorded as a
          // DEBT_DISCOUNT GL entry only, so collection KPIs stay clean.
          // V20.4 — Phase 5 deterministic sourceRef. Keyed on the
          // TransactionHistory row id we just created above
          // (`thDebtRow.id`) — that id is generated atomically in
          // the same transaction, so retries get a fresh id only
          // after a full rollback (legitimate new operation), and
          // duplicate submissions inside one tx attempt land on
          // the existing PAYMENT row via P2002.
          let allocatedMinor = 0n;
          for (const [, amt] of invoicePaymentAmountById) {
            allocatedMinor += toMinorFromFixed4(amt);
          }
          const paymentRows: Array<{
            customerId: string;
            orderId: string | null;
            source: DebtSource;
            category: ReturnType<CustomerLedgerService['resolveDebtCategory']>;
            amount: Prisma.Decimal;
            branchId: string | null;
            actorUserId: string;
            sourceRef: string;
            note: string;
          }> = Array.from(invoicePaymentAmountById.entries()).map(
            ([invoiceId, amt]) => ({
              customerId: params.customerId,
              orderId: invoiceId,
              source: DebtSource.PAYMENT,
              category,
              amount: amt,
              branchId,
              actorUserId: params.performedByUserId,
              sourceRef: `PAYMENT:CC_PARTIAL_DEBT_PAYMENT:${thDebtRow.id}:${invoiceId}`,
              note: params.note ?? 'Partial debt payment collected via Call Center',
            }),
          );
          const residualPaymentMinor = amountMinor - allocatedMinor;
          if (residualPaymentMinor > 0n) {
            paymentRows.push({
              customerId: params.customerId,
              orderId: null,
              source: DebtSource.PAYMENT,
              category,
              amount: this.decimalFromMinor(residualPaymentMinor),
              branchId,
              actorUserId: params.performedByUserId,
              sourceRef: `PAYMENT:CC_PARTIAL_DEBT_PAYMENT:${thDebtRow.id}:RESIDUAL`,
              note:
                params.note ?? 'Partial debt payment collected via Call Center',
            });
          }
          for (const row of paymentRows) {
            const paymentPayload = {
              amount: row.amount.toString(),
              customerId: row.customerId,
              orderId: row.orderId,
              source: row.source,
              actorUserId: row.actorUserId,
              sourceRef: row.sourceRef,
              metadata: {
                origin: 'CC_PARTIAL_DEBT_PAYMENT',
                posPaymentMethod: params.paymentMethod,
              },
            };
            assertDebtLedgerPaymentWrite(paymentPayload);
            traceDebtLedgerPaymentWrite({
              sourceFile: 'src/customer-ledger/customer-ledger.service.ts',
              functionName: 'recordPartialDebtPayment',
              payload: paymentPayload,
            });
            await tx.debtLedgerEntry.create({ data: row });
            await this.journal.mirrorDebtLedgerEntrySafe(tx, {
              source: DebtSource.PAYMENT,
              amount: row.amount,
              sourceRef: row.sourceRef,
              actorUserId: row.actorUserId,
              customerId: row.customerId,
              orderId: row.orderId,
              paymentMethod: params.paymentMethod,
              note: row.note,
            });
          }
        }

        // Discount GL entry — separate so it never pollutes collections.
        if (discountMinor > 0n) {
          await this.generalLedger.append(tx, {
            entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
            amount: `-${discountStr}`,
            memo: 'Goodwill debt discount granted via Call Center',
            customerId: params.customerId,
            actorUserId: params.performedByUserId,
            metadata: {
              event: 'DEBT_DISCOUNTED',
              source: 'CC_PARTIAL_DEBT_PAYMENT',
              category,
              branchId,
              note: params.note ?? null,
            },
          });

          // V20.4 — Phase 1 mirror the discount as a true
          // double-entry journal write so AR comes down by the
          // discounted amount and the goodwill cost shows up on
          // its own P&L line (5200 DEBT_DISCOUNTS).
          //
          // sourceRef is keyed on the TransactionHistory row id
          // we already created above, so it's deterministic per
          // collection event and idempotent on retry.
          await this.journal.appendDebtDiscountEntrySafe(tx, {
            customerId: params.customerId,
            orderId: null,
            actorUserId: params.performedByUserId,
            amount: this.decimalFromMinor(discountMinor),
            discountRef: `${params.customerId}:${thDebtRow.id}`,
            note: params.note ?? null,
          });
        }

        return {
          amountCollectedKd: amountStr,
          discountAppliedKd: discountStr,
          totalReducedKd: totalStr,
          previousDebtKd: outstandingBreakdown.operationalDebtKd.toFixed(4),
          newDebtKd: newOperationalDebtKdStr,
          walletBalanceKd: wallet.balance.toString(),
          paymentMethod: params.paymentMethod,
          transactionHistoryId: thDebtRow.id,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    // V20.3.2 — Phase 5 post-commit consistency log. Fire-and-
    // forget; never blocks the caller, never throws.
    this.postWriteUiConsistencyAssert(params.customerId, {
      source: 'DEBT_COLLECTION',
      correlationId: result.transactionHistoryId,
    });
    // V20.4 — Phase 5 typed event so the snapshot projection
    // refreshes immediately for this customer. The listener
    // catches up the read side without the cron 5-minute lag.
    this.emitFinancialEvent('finance.payment.partial', {
      customerId: params.customerId,
      orderId: null,
      correlationId: result.transactionHistoryId,
      occurredAt: new Date().toISOString(),
      amountKd: result.amountCollectedKd,
      paymentMethod: params.paymentMethod,
    });
    return result;
  }

  /**
   * Early cancellation while the subscription window is still open: removes
   * time-proportional promotional credit (gift) from the wallet first (never
   * paid as cash), then applies a time-proportional cash refund from the
   * customer-paid portion of the plan snapshot, capped by remaining wallet.
   * Emits GL `DEBT_ADJUSTMENT` rows + a `SUBSCRIPTION_CANCELLATION` journal line.
   */
  async cancelSubscriptionForCustomer(
    tx: PrismaTx,
    params: {
      customerId: string;
      performedByUserId: string;
      reason?: string | null;
    },
  ): Promise<SubscriptionCancellationSettlement> {
    const sub = await tx.customerSubscription.findFirst({
      where: {
        customerId: params.customerId,
        status: CustomerSubscriptionStatus.ACTIVE,
      },
      orderBy: { activatedAt: 'desc' },
    });
    if (!sub) {
      throw new BadRequestException(
        'No active subscription found for this customer',
      );
    }

    const wallet = await tx.customerWallet.findUnique({
      where: { customerId: params.customerId },
    });
    if (!wallet) {
      throw new NotFoundException('Customer wallet not found');
    }
    // V20.4 — Phase 5 row-level lock for the subscription
    // cancellation refund path. Serialises the wallet read so a
    // concurrent invoice settlement cannot race the
    // gift-removal / cash-refund computation against a stale
    // `wallet.balance`.
    await this.lockCustomerWalletForUpdateTx(tx, wallet.id);

    const now = new Date();
    if (now.getTime() >= sub.expiresAt.getTime()) {
      throw new BadRequestException(
        'Subscription validity has already ended — use a new activation instead of cancellation',
      );
    }

    const totalMs = BigInt(
      Math.max(1, sub.expiresAt.getTime() - sub.activatedAt.getTime()),
    );
    const remainingMs = BigInt(
      Math.max(0, sub.expiresAt.getTime() - now.getTime()),
    );

    const saleMinor = toMinorFromFixed4(sub.planSalePriceSnapshot);
    const creditMinor = toMinorFromFixed4(sub.planActualBalanceSnapshot);
    let subsidyMinor = creditMinor - saleMinor;
    if (subsidyMinor < 0n) subsidyMinor = 0n;

    const giftTargetMinor = (subsidyMinor * remainingMs) / totalMs;
    const cashTargetMinor = (saleMinor * remainingMs) / totalMs;

    const balanceMinor = toMinorFromFixed4(wallet.balance);

    const giftRemovalMinor =
      giftTargetMinor < balanceMinor ? giftTargetMinor : balanceMinor;
    const afterGiftMinor = balanceMinor - giftRemovalMinor;

    const cashRefundMinor =
      cashTargetMinor < afterGiftMinor ? cashTargetMinor : afterGiftMinor;
    const newBalanceMinor = afterGiftMinor - cashRefundMinor;

    const giftStr = minorToAmountString(giftRemovalMinor);
    const cashStr = minorToAmountString(cashRefundMinor);
    const reductionStr = minorToAmountString(
      giftRemovalMinor + cashRefundMinor,
    );

    const remainingTermFraction = Number(remainingMs) / Number(totalMs);

    if (giftRemovalMinor > 0n) {
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: giftStr,
        memo:
          'Subscription cancellation — promotional / gift credit voided (no cash)',
        customerId: params.customerId,
        actorUserId: params.performedByUserId,
        metadata: {
          event: 'SUBSCRIPTION_CANCEL_GIFT_VOID',
          subscriptionId: sub.id,
          voidedGiftKd: giftStr,
        },
      });
    }
    if (cashRefundMinor > 0n) {
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: `-${cashStr}`,
        memo:
          'Subscription cancellation — cash refund to customer (مسترجع / سند صرف)',
        customerId: params.customerId,
        actorUserId: params.performedByUserId,
        metadata: {
          event: 'SUBSCRIPTION_CANCEL_CASH_REFUND',
          subscriptionId: sub.id,
          refundedCashKd: cashStr,
        },
      });
    }

    await tx.transactionHistory.create({
      data: {
        type: LedgerTransactionType.SUBSCRIPTION_CANCELLATION,
        customerId: params.customerId,
        subscriptionId: sub.id,
        amount: this.decimalFromMinor(giftRemovalMinor + cashRefundMinor),
        balanceBefore: wallet.balance,
        balanceAfter: this.decimalFromMinor(newBalanceMinor),
        debtBefore: wallet.debt,
        debtAfter: wallet.debt,
        performedById: params.performedByUserId,
        metadata: {
          reason:
            params.reason && params.reason.trim().length > 0 ?
              params.reason.trim()
            : null,
          giftVoidedKd: giftStr,
          cashRefundedKd: cashStr,
          walletReductionKd: reductionStr,
          remainingTermFractionApprox: remainingTermFraction,
          planSalePriceSnapshot: sub.planSalePriceSnapshot.toString(),
          planActualBalanceSnapshot: sub.planActualBalanceSnapshot.toString(),
        },
      },
    });

    await tx.customerSubscription.update({
      where: { id: sub.id },
      data: {
        status: CustomerSubscriptionStatus.CANCELLED,
        closedAt: now,
        closedReason: 'CANCEL_REFUND',
      },
    });

    await tx.customerWallet.update({
      where: { customerId: params.customerId },
      data: {
        balance: this.decimalFromMinor(newBalanceMinor),
        subscriptionActivatedAt: null,
        subscriptionExpiresAt: null,
        subscriptionPlanId: null,
        subscriptionPlanName: null,
      },
    });

    // V20.4 — Phase 1 close the journal gap on subscription
    // cancellation. Pre-V20.4 the refund only landed in
    // `GeneralLedgerEntry` (single-entry KPI tag) and
    // `TransactionHistory`, leaving `JournalEntry` /
    // `WALLET_LIABILITY` / `CASH` accounts permanently out of
    // sync with `wallet.balance` after every cancel-refund.
    //
    // The Safe variant feeds the Phase 16 circuit breaker on
    // failure; idempotent on `JOURNAL:SUBSCRIPTION_REFUND:<subId>`,
    // so a retried cancellation won't double-credit CASH.
    await this.journal.appendSubscriptionRefundEntrySafe(tx, {
      customerId: params.customerId,
      subscriptionId: sub.id,
      actorUserId: params.performedByUserId,
      giftRemovalAmount: this.decimalFromMinor(giftRemovalMinor),
      cashRefundAmount: this.decimalFromMinor(cashRefundMinor),
      reason:
        params.reason && params.reason.trim().length > 0
          ? params.reason.trim()
          : null,
    });

    return {
      subscriptionId: sub.id,
      refundedCashKd: cashStr,
      voidedGiftKd: giftStr,
      walletReductionKd: reductionStr,
      previousBalanceKd: wallet.balance.toString(),
      newBalanceKd: minorToAmountString(newBalanceMinor),
      remainingTermFraction,
    };
  }
}
