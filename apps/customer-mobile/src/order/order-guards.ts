export type OrderGuardInput = {
  phone: string;
  itemCount: number;
  serviceMode: 'COURIER' | 'BRANCH';
  address?: string;
  pickupWindow?: string;
  branch?: string;
};

const KUWAIT_PHONE_PATTERN = /^(\+?965)?[569]\d{7}$/;

export function normalizeKuwaitPhone(phone: string): string {
  return phone.replace(/[\s-]/g, '').trim();
}

export function isValidKuwaitPhone(phone: string): boolean {
  return KUWAIT_PHONE_PATTERN.test(normalizeKuwaitPhone(phone));
}

export function validateOrderGuard(input: OrderGuardInput): string | null {
  const normalizedPhone = normalizeKuwaitPhone(input.phone);

  if (!isValidKuwaitPhone(normalizedPhone)) {
    return 'أدخل رقم جوال كويتي صحيح (يبدأ بـ 5 أو 6 أو 9).';
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
  if (input.serviceMode === 'BRANCH' && !input.branch?.trim()) {
    return 'اختر الفرع الذي ستسلّم فيه طلبك.';
  }

  return null;
}

export function validateTrackPhoneQuery(phone: string): string | null {
  if (!isValidKuwaitPhone(normalizeKuwaitPhone(phone))) {
    return 'أدخل رقم جوال كويتي صحيح (يبدأ بـ 5 أو 6 أو 9).';
  }
  return null;
}
