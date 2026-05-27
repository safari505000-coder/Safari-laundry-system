export type OrderGuardInput = {
  phone: string;
  itemCount: number;
  serviceMode: 'COURIER' | 'BRANCH';
  address?: string;
  pickupWindow?: string;
};

export function validateOrderGuard(input: OrderGuardInput): string | null {
  const normalizedPhone = input.phone.replace(/[\s-]/g, '').trim();

  if (normalizedPhone.length < 8) {
    return 'أدخل رقم جوال كويتي صحيح لإكمال الطلب.';
  }
  if (input.itemCount === 0) {
    return 'اختر خدمة واحدة على الأقل قبل تأكيد الطلب.';
  }
  if (input.serviceMode === 'COURIER' && !input.address?.trim()) {
    return 'أدخل عنوان الاستلام حتى يصل فريق سفاري بدقة.';
  }
  if (input.serviceMode === 'COURIER' && !input.pickupWindow) {
    return 'اختر فترة الاستلام المناسبة.';
  }

  return null;
}
