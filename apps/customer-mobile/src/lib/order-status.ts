import { WebsiteOrderRequestStatus } from '@safari-erp/shared-api';

const STATUS_LABELS: Record<WebsiteOrderRequestStatus, string> = {
  NEW: 'تم استلام طلبك',
  CONTACTED: 'تم تأكيد التفاصيل',
  CONVERTED: 'قيد العناية والتنفيذ',
  CANCELLED: 'تم إلغاء الطلب',
};

export function websiteOrderStatusLabel(
  status: WebsiteOrderRequestStatus,
): string {
  return STATUS_LABELS[status] ?? status;
}

export function websiteOrderStatusTone(
  status: WebsiteOrderRequestStatus,
): 'neutral' | 'progress' | 'done' | 'cancelled' {
  switch (status) {
    case 'NEW':
      return 'neutral';
    case 'CONTACTED':
      return 'progress';
    case 'CONVERTED':
      return 'done';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'neutral';
  }
}

export function serviceTypeLabel(
  serviceType: 'NORMAL' | 'EXPRESS' | null | undefined,
): string {
  if (serviceType === 'EXPRESS') {
    return 'عناية سريعة';
  }
  if (serviceType === 'NORMAL') {
    return 'العناية المعتادة';
  }
  return '—';
}
