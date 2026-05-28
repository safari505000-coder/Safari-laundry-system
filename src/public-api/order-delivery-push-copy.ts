import { DeliveryStatus } from '@prisma/client';

export function orderDeliveryStatusPushCopy(
  status: DeliveryStatus,
  invoiceLabel: string,
): { title: string; body: string } | null {
  switch (status) {
    case DeliveryStatus.OUT_FOR_DELIVERY:
      return {
        title: 'طلبك في الطريق',
        body: `السائق في طريقه إليك — فاتورة ${invoiceLabel}`,
      };
    case DeliveryStatus.DELIVERED:
      return {
        title: 'تم التسليم',
        body: `تم تسليم طلبك بنجاح — ${invoiceLabel}`,
      };
    case DeliveryStatus.RETURNED_TO_BRANCH:
      return {
        title: 'تحديث على طلبك',
        body: `تعذّر التوصيل — طلبك في المحل. تواصل معنا 22200299 — ${invoiceLabel}`,
      };
    default:
      return null;
  }
}
