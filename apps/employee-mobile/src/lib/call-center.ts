export function getEventKindLabelAr(kind: string): string {
  switch (kind) {
    case 'SUBSCRIPTION_ACTIVATION':
      return 'تفعيل اشتراك جديد';
    case 'SUBSCRIPTION_CANCELLATION':
      return 'إلغاء الاشتراك';
    case 'SUBSCRIPTION_ROLLOVER_CARRY':
      return 'ترحيل الرصيد المتبقي';
    case 'ORDER_PAID_IN_FULL':
      return 'سداد فاتورة كاملة';
    case 'ORDER_SETTLEMENT_SUBSCRIPTION':
      return 'تسوية من رصيد الاشتراك';
    case 'ORDER_INVOICE_PARTIAL_PAYMENT':
      return 'دفع جزئي للفاتورة';
    case 'ORDER_INVOICE_ON_ACCOUNT':
      return 'إصدار فاتورة على الحساب';
    case 'PARTIAL_DEBT_PAYMENT':
      return 'سداد جزء من المديونية';
    default:
      return kind;
  }
}

export function getSubscriptionStatusLabelAr(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'نشط';
    case 'CUT_OFF':
      return 'موقوف';
    case 'CLOSED':
      return 'ملغي/مغلق';
    default:
      return status;
  }
}

export function getPaymentMethodLabelAr(method: string | null): string {
  if (!method) return 'غير محدد';
  switch (method) {
    case 'CASH':
      return 'كاش';
    case 'KNET':
      return 'كي نت';
    case 'ONLINE':
      return 'أونلاين';
    case 'PAYMENT_LINK':
      return 'رابط دفع';
    case 'DEBT_ON_ACCOUNT':
      return 'على الحساب';
    default:
      return method;
  }
}

export function getSubscriptionStatusTone(
  status: string,
): 'completed' | 'warning' | 'cancelled' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'completed';
    case 'CUT_OFF':
      return 'warning';
    case 'CLOSED':
      return 'cancelled';
    default:
      return 'neutral';
  }
}
