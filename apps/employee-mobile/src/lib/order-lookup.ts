import { ApiError } from '@/api/client';
import { fetchOrderById, searchDriverOrders } from '@/api/orders';
import { pickOrderIdFromSearchResults } from '@/lib/order-search-match';
import {
  extractScannedOrderReference,
  isValidOrderId,
} from '@/lib/order-scan';

export function formatOrderLookupError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message.includes('uuid is expected')) {
      return 'رقم غير صالح — استخدم رقم التسلسل من الفاتورة أو امسح الباركود';
    }
    if (err.status === 403) {
      return 'لا يمكنك عرض هذه الفاتورة';
    }
    if (err.status === 404) {
      return 'لم يُعثر على الفاتورة';
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'فشل البحث عن الفاتورة';
}

export async function resolveDriverOrderId(
  token: string,
  raw: string,
): Promise<string> {
  const reference = extractScannedOrderReference(raw);
  if (!reference.trim()) {
    throw new Error('أدخل رقم الفاتورة أو امسح الباركود');
  }

  if (isValidOrderId(reference)) {
    const order = await fetchOrderById(token, reference);
    return order.id;
  }

  if (reference.trim().length < 2) {
    throw new Error('أدخل رقم التسلسل كاملاً (مثل D2-1045)');
  }

  const rows = await searchDriverOrders(token, reference.trim());
  return pickOrderIdFromSearchResults(rows, reference.trim());
}
