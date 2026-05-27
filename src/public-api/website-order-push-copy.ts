import { WebsiteOrderRequestStatus } from '@prisma/client';

export function websiteOrderStatusPushCopy(
  status: WebsiteOrderRequestStatus,
  publicReference: string,
): { title: string; body: string } | null {
  switch (status) {
    case 'CONTACTED':
      return {
        title: 'سفاري — طلبك',
        body: `تم التواصل معك بخصوص الطلب ${publicReference}`,
      };
    case 'CONVERTED':
      return {
        title: 'سفاري — طلبك',
        body: `تم تحويل الطلب ${publicReference} إلى تنفيذ`,
      };
    case 'CANCELLED':
      return {
        title: 'سفاري — طلبك',
        body: `تم إلغاء الطلب ${publicReference}`,
      };
    default:
      return null;
  }
}
