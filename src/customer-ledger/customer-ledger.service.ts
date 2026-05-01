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
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly inventory: InventoryService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
  ) {}

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
    return this.prisma.$transaction(
      async (tx) =>
        this.autoReconcileUnpaidInvoicesFromPrepaidBalanceTx(
          tx,
          customerId,
          performedByUserId ?? null,
        ),
      { maxWait: 15_000, timeout: 45_000 },
    );
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
    const balanceMinor = toMinorFromFixed4(wallet.balance);
    const debtMinor = toMinorFromFixed4(wallet.debt);

    const takeMinor = balanceMinor < totalMinor ? balanceMinor : totalMinor;
    const shortfallMinor = totalMinor - takeMinor;
    const beforeSubscriptionDebtMinor = balanceMinor < 0n ? -balanceMinor : 0n;
    const isSubscriptionWalletPayment =
      o.posPaymentMethod === PosPaymentMethod.SUBSCRIPTION_WALLET;
    const newBalanceMinor =
      isSubscriptionWalletPayment ? balanceMinor - totalMinor : balanceMinor - takeMinor;
    const externalCoversShortfall =
      o.posPaymentMethod === PosPaymentMethod.CASH ||
      o.posPaymentMethod === PosPaymentMethod.KNET ||
      o.posPaymentMethod === PosPaymentMethod.ONLINE ||
      o.posPaymentMethod === PosPaymentMethod.PAYMENT_LINK;
    const addInvoiceDebt =
      o.posPaymentMethod === PosPaymentMethod.DEBT_ON_ACCOUNT ||
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
          appliedFromWallet: minorToAmountString(takeMinor),
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
    if (addedInvoiceDebtMinor > 0n) {
      await tx.debtLedgerEntry.create({
        data: {
          customerId: o.customerId,
          orderId,
          source: DebtSource.INVOICE_SHORTFALL,
          category: debtCategory,
          amount: this.decimalFromMinor(addedInvoiceDebtMinor),
          branchId: actor.branchId,
          actorUserId: actor.id,
          note: 'Invoice shortfall recorded as receivable',
        },
      });
      // Dastur §5 — mirror the debt change onto the unified GL so every
      // financial movement surfaces on one audit stream.
      await this.generalLedger.append(tx, {
        entryType: GeneralLedgerEntryType.DEBT_ADJUSTMENT,
        amount: this.decimalFromMinor(addedInvoiceDebtMinor),
        memo: 'Invoice shortfall recorded as receivable',
        customerId: o.customerId,
        orderId,
        actorUserId: actor.id,
        metadata: {
          source: DebtSource.INVOICE_SHORTFALL,
          category: debtCategory,
          branchId: actor.branchId,
        },
      });
    }
    if (addedSubscriptionDebtMinor > 0n) {
      await tx.debtLedgerEntry.create({
        data: {
          customerId: o.customerId,
          orderId,
          source: DebtSource.SUBSCRIPTION_OVERUSE,
          category: debtCategory,
          amount: this.decimalFromMinor(addedSubscriptionDebtMinor),
          branchId: actor.branchId,
          actorUserId: actor.id,
          note: 'Subscription balance allowed to go negative',
        },
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
      await tx.debtLedgerEntry.create({
        data: {
          customerId: o.customerId,
          orderId,
          source: DebtSource.PAYMENT,
          category: debtCategory,
          amount: this.decimalFromMinor(debtPaydownFromSettlementMinor),
          branchId: actor.branchId,
          actorUserId: actor.id,
          note: 'Invoice debt settled (wallet settlement)',
        },
      });
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
          trigger:
            extraMetadata?.debtSettlementViaCallCenter === true
              ? 'CALL_CENTER_MANUAL'
              : extraMetadata?.debtSettlementViaLink === true
                ? 'PAYMENT_LINK_CALLBACK'
                : 'WALLET_SETTLEMENT',
          declaredDebtSettled: debtSettledStr,
        },
      });
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
    const debtBreakdown = await this.orders.getEffectiveDebtKdBreakdown(
      params.customerId,
      wallet.debt,
      tx,
    );
    const implicitReceivableMinor = toMinorFromFixed4(
      debtBreakdown.collectionsReceivableKd,
    );
    const effectiveDebtMinor = toMinorFromFixed4(debtBreakdown.effectiveDebtKd);
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
    // V19.12.1 — **effectiveDebtKd** mirrors `DebtLedgerEntry` net + snapshot
    // reconciliation (via `OrdersService.getEffectiveDebtKdBreakdown`); do not add
    // wallet.debt twice here (`effectiveDebtMinor` is totals from breakdown).
    const debtPaidMinor =
      effectiveDebtMinor < creditMinor ? effectiveDebtMinor : creditMinor;
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
        `effectiveDebtMinor=${effectiveDebtMinor.toString()} planCreditMinor=${creditMinor.toString()} ` +
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
          effectiveDebtForActivationKd: minorToAmountString(effectiveDebtMinor),
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
    // `effectiveDebtMinor` above. When this flag is true and `debtPaidMinor`
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
    /** Amounts picked from FIFO scan — avoids N `findUnique` round trips when writing ledger rows. */
    const closedInvoiceAmountById = new Map<string, Prisma.Decimal>();
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
      let remainingMinor = debtPaidMinor;
      for (const inv of candidates) {
        if (remainingMinor <= 0n) break;
        const invMinor = toMinorFromFixed4(inv.totalPrice);
        if (invMinor <= 0n) continue;
        // Only close invoices we can cover in full. A partial close
        // would require mutating `totalPrice` or introducing a
        // "partiallyPaid" state the rest of the system doesn't model.
        if (invMinor > remainingMinor) continue;
        closedInvoiceIds.push(inv.id);
        closedInvoiceAmountById.set(inv.id, inv.totalPrice);
        remainingMinor -= invMinor;
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

      // V19.11 — Unified DebtLedgerEntry. FIFO-write one PAYMENT row per
      // invoice closed by this activation, plus a residual customer-level
      // PAYMENT for any debt covered without closing a specific invoice.
      // Each row carries the invoice's total as the amount because FIFO
      // only closes invoices it can cover *in full* (no partials).
      const category = this.resolveDebtCategory(actor.safariRole);
      let coveredMinor = 0n;
      for (const invoiceId of closedInvoiceIds) {
        const amt = closedInvoiceAmountById.get(invoiceId);
        if (!amt) continue;
        coveredMinor += toMinorFromFixed4(amt);
      }
      if (closedInvoiceIds.length > 0) {
        await tx.debtLedgerEntry.createMany({
          data: closedInvoiceIds.flatMap((invoiceId) => {
            const amt = closedInvoiceAmountById.get(invoiceId);
            if (!amt) return [];
            return {
              customerId: params.customerId,
              orderId: invoiceId,
              source: DebtSource.PAYMENT,
              category,
              amount: amt,
              branchId: subsidyBranchId,
              actorUserId: params.performedByUserId,
              note: 'Invoice closed by subscription activation (FIFO)',
            };
          }),
        });
      }
      const residualMinor = debtPaidMinor - coveredMinor;
      if (residualMinor > 0n) {
        await tx.debtLedgerEntry.create({
          data: {
            customerId: params.customerId,
            orderId: null,
            source: DebtSource.PAYMENT,
            category,
            amount: this.decimalFromMinor(residualMinor),
            branchId: subsidyBranchId,
            actorUserId: params.performedByUserId,
            note: 'Residual debt cleared by subscription activation',
          },
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

    await tx.debtLedgerEntry.create({
      data: {
        customerId: order.customerId,
        orderId,
        source: DebtSource.PAYMENT,
        category,
        amount: this.decimalFromMinor(paydownMinor),
        branchId,
        actorUserId: performedByUserId,
        note: 'Debt-on-account invoice collected at Call Center',
      },
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

    await tx.order.update({
      where: { id: orderId },
      data: {
        posPaymentMethod: confirmedMethod,
        cashStatus: cashStatusForPaymentMethod(confirmedMethod),
      },
    });

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
   * `amount + discount` is capped by `getEffectiveDebtKdBreakdown.effectiveDebtKd`
   * (same subscriber total as conversion). After reducing `wallet.debt`,
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
    return this.prisma.$transaction(
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
        const amountMinor = toMinorFromFixed4(
          new Prisma.Decimal(params.amountKd),
        );
        const discountMinor =
          params.discountKd !== undefined
            ? toMinorFromFixed4(new Prisma.Decimal(params.discountKd))
            : 0n;
        const totalMinor = amountMinor + discountMinor;
        const debtMinor = toMinorFromFixed4(wallet.debt);
        const outstandingBreakdown = await this.orders.getEffectiveDebtKdBreakdown(
          params.customerId,
          wallet.debt,
          tx,
        );
        const ceilingMinor = toMinorFromFixed4(outstandingBreakdown.effectiveDebtKd);

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
            `Amount + discount cannot exceed total outstanding debt (${outstandingBreakdown.effectiveDebtKd.toFixed(4)} KD)`,
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

        // Same FIFO shape as `activateSubscriptionPlan` (`autoCloseInvoices`):
        // UNPAID + not canceled, oldest first, full invoices only. Budget
        // is the full `debtPaidMinor` so collections rows can reconcile with
        // the same effective-debt ceiling used for the cap above.
        const closedInvoiceIds: string[] = [];
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
          let remainingMinor = debtPaidMinor;
          for (const inv of candidates) {
            if (remainingMinor <= 0n) break;
            const invMinor = toMinorFromFixed4(inv.totalPrice);
            if (invMinor <= 0n) continue;
            if (invMinor > remainingMinor) continue;
            await tx.order.update({
              where: { id: inv.id },
              data: { cashStatus: CashStatus.PAID_TO_DRIVER },
            });
            closedInvoiceIds.push(inv.id);
            remainingMinor -= invMinor;
          }
        }

        const refreshedWallet = await tx.customerWallet.findUnique({
          where: { id: wallet.id },
          select: { debt: true },
        });
        const endingBreakdown = await this.orders.getEffectiveDebtKdBreakdown(
          params.customerId,
          refreshedWallet!.debt,
          tx,
        );
        const newEffectiveDebtKdStr = endingBreakdown.effectiveDebtKd.toFixed(4);

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
              effectiveDebtAfterKd: newEffectiveDebtKdStr,
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
          await tx.debtLedgerEntry.create({
            data: {
              customerId: params.customerId,
              orderId: null,
              source: DebtSource.PAYMENT,
              category,
              amount: this.decimalFromMinor(amountMinor),
              branchId,
              actorUserId: params.performedByUserId,
              note:
                params.note ?? 'Partial debt payment collected via Call Center',
            },
          });
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
        }

        return {
          amountCollectedKd: amountStr,
          discountAppliedKd: discountStr,
          totalReducedKd: totalStr,
          previousDebtKd: outstandingBreakdown.effectiveDebtKd.toFixed(4),
          newDebtKd: newEffectiveDebtKdStr,
          walletBalanceKd: wallet.balance.toString(),
          paymentMethod: params.paymentMethod,
          transactionHistoryId: thDebtRow.id,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
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
