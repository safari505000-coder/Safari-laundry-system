/**
 * مجموعات ديون بلا حالة تُعاد مشاركتها بين Finance (DebtService) وOrders.
 * الهدف الرئيسي تفادي استيراد `FinanceModule` من `OrdersModule` والدوري الدائري
 * (Payments → Ledger → Orders). جميع الدوال قراءة فقط — لا تعديلات على البيانات.
 *
 * Stateless debt aggregation utilities shared by Finance (DebtService) and Orders.
 * Primary goal: avoid importing `FinanceModule` into `OrdersModule` which would
 * create a circular dependency (Payments → Ledger → Orders). All functions are
 * read-only — no data mutations.
 *
 * @since V20.2
 */
import { OrderStatus, Prisma } from '@prisma/client';

type Db = {
  customerWallet: Prisma.CustomerWalletDelegate;
  /**
   * V20.2 — Phase 30. Optional journal access so the read switch can
   * upgrade `getCustomerNetDebtFromDebtLedgerAgg` to journal-derived AR.
   */
  journalLine?: Prisma.JournalLineDelegate;
};

type OrderDb = {
  order: Prisma.OrderDelegate;
  /**
   * V20.4 — When provided and `isJournalAsSourceEnabled()` is on,
   * `computeOrderRemainingBalancesBatch` reads per-order AR balance
   * from JournalLine account 1300 instead of the DebtLedger waterfall.
   */
  journalLine?: Prisma.JournalLineDelegate;
};

type RemainingOrderRow = {
  id: string;
  customerId?: string | null;
  totalPrice: Prisma.Decimal;
  status: OrderStatus;
};

/**
 * هامش التسامح تحته تُعتبر الفاتورة مسددة بالكامل (V20.3.1).
 * يمنع بقاء رصيد 0.0001 د.ك كـ"فاتورة مفتوحة" بسبب تقريب الأرقام العشرية.
 * يقع في ملف الأدوات (لا في `invoice-payment-status.service.ts`) حتى تتمكن
 * وحدات `customer-ledger` و`orders` و`outstanding` من استيراده بدون دوريات.
 *
 * Tolerance below which an invoice is considered fully paid (V20.3.1).
 * Prevents 0.0001 KWD trailing-arithmetic residuals from leaving an invoice
 * permanently "open". Lives in the util file so `customer-ledger`, `orders`,
 * and `outstanding` modules can import it without creating circular deps.
 *
 * @since V20.3
 */
export const INVOICE_REMAINING_TOLERANCE_KD = '0.001';

const Z = () => new Prisma.Decimal(0);

/**
 * مفتاح قراءة اليومية كمصدر رئيسي للذمم — V20.2 المرحلة 30.
 * يُعيد `true` فقط عند تفعيل `USE_JOURNAL_AS_SOURCE=true` أو `V20_4_FINAL_LEDGER=true`.
 * يُقرأ عند كل استدعاء حتى يسري تغيير البيئة دون إعادة تشغيل.
 * هذه الدالة هي النقطة الوحيدة التي يستشيرها الكود لتحديد مرجعية اليومية.
 *
 * V20.2 Phase 30 read-switch. Returns `true` only when the operator opts in via
 * `USE_JOURNAL_AS_SOURCE=true` or the master `V20_4_FINAL_LEDGER=true`.
 * Re-read on every call so env changes take effect without a restart.
 * Single source of truth for "is the journal authoritative for reads?".
 *
 * @returns `true` إذا كانت اليومية مرجعية للقراءة | `true` if journal is the read source
 * @since V20.2
 */
