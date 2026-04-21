import {
  BadRequestException,
  Injectable,
  NotFoundException,
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
import {
  minorToAmountString,
  toMinorFromFixed4,
} from '../finance/finance-money';
import { GeneralLedgerService } from '../general-ledger/general-ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SubscriptionActivationSettlement } from './subscription-settlement.types';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly generalLedger: GeneralLedgerService,
  ) {}

  private decimalFromMinor(minor: bigint): Prisma.Decimal {
    return new Prisma.Decimal(minorToAmountString(minor));
  }

  async getOrCreateWalletTx(tx: PrismaTx, customerId: string) {
    return tx.customerWallet.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
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
    const newDebtMinor =
      addInvoiceDebt && shortfallMinor > 0n ? debtMinor + shortfallMinor : debtMinor;
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
      select: { id: true, branchId: true },
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
    const debtPaidMinor =
      debtMinor < creditMinor ? debtMinor : creditMinor;
    const newDebtMinor = debtMinor - debtPaidMinor;
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
        },
      },
    });

    // V19.7.4 — FIFO invoice auto-closure (Owner directive, opt-in via
    // `autoCloseInvoices`). Context: `wallet.debt` is the aggregate
    // receivable, while `Order.cashStatus=UNPAID` is the per-invoice
    // status. Before this change the "Convert debt → subscription" flow
    // reduced the aggregate but left the underlying invoices flagged
    // UNPAID, so the debt-tracking list kept showing receivables whose
    // total no longer matched `wallet.debt`. Owner asked: "إذا
    // انخصمت تحذف فواتيره من قائمة متابعة المديونية صحيح" — yes, but
    // only for the Convert flow (regular Upgrade keeps invoices open).
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
        await tx.order.update({
          where: { id: inv.id },
          data: { cashStatus: CashStatus.PAID_TO_DRIVER },
        });
        closedInvoiceIds.push(inv.id);
        remainingMinor -= invMinor;
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
    }

    return {
      totalCollected: totalCollectedStr,
      debtSettled: debtSettledStr,
      creditedToBalance: creditedStr,
      previousBalance: wallet.balance.toString(),
      previousDebt: wallet.debt.toString(),
      newBalance: minorToAmountString(newBalanceMinor),
      newDebt: minorToAmountString(newDebtMinor),
      subscriptionId: newSubscription.id,
      rolledOverFromSubscriptionId: previousSubscription?.id ?? null,
      carriedBalanceKd: carriedBalanceStr,
      closedInvoiceIds,
    };
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
        if (totalMinor > debtMinor) {
          throw new BadRequestException(
            'Amount + discount cannot exceed current customer debt',
          );
        }

        const newDebtMinor = debtMinor - totalMinor;
        const amountStr = minorToAmountString(amountMinor);
        const discountStr = minorToAmountString(discountMinor);
        const totalStr = minorToAmountString(totalMinor);
        const newDebtStr = minorToAmountString(newDebtMinor);

        await tx.customerWallet.update({
          where: { id: wallet.id },
          data: { debt: this.decimalFromMinor(newDebtMinor) },
        });

        // V19.4 — CC pack #1. Re-use ORDER_WALLET_SETTLEMENT so existing
        // debt-recovery aggregations naturally pick up the collected
        // portion via metadata.debtSettled. No orderId because this row
        // is customer-level, not invoice-level.
        await tx.transactionHistory.create({
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
          previousDebtKd: wallet.debt.toString(),
          newDebtKd: newDebtStr,
          walletBalanceKd: wallet.balance.toString(),
          paymentMethod: params.paymentMethod,
        };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  }
}
