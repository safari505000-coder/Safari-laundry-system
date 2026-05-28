export type DeliveryStatus =
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RETURNED_TO_BRANCH';

export type DeliveryReturnReason =
  | 'NO_ANSWER'
  | 'WRONG_ADDRESS'
  | 'REFUSED'
  | 'OTHER';

export type DeliveryAction = 'start' | 'complete' | 'return';

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  READY: 'جاهز للتوصيل',
  OUT_FOR_DELIVERY: 'جاري التوصيل',
  DELIVERED: 'تم التسليم',
  RETURNED_TO_BRANCH: 'رجعت للمحل',
};

const RETURN_REASON_LABELS: Record<DeliveryReturnReason, string> = {
  NO_ANSWER: 'العميل لم يرد',
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

export function returnReasonLabelAr(reason: DeliveryReturnReason): string {
  return RETURN_REASON_LABELS[reason];
}

export function visibleDeliveryActions(
  status: string | null | undefined,
): DeliveryAction[] {
  switch (status) {
    case 'READY':
    case 'RETURNED_TO_BRANCH':
      return ['start'];
    case 'OUT_FOR_DELIVERY':
      return ['complete', 'return'];
    default:
      return [];
  }
}

export const RETURN_REASON_OPTIONS: DeliveryReturnReason[] = [
  'NO_ANSWER',
  'WRONG_ADDRESS',
  'REFUSED',
  'OTHER',
];
