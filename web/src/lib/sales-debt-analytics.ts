import type { OrderRow } from '@/lib/api';

export type SalesDebtPeriodKind = 'weekly' | 'monthly';
export type SalesDebtPeriodMode =
  | 'last7Days'
  | 'calendarWeek'
  | 'currentMonth'
  | 'previousMonth';

export type SalesDebtRange = {
  from: Date;
  to: Date;
};

export type SalesDebtGroupRow = {
  id: string;
  name: string;
  totalSales: number;
  totalCollected: number;
  totalDebt: number;
  collectionRate: number;
  invoiceCount: number;
};

export type SalesDebtAnalytics = {
  period: {
    kind: SalesDebtPeriodKind;
    mode: SalesDebtPeriodMode;
    from: string;
    to: string;
  };
  totals: {
    totalSales: number;
    totalCollected: number;
    totalDebt: number;
    collectionRate: number;
    invoiceCount: number;
  };
  byBranch: SalesDebtGroupRow[];
  byDriver: SalesDebtGroupRow[];
};

type OrderWithPayments = OrderRow & {
  payments?: Array<{
    id?: string | null;
    amount?: string | number | null;
    amountKd?: string | number | null;
    status?: string | null;
  }> | null;
  paidAmount?: string | number | null;
  paidAmountKd?: string | number | null;
  amountPaid?: string | number | null;
};

function amount(value: string | number | null | undefined): number {
  const next = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return Number.isFinite(next) ? next : 0;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function orderDate(order: OrderRow): Date {
  return new Date(order.completedAt ?? order.createdAt);
}

function isVoided(order: OrderRow): boolean {
  const status = order.status.toUpperCase();
  return status === 'CANCELED' || status === 'CANCELLED' || status === 'VOID' || status === 'VOIDED';
}

function explicitCollected(order: OrderRow): number | null {
  const candidate = order as OrderWithPayments;
  if (Array.isArray(candidate.payments) && candidate.payments.length > 0) {
    const seen = new Set<string>();
    return candidate.payments.reduce((sum, payment, index) => {
      const id = payment.id ?? `idx:${index}`;
      if (seen.has(id)) return sum;
      seen.add(id);
      const status = payment.status?.toUpperCase();
      if (status && ['FAILED', 'CANCELED', 'CANCELLED', 'VOID', 'VOIDED'].includes(status)) {
        return sum;
      }
      return sum + amount(payment.amountKd ?? payment.amount);
    }, 0);
  }

  const direct =
    candidate.paidAmountKd ?? candidate.paidAmount ?? candidate.amountPaid;
  if (direct != null) return amount(direct);
  return null;
}

function collectedAmount(order: OrderRow): number {
  const sales = amount(order.totalPrice);
  const explicit = explicitCollected(order);
  if (explicit != null) return Math.min(sales, Math.max(0, explicit));

  const cashStatus = order.cashStatus.toUpperCase();
  const method = order.posPaymentMethod?.toUpperCase();
  const settled =
    cashStatus === 'PAID_TO_DRIVER' ||
    cashStatus === 'HANDED_OVER_TO_OFFICE' ||
    cashStatus === 'PAID_ONLINE' ||
    cashStatus === 'SETTLED' ||
    cashStatus === 'PAID' ||
    method === 'SUBSCRIPTION_WALLET';

  return settled ? sales : 0;
}

function addGroup(
  map: Map<string, SalesDebtGroupRow>,
  id: string,
  name: string,
  sales: number,
  collected: number,
): void {
  const current = map.get(id);
  if (current) {
    current.totalSales += sales;
    current.totalCollected += collected;
    current.totalDebt = Math.max(0, current.totalSales - current.totalCollected);
    current.collectionRate =
      current.totalSales > 0 ? current.totalCollected / current.totalSales : 0;
    current.invoiceCount += 1;
    return;
  }
  map.set(id, {
    id,
    name,
    totalSales: sales,
    totalCollected: collected,
    totalDebt: Math.max(0, sales - collected),
    collectionRate: sales > 0 ? collected / sales : 0,
    invoiceCount: 1,
  });
}

function sortedGroups(map: Map<string, SalesDebtGroupRow>): SalesDebtGroupRow[] {
  return [...map.values()].sort((a, b) => b.totalSales - a.totalSales);
}

export function resolveSalesDebtRange(
  kind: SalesDebtPeriodKind,
  mode: SalesDebtPeriodMode,
  now = new Date(),
): SalesDebtRange {
  if (kind === 'monthly') {
    const month = mode === 'previousMonth' ? now.getMonth() - 1 : now.getMonth();
    const from = new Date(now.getFullYear(), month, 1);
    const to = new Date(now.getFullYear(), month + 1, 0);
    return { from: startOfDay(from), to: endOfDay(to) };
  }

  if (mode === 'calendarWeek') {
    const today = startOfDay(now);
    const day = today.getDay();
    const daysSinceMonday = (day + 6) % 7;
    const from = new Date(today);
    from.setDate(today.getDate() - daysSinceMonday);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    return { from, to: endOfDay(to) };
  }

  const to = endOfDay(now);
  const from = startOfDay(now);
  from.setDate(from.getDate() - 6);
  return { from, to };
}

export function buildSalesDebtAnalytics(
  orders: OrderRow[],
  filters: {
    kind: SalesDebtPeriodKind;
    mode: SalesDebtPeriodMode;
    range: SalesDebtRange;
  },
): SalesDebtAnalytics {
  const byBranch = new Map<string, SalesDebtGroupRow>();
  const byDriver = new Map<string, SalesDebtGroupRow>();
  const fromMs = filters.range.from.getTime();
  const toMs = filters.range.to.getTime();
  let totalSales = 0;
  let totalCollected = 0;
  let invoiceCount = 0;

  for (const order of orders) {
    if (isVoided(order)) continue;
    const date = orderDate(order).getTime();
    if (!Number.isFinite(date) || date < fromMs || date > toMs) continue;

    const sales = amount(order.totalPrice);
    const collected = collectedAmount(order);
    const branch = order.driver?.branch;
    const driver = order.driver;

    totalSales += sales;
    totalCollected += collected;
    invoiceCount += 1;

    addGroup(
      byBranch,
      branch?.id ?? 'no-branch',
      branch?.name ?? 'بدون فرع',
      sales,
      collected,
    );
    addGroup(
      byDriver,
      driver?.id ?? 'no-driver',
      driver?.fullName || driver?.username || 'بدون سائق',
      sales,
      collected,
    );
  }

  return {
    period: {
      kind: filters.kind,
      mode: filters.mode,
      from: filters.range.from.toISOString(),
      to: filters.range.to.toISOString(),
    },
    totals: {
      totalSales,
      totalCollected,
      totalDebt: Math.max(0, totalSales - totalCollected),
      collectionRate: totalSales > 0 ? totalCollected / totalSales : 0,
      invoiceCount,
    },
    byBranch: sortedGroups(byBranch),
    byDriver: sortedGroups(byDriver),
  };
}