export function isJournalAsSourceEnabled(): boolean {
  // V20.4 — Phase 4/7 master switch overrides the per-feature flag.
  // V20.4 final mode = journal is canonical, period.
  if (isV20_4FinalLedgerEnabledNoCycle()) return true;
  const v = (process.env.USE_JOURNAL_AS_SOURCE ?? '')
    .toString()
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/**
 * Inlined V20.4 master-flag check (no forward-call to
 * {@link isV20_4FinalLedgerEnabled}) so the two switches don't
 * accidentally form a cycle if a future refactor adds extra
 * resolution.
 */
function isV20_4FinalLedgerEnabledNoCycle(): boolean {
  const v = (process.env.V20_4_FINAL_LEDGER ?? '')
    .toString()
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/**
 * مفتاح المحاسبة الحقيقية للكتابة — V20.3.
 * عند تفعيله (`V20_3_TRUE_ACCOUNTING=true`) تُعدَّل مسارات الدفع وتسوية المحفظة لـ:
 *   - إصدار قيد إصدار فاتورة كاملة عند إنشاء الطلب (المرحلة 31).
 *   - كتابة `INVOICE_SHORTFALL.amount` بالمبلغ الكامل لا المتبقي (المرحلة 32).
 *   - استخدام قيد امتصاص المحفظة V3 (مدين 2100 / دائن 1300 — المرحلة 33).
 *   - إصدار `appendExternalPaymentEntry` لكل دفعة خارجية (المرحلة 34).
 *   - اشتقاق الدين من رصيد حساب 1300 في اليومية بدلًا من `wallet.debt` (المرحلة 35).
 * مُعطَّل افتراضيًا — يتطلب رجوعًا (`backfill`) ثم مطابقة قبل التفعيل.
 *
 * V20.3 true-accounting write-switch.
 * When enabled (`V20_3_TRUE_ACCOUNTING=true`), payment and wallet-settlement paths:
 *   • emit full invoice issuance entry on order creation (Phase 31).
 *   • write full invoice amount to INVOICE_SHORTFALL (Phase 32).
 *   • use V3 wallet absorption entry (DR 2100 / CR 1300 — Phase 33).
 *   • emit external payment entry for every payment (Phase 34).
 *   • derive debt from journal AR instead of `wallet.debt` (Phase 35).
 * Default OFF — requires backfill + reconciliation before enabling.
 *
 * @returns `true` إذا كانت المحاسبة الحقيقية مفعّلة | `true` if V20.3 accounting is on
 * @since V20.3
 */
export function isV20_3TrueAccountingEnabled(): boolean {
  // V20.4 — Phase 7 master switch. Setting V20_4_FINAL_LEDGER=true
  // implicitly forces V20_3_TRUE_ACCOUNTING + USE_JOURNAL_AS_SOURCE
  // on, so operators only flip one flag to land on the canonical
  // banking core. The individual flags remain available for
  // gradual rollout / canary deployments.
  if (isV20_4FinalLedgerEnabled()) return true;
  const v = (process.env.V20_3_TRUE_ACCOUNTING ?? '')
    .toString()
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/**
 * مفتاح النواة المصرفية الرسمية النهائية — V20.4.
 * عند تفعيله (`V20_4_FINAL_LEDGER=true`) يُلزَم النظام بـ:
 *   - محاسبة V20.3 الحقيقية (إصدار فاتورة إجمالية + ذمم من اليومية فقط).
 *   - اليومية كمصدر الحقيقة الوحيد لكل القراءات.
 *   - `DebtLedgerEntry` محوّل لأغراض التدقيق فقط (لا عرض في الواجهة).
 *   - فرض المعادلة المحاسبية الإجمالية (Σ أصول = Σ التزامات + حقوق ملكية).
 * مُعطَّل افتراضيًا حتى تُنفِّذ محرك المطابقة V20.4 أولًا.
 *
 * V20.4 FINAL CANONICAL BANKING CORE master switch.
 * When set (`V20_4_FINAL_LEDGER=true`), the system commits to:
 *   • V20.3 true accounting (gross issuance + AR-only debt).
 *   • Journal as single source of truth for all reads.
 *   • `DebtLedgerEntry` demoted to audit-only.
 *   • Global balance equation enforced post-write.
 * Default OFF — run the V20.4 reconciliation engine first.
 *
 * @returns `true` إذا كانت النواة المصرفية النهائية مفعّلة | `true` if final ledger is active
 * @since V20.4
 */
export function isV20_4FinalLedgerEnabled(): boolean {
  const v = (process.env.V20_4_FINAL_LEDGER ?? '')
    .toString()
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

/**
 * يُعيد صافي الدين المفتوح للعميل من حساب الذمم (1300) في اليومية.
 * اليومية هي المصدر الرسمي الوحيد — كلا حقلَي `outstandingInvoiceDebtKd`
 * و`outstandingSubscriptionDebtKd` ينهاران إلى `netOpenDebtKd` لأن اليومية
 * لا تُتابع تجاوز الاشتراك منفصلًا عن مديونية الفواتير.
 * إذا لم يُمرَّر `db.journalLine` يُعيد صفرًا لكل الحقول.
 *
 * Returns the customer's net open debt from journal AR (account 1300).
 * Journal is the canonical source. Both breakdown fields collapse into
 * `netOpenDebtKd` because the journal does not separately track invoice vs
 * subscription overuse debt. Returns zero for all fields when `db.journalLine`
 * is not provided.
 *
 * @param db - عميل Prisma يحتوي على `journalLine` اختياريًا | Prisma client with optional `journalLine`
 * @param customerId - معرف العميل | Customer ID
 * @returns صافي الدين المفتوح من اليومية | Net open debt from journal
 * @since V20.2
 */
export async function getCustomerNetDebtFromDebtLedgerAgg(
  db: Db,
  customerId: string,
): Promise<{
  outstandingInvoiceDebtKd: Prisma.Decimal;
  outstandingSubscriptionDebtKd: Prisma.Decimal;
  netOpenDebtKd: Prisma.Decimal;
}> {
  if (db.journalLine) {
    const lines = await db.journalLine.findMany({
      where: {
        entry: { customerId },
        account: { code: '1300' },
      },
      select: { debit: true, credit: true },
    });
    let bal = Z();
    for (const line of lines) {
      bal = bal
        .add(new Prisma.Decimal(line.debit.toString()))
        .sub(new Prisma.Decimal(line.credit.toString()));
    }
    if (bal.lessThan(0)) bal = Z();
    return {
      outstandingInvoiceDebtKd: bal,
      outstandingSubscriptionDebtKd: Z(),
      netOpenDebtKd: bal,
    };
  }
  return {
    outstandingInvoiceDebtKd: Z(),
    outstandingSubscriptionDebtKd: Z(),
    netOpenDebtKd: Z(),
  };
}

/**
 * V20.3.1 — canonical per-order remaining balance.
 *
 * Pure function shared by Finance (`InvoicePaymentStatusService`)
 * and CustomerLedger (FIFO close paths) so both paths agree on
 * "what does this invoice still owe?". Avoids a circular dep
 * between `FinanceModule` and `CustomerLedgerModule`.
 *
 * V20.4 — When `isJournalAsSourceEnabled()` is true and `db.journalLine`
 * is present, the function reads per-order AR balance from JournalLine
 * (account 1300) instead of the DebtLedger waterfall. Orders with no
 * journal entries (pre-backfill data) fall back to DebtLedger automatically.
 *
 * Formula (DebtLedger path):
 *   remaining = max(0, Order.totalPrice − Σ realPayments − Σ walletAbsorption)
 *
 * Formula (Journal path):
 *   remaining = max(0, Σ debit_1300(orderId) − Σ credit_1300(orderId))
 *   + FIFO allocation of customer-level orderId=null credits (residual CC payments)
 *
 * Returns `0` for canceled orders and unknown order ids — never negative.
 */
export async function computeOrderRemainingBalancesBatch(
  db: OrderDb,
  orderIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const out = new Map<string, Prisma.Decimal>();
  if (orderIds.length === 0) return out;

  const orders = (await db.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, customerId: true, totalPrice: true, status: true },
  })) as RemainingOrderRow[];

  const totalById = new Map<string, Prisma.Decimal>();
  const customerByOrderId = new Map<string, string>();
  for (const o of orders) {
    if (o.status === OrderStatus.CANCELED) {
      out.set(o.id, Z());
      continue;
    }
    totalById.set(o.id, new Prisma.Decimal(o.totalPrice.toString()));
    if (o.customerId) customerByOrderId.set(o.id, o.customerId);
  }
  if (totalById.size === 0) return out;

  const activeOrderIds = Array.from(totalById.keys());
  const activeOrders = orders.filter((o) => o.status !== OrderStatus.CANCELED);

  // ── V20.4 JOURNAL PATH ────────────────────────────────────────────────
  // Used when the operator has enabled the banking-core flags AND the caller
  // passes a db object that exposes journalLine (PrismaClient / tx always do).
  if (db.journalLine && isJournalAsSourceEnabled()) {
    // Step 1: per-order net on account 1300.
    const perOrderLines = await (db.journalLine as Prisma.JournalLineDelegate).findMany({
      where: {
        entry: { orderId: { in: activeOrderIds } },
        account: { code: '1300' },
      },
      select: {
        debit: true,
        credit: true,
        entry: { select: { orderId: true } },
      },
    });

    const journalNetByOrder = new Map<string, Prisma.Decimal>();
    for (const line of perOrderLines) {
      const oid = (line.entry as { orderId: string | null }).orderId;
      if (!oid) continue;
      journalNetByOrder.set(
        oid,
        (journalNetByOrder.get(oid) ?? Z())
          .add(new Prisma.Decimal(line.debit.toString()))
          .sub(new Prisma.Decimal(line.credit.toString())),
      );
    }

    // Orders that have no journal lines yet (pre-backfill) — fall back to
    // DebtLedger for those specific orders so we never silently show the
    // gross totalPrice as "still owed".
    const preBackfillIds = activeOrderIds.filter(
      (id) => !journalNetByOrder.has(id),
    );

    // Step 2: customer-level orderId=null credits on 1300 (residual CC
    // partial-payments recorded as a single credit without a per-order link).
    const customerIds = Array.from(new Set(customerByOrderId.values()));
    if (customerIds.length > 0) {
      const customerCreditLines = await (db.journalLine as Prisma.JournalLineDelegate).findMany({
        where: {
          entry: { customerId: { in: customerIds }, orderId: null },
          account: { code: '1300' },
          credit: { gt: new Prisma.Decimal(0) },
        },
        select: {
          credit: true,
          entry: { select: { customerId: true } },
        },
      });

      const creditByCustomer = new Map<string, Prisma.Decimal>();
      for (const line of customerCreditLines) {
        const cid = (line.entry as { customerId: string | null }).customerId;
        if (!cid) continue;
        creditByCustomer.set(
          cid,
          (creditByCustomer.get(cid) ?? Z()).add(
            new Prisma.Decimal(line.credit.toString()),
          ),
        );
      }

      // Step 3: FIFO — apply residual credits only to journal-tracked orders
      // (pre-backfill orders are excluded; their credits come via DebtLedger).
      for (const customerId of customerIds) {
        let budget = creditByCustomer.get(customerId) ?? Z();
        if (budget.lessThanOrEqualTo(0)) continue;
        const invoicesForCustomer = activeOrders
          .filter(
            (o) =>
              customerByOrderId.get(o.id) === customerId &&
              journalNetByOrder.has(o.id),
          )
          .map((o) => o.id);
        for (const oid of invoicesForCustomer) {
          if (budget.lessThanOrEqualTo(0)) break;
          const net = journalNetByOrder.get(oid) ?? Z();
          if (net.lessThanOrEqualTo(0)) continue;
          const applied = Prisma.Decimal.min(budget, net);
          journalNetByOrder.set(oid, net.sub(applied));
          budget = budget.sub(applied);
        }
      }
    }

    // Step 4: write journal-based results.
    for (const oid of activeOrderIds) {
      if (preBackfillIds.includes(oid)) continue;
      const net = journalNetByOrder.get(oid) ?? Z();
      out.set(oid, net.lessThan(0) ? Z() : net);
    }

    // Step 5: pre-backfill orders have no journal history — treat as paid/cleared.
    for (const oid of preBackfillIds) {
      out.set(oid, Z());
    }

    return out;
  }

  // ── No journal delegate — all orders treated as cleared. ─────────────
  for (const oid of activeOrderIds) {
    out.set(oid, Z());
  }
  return out;
}


/**
 * يحسب الرصيد المتبقي لطلب واحد (غلاف مريح حول الدالة الدفعية).
 * يُعيد صفرًا للطلبات الملغاة أو غير الموجودة.
 *
 * Computes the remaining balance for a single order (convenience wrapper
 * around the batch helper). Returns zero for canceled or unknown orders.
 *
 * @param db - عميل قاعدة البيانات | Database client
 * @param orderId - معرف الطلب | Order ID
 * @returns الرصيد المتبقي (≥ 0) | Remaining balance (≥ 0)
 * @since V20.3
 */
export async function computeOrderRemainingBalance(
  db: OrderDb,
  orderId: string,
): Promise<Prisma.Decimal> {
  const m = await computeOrderRemainingBalancesBatch(db, [orderId]);
  return m.get(orderId) ?? Z();
}

/**
 * يُعيد إجمالي ديون العميل من `CustomerWallet` (debt + التزام رصيد سالب).
 * يعكس سلوك `DebtService.getCustomerDebtSnapshot` كـ`Prisma.Decimal`
 * لتجنب الاستيراد من `FinanceModule` في وحدات أخرى.
 *
 * Returns the customer's total debt from `CustomerWallet`
 * (wallet.debt + negative-balance obligation).
 * Mirrors `DebtService.getCustomerDebtSnapshot` as `Prisma.Decimal`
 * to avoid importing `FinanceModule` from other modules.
 *
 * @param db - عميل Prisma يحتوي على `customerWallet` | Prisma client with `customerWallet`
 * @param customerId - معرف العميل | Customer ID
 * @returns إجمالي الدين (≥ 0) | Total debt (≥ 0)
 * @since V20.3
 */
export async function getCustomerDebtSnapshotTotalKd(
  db: Db,
  customerId: string,
): Promise<Prisma.Decimal> {
  const wallet = await db.customerWallet.findUnique({
    where: { customerId },
    select: { balance: true, debt: true },
  });
  const walletDebt = wallet?.debt ?? new Prisma.Decimal(0);
  const balance = wallet?.balance ?? new Prisma.Decimal(0);
  const subscriptionOveruseDebt = balance.lessThan(Z())
    ? balance.abs()
    : Z();
  return walletDebt.plus(subscriptionOveruseDebt);
}
