export type DeliveryStatus =
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RETURNED_TO_BRANCH';

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  READY: 'جاهز للتوصيل',
  OUT_FOR_DELIVERY: 'في الطريق إليك',
  DELIVERED: 'تم التسليم',
  RETURNED_TO_BRANCH: 'في المحل — تعذّر التوصيل',
};

const RETURN_REASON_LABELS: Record<string, string> = {
  NO_ANSWER: 'لم يرد العميل',
  WRONG_ADDRESS: 'عنوان غير صحيح',
  REFUSED: 'رفض الاستلام',
  OTHER: 'سبب آخر',
};

export function deliveryStatusLabelAr(status: string | null | undefined): string {
  if (!status) {
    return STATUS_LABELS.READY;
  }
  return STATUS_LABELS[status as DeliveryStatus] ?? status;
}

export function deliveryReturnReasonLabelAr(reason: string | null | undefined): string {
  if (!reason) {
    return '';
  }
  return RETURN_REASON_LABELS[reason] ?? reason;
}

export const DELIVERY_TIMELINE_STEPS: Array<{
  status: DeliveryStatus;
  label: string;
}> = [
  { status: 'READY', label: 'جاهز للتوصيل' },
  { status: 'OUT_FOR_DELIVERY', label: 'السائق في الطريق' },
  { status: 'DELIVERED', label: 'تم التسليم' },
];

export function deliveryTimelineActiveIndex(status: DeliveryStatus): number {
  if (status === 'RETURNED_TO_BRANCH') {
    return 1;
  }
  const idx = DELIVERY_TIMELINE_STEPS.findIndex((step) => step.status === status);
  return idx >= 0 ? idx : 0;
}
