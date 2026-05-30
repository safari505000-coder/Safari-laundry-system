import { PosPaymentMethod } from '@prisma/client';
import type { OrderDetail } from './order-types';

/**
 * V19.27.5 — Text block for customer WhatsApp: line labels + qty × price (3dp KWD).
 */
export function formatLineItemsBlockForNotify(detail: OrderDetail): string {
  if (!detail.lineItems?.length) {
    return '';
  }
  const out: string[] = [];
  for (const li of detail.lineItems) {
    const qty = Number(li.quantity);
    const unit = Number(li.unitPrice);
    const sub = (qty * unit).toFixed(3);
    const label = (li.label ?? '—').replace(/\s+/g, ' ').trim();
    out.push(
      `• ${label} — العدد ${String(qty)} × ${unit.toFixed(3)} = ${sub} د.ك`,
    );
  }
  return out.join('\n');
}

export function invoiceLabelForCustomerNotify(order: OrderDetail): string {
  return (
    order.serialNumber?.trim() ||
    order.invoiceNumber?.trim() ||
    `#${order.id.slice(0, 8)}`
  );
}

export function formatLineItemsBlockForBundleNotify(
  orders: OrderDetail[],
): string {
  if (orders.length === 0) {
    return '';
  }
  if (orders.length === 1) {
    return formatLineItemsBlockForNotify(orders[0]!);
  }
  const parts: string[] = [];
  for (const o of orders) {
    const lab = invoiceLabelForCustomerNotify(o);
    const block = formatLineItemsBlockForNotify(o);
    parts.push(`━━ ${lab} ━━`, block || '—');
  }
  return parts.join('\n\n');
}

export function collectionDebtReasonAr(
  paymentMethod: PosPaymentMethod | null,
  createdAtIso: string,
  invoiceNumber: string | null,
  readableId: string,
): string {
  const d = new Date(createdAtIso);
  const dateStr = Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('ar-KW', { timeZone: 'Asia/Kuwait' });
  const ref = invoiceNumber?.trim() || readableId;
  const noPaper = !invoiceNumber?.trim()
    ? ' (لا يوجد رقم فاتورة ورقية — مرجع النظام فقط)'
    : '';

  switch (paymentMethod) {
    case PosPaymentMethod.DEBT_ON_ACCOUNT:
      return `• ${ref} — ${dateStr}: «دين على الحساب» — طلب منفصل سُجّل كذمة مباشرة ولم يُغطَّ برصيد الاشتراك${noPaper}.`;
    case PosPaymentMethod.SUBSCRIPTION_WALLET:
      return `• ${ref} — ${dateStr}: باقي فاتورة بعد خصم رصيد الاشتراك من المحفظة${noPaper}.`;
    case PosPaymentMethod.PAYMENT_LINK:
    case PosPaymentMethod.ONLINE:
      return `• ${ref} — ${dateStr}: فاتورة بانتظار إتمام الدفع الإلكتروني${noPaper}.`;
    default:
      return `• ${ref} — ${dateStr}: رصيد مستحق على الطلب${noPaper}.`;
  }
}
