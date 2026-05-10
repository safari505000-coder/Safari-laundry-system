import type { Customer360Financials } from '@/lib/api';
import { formatKwdLabel } from '@/lib/kwd';

export type CustomerRating = 'GOOD' | 'WATCH' | 'BLOCKED';

export function getArabicStatus(rating: CustomerRating): string {
  if (rating === 'BLOCKED') return '🚫 عميل موقوف';
  if (rating === 'WATCH') return '⚠️ يحتاج متابعة';
  return '✅ عميل ملتزم';
}

export function getArabicInsight(
  fin: Pick<Customer360Financials, 'canonicalDebtKd'>,
  rating: CustomerRating,
): string {
  if (rating === 'BLOCKED') {
    return `🚫 المبلغ المطلوب دفعه من العميل ${formatKwdLabel(fin.canonicalDebtKd)}. يجب إيقاف الطلبات والتواصل معه فورًا.`;
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
