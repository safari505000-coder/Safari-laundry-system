import type { Customer360Financials } from '@/lib/api';

export type CustomerRating = 'GOOD' | 'WATCH' | 'BLOCKED';

export function formatArabicKwd(value: string | number): string {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return new Intl.NumberFormat('ar-KW', {
    minimumFractionDigits: 3,
  }).format(Number.isFinite(n) ? n : 0);
}

export function getArabicStatus(rating: CustomerRating): string {
  if (rating === 'BLOCKED') return '🚫 عميل موقوف';
  if (rating === 'WATCH') return '⚠️ يحتاج متابعة';
  return '✅ عميل ملتزم';
}

export function getArabicInsight(
  fin: Pick<Customer360Financials, 'totalDueKd'>,
  rating: CustomerRating,
): string {
  if (rating === 'BLOCKED') {
    return `🚫 المبلغ المطلوب دفعه من العميل ${formatArabicKwd(fin.totalDueKd)} د.ك. يجب إيقاف الطلبات والتواصل معه فورًا.`;
  }

  if (rating === 'WATCH') {
    return '⚠️ العميل بدأ يتأخر أو يستهلك أكثر من باقته. يُفضل المتابعة والتنبيه.';
  }

  return '✅ العميل ملتزم ومدفوعاته منتظمة.';
}

export function getArabicNextAction(rating: CustomerRating): string {
  if (rating === 'BLOCKED') {
    return '📞 تواصل مع العميل فورًا واطلب سداد المبلغ';
  }
  if (rating === 'WATCH') {
    return '📢 قم بتنبيه العميل بوجود تأخير أو استهلاك زائد';
  }
  return '👍 لا يوجد إجراء مطلوب';
}
