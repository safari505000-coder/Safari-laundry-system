import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CustomerBillingProfile, PosPaymentMethod } from '@/api/pos-types';
import { MutedText, PrimaryButton } from '@/components/ui';
import {
  VIP_LINE_LABEL_AR,
  VIP_SURCHARGE_KD,
  deliveryForSubOrder,
  firstFilledSubOrderIndex,
  formatPreviewKd,
  grandTotalKd,
  sumLinesKd,
  type PosSubOrder,
} from '@/lib/pos-pricing';
import {
  canUseSubscriptionPayment,
  paymentMethodLabelAr,
} from '@/lib/payment-methods';
import { brand } from '@/theme/brand';

const PAYMENT_OPTIONS: { value: PosPaymentMethod; label: string }[] = [
  { value: 'CASH', label: paymentMethodLabelAr('CASH') },
  { value: 'KNET', label: paymentMethodLabelAr('KNET') },
  { value: 'PAYMENT_LINK', label: paymentMethodLabelAr('PAYMENT_LINK') },
  { value: 'DEBT_ON_ACCOUNT', label: paymentMethodLabelAr('DEBT_ON_ACCOUNT') },
  { value: 'SUBSCRIPTION', label: paymentMethodLabelAr('SUBSCRIPTION') },
];

export function PosCartSheet({
  visible,
  subOrders,
  activeSubOrderIndex,
  onActiveSubOrderChange,
  onAddAttachedOrder,
  onVipToggle,
  hasCustomer,
  systemClosed,
  paymentMethod,
  onPaymentChange,
  onClose,
  onQtyChange,
  onCheckout,
  checkoutBusy,
  subscriptionProfile,
}: {
  visible: boolean;
  subOrders: PosSubOrder[];
  activeSubOrderIndex: number;
  onActiveSubOrderChange: (index: number) => void;
  onAddAttachedOrder: () => void;
  onVipToggle: (index: number) => void;
  hasCustomer: boolean;
  systemClosed: boolean;
  paymentMethod: PosPaymentMethod;
  onPaymentChange: (method: PosPaymentMethod) => void;
  onClose: () => void;
  onQtyChange: (lineKey: string, qty: number) => void;
  onCheckout: () => void;
  checkoutBusy: boolean;
  subscriptionProfile: CustomerBillingProfile | null;
}) {
  const activeOrder = subOrders[activeSubOrderIndex];
  const lines = activeOrder?.lines ?? [];
  const lineSum = sumLinesKd(lines);
  const firstIdx = firstFilledSubOrderIndex(subOrders);
  const netTotal = grandTotalKd(subOrders, paymentMethod, subscriptionProfile);
  const pieceCount = subOrders.reduce(
    (sum, order) =>
      sum + order.lines.reduce((n, line) => n + line.quantity, 0),
    0,
  );
  const hasAnyLines = subOrders.some((order) => order.lines.length > 0);
  const subscriptionAllowed = canUseSubscriptionPayment(subscriptionProfile);
  const checkoutBlockedReason = systemClosed
    ? 'النظام مغلق حالياً، لا يمكن إصدار فاتورة.'
    : !hasCustomer
      ? 'اختر العميل أولاً من أعلى شاشة POS قبل إتمام البيع.'
      : !hasAnyLines
        ? 'السلة فارغة — أضف أصنافاً من القائمة.'
        : paymentMethod === 'SUBSCRIPTION' && !subscriptionAllowed
          ? 'الدفع من الاشتراك يحتاج اشتراكاً نشطاً ورصيداً متاحاً للعميل.'
          : null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>السلة · {pieceCount} قطعة</Text>

          {subOrders.length > 1 ? (
            <View style={styles.tabs}>
              {subOrders.map((order, idx) => {
                const count = order.lines.reduce((n, l) => n + l.quantity, 0);
                const active = idx === activeSubOrderIndex;
                return (
                  <Pressable
                    key={order.id}
                    onPress={() => onActiveSubOrderChange(idx)}
                    style={[styles.tab, active && styles.tabActive]}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {order.kind === 'primary' ? `فاتورة ${idx + 1}` : `تابعة ${idx + 1}`}
                      {count > 0 ? ` (${count})` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <ScrollView contentContainerStyle={styles.list}>
            {lines.length === 0 ? (
              <MutedText>السلة فارغة — أضف أصنافاً من القائمة.</MutedText>
            ) : (
              lines.map((line) => (
                <View key={line.lineKey} style={styles.line}>
                  <View style={styles.lineMeta}>
                    <Text style={styles.lineName}>{line.nameAr}</Text>
                    <Text style={styles.linePrice}>
                      {formatPreviewKd(line.unitPrice)} × {line.quantity}
                    </Text>
                  </View>
                  <View style={styles.qtyRow}>
                    <Pressable
                      onPress={() =>
                        onQtyChange(line.lineKey, line.quantity - 1)
                      }
                      style={styles.qtyBtn}
                    >
                      <Text style={styles.qtyBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.qty}>{line.quantity}</Text>
                    <Pressable
                      onPress={() =>
                        onQtyChange(line.lineKey, line.quantity + 1)
                      }
                      style={styles.qtyBtn}
                    >
                      <Text style={styles.qtyBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            {subOrders.some((order) => sumLinesKd(order.lines) > 0) ? (
              <View style={styles.sessionBox}>
                <Text style={styles.sessionTitle}>ملخص الجلسة</Text>
                {subOrders.map((order, idx) => {
                  const orderLineSum = sumLinesKd(order.lines);
                  if (orderLineSum <= 0) {
                    return null;
                  }
                  const delivery = deliveryForSubOrder({
                    lineSum: orderLineSum,
                    isFirstInSession: idx === firstIdx,
                    paymentMethod,
                    subscriptionProfile,
                  });
                  const vipOn = Boolean(order.vipEnabled);
                  return (
                    <View key={order.id} style={styles.sessionRow}>
                      <View style={styles.sessionMeta}>
                        <Text style={styles.sessionLabel}>
                          {order.kind === 'primary'
                            ? `فاتورة ${idx + 1}`
                            : `فاتورة تابعة ${idx + 1}`}
                        </Text>
                        <Text style={styles.sessionDetail}>
                          {formatPreviewKd(orderLineSum)} · توصيل{' '}
                          {delivery > 0
                            ? formatPreviewKd(delivery)
                            : idx === firstIdx
                              ? 'مجاني (اشتراك)'
                              : 'مجاني'}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => onVipToggle(idx)}
                        style={[styles.vipBtn, vipOn && styles.vipBtnOn]}
                      >
                        <Text style={[styles.vipText, vipOn && styles.vipTextOn]}>
                          {VIP_LINE_LABEL_AR}
                          {vipOn ? ` +${VIP_SURCHARGE_KD.toFixed(3)}` : ''}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
                <TotalRow label="الإجمالي الكلي" value={formatPreviewKd(netTotal)} highlight />
              </View>
            ) : lineSum > 0 ? (
              <View style={styles.totals}>
                <TotalRow label="الأصناف" value={formatPreviewKd(lineSum)} />
                <TotalRow
                  label="توصيل"
                  value={formatPreviewKd(
                    deliveryForSubOrder({
                      lineSum,
                      isFirstInSession: activeSubOrderIndex === firstIdx,
                      paymentMethod,
                      subscriptionProfile,
                    }),
                  )}
                />
                <TotalRow
                  label="الإجمالي"
                  value={formatPreviewKd(
                    lineSum +
                      deliveryForSubOrder({
                        lineSum,
                        isFirstInSession: activeSubOrderIndex === firstIdx,
                        paymentMethod,
                        subscriptionProfile,
                      }),
                  )}
                  highlight
                />
              </View>
            ) : null}
          </ScrollView>

          {hasCustomer ? (
            <Pressable
              style={styles.attachBtn}
              onPress={onAddAttachedOrder}
              disabled={!hasCustomer}
            >
              <Text style={styles.attachBtnText}>+ فاتورة تابعة</Text>
            </Pressable>
          ) : null}

          <Text style={styles.payLabel}>طريقة الدفع</Text>
          <View style={styles.chips}>
            {PAYMENT_OPTIONS.map((opt) => {
              const active = paymentMethod === opt.value;
              const disabled =
                opt.value === 'SUBSCRIPTION' && !subscriptionAllowed;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    if (!disabled) {
                      onPaymentChange(opt.value);
                    }
                  }}
                  disabled={disabled}
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                    disabled && styles.chipDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active && styles.chipTextActive,
                      disabled && styles.chipTextDisabled,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {checkoutBlockedReason ? (
            <View style={styles.blockedBox}>
              <Text style={styles.blockedText}>{checkoutBlockedReason}</Text>
            </View>
          ) : null}

          <PrimaryButton
            label={checkoutBusy ? 'جاري الحفظ…' : 'إتمام البيع'}
            onPress={onCheckout}
            disabled={checkoutBusy || checkoutBlockedReason !== null}
          />
          <Pressable onPress={onClose}>
            <Text style={styles.close}>إغلاق</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function TotalRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalValue, highlight && styles.totalHighlight]}>
        {value}
      </Text>
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: brand.colors.surface,
    borderTopLeftRadius: brand.radius.xl,
    borderTopRightRadius: brand.radius.xl,
    padding: 16,
    gap: 10,
    maxHeight: '92%',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    color: brand.colors.text,
  },
  tabs: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 6,
  },
  tab: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tabActive: {
    backgroundColor: brand.colors.primaryBlue,
    borderColor: brand.colors.primaryBlue,
  },
  tabText: { fontSize: 11, fontWeight: '800', color: brand.colors.text },
  tabTextActive: { color: brand.colors.white },
  list: { gap: 10, paddingBottom: 8 },
  line: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },
  lineMeta: { flex: 1, alignItems: 'flex-end', gap: 2 },
  lineName: { fontSize: 14, fontWeight: '800', color: brand.colors.text },
  linePrice: { fontSize: 12, color: brand.colors.textMuted },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: brand.radius.sm,
    backgroundColor: brand.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, fontWeight: '700' },
  qty: { minWidth: 20, textAlign: 'center', fontWeight: '700' },
  totals: { gap: 6, paddingTop: 8 },
  sessionBox: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: brand.colors.border,
  },
  sessionTitle: {
    textAlign: 'right',
    fontWeight: '900',
    fontSize: 13,
    color: brand.colors.text,
  },
  sessionRow: { gap: 6 },
  sessionMeta: { alignItems: 'flex-end', gap: 2 },
  sessionLabel: { fontSize: 12, fontWeight: '800', color: brand.colors.text },
  sessionDetail: { fontSize: 11, color: brand.colors.textMuted },
  vipBtn: {
    borderRadius: brand.radius.md,
    borderWidth: 1,
    borderColor: brand.colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'flex-end',
  },
  vipBtnOn: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  vipText: { fontSize: 11, fontWeight: '800', color: brand.colors.textMuted },
  vipTextOn: { color: '#92400E' },
  totalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { color: brand.colors.textMuted, fontSize: 13 },
  totalValue: { fontSize: 14, fontWeight: '600', color: brand.colors.text },
  totalHighlight: { fontSize: 18, color: brand.colors.primaryBlue },
  attachBtn: {
    borderRadius: brand.radius.md,
    borderWidth: 1,
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
    paddingVertical: 10,
    alignItems: 'center',
  },
  attachBtnText: { color: '#047857', fontWeight: '900', fontSize: 13 },
  payLabel: {
    textAlign: 'right',
    fontWeight: '600',
    color: brand.colors.text,
  },
  chips: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: brand.colors.primaryBlue,
    borderColor: brand.colors.primaryBlue,
  },
  chipDisabled: {
    backgroundColor: brand.colors.surfaceMuted,
    opacity: 0.55,
  },
  chipText: { fontSize: 12, fontWeight: '800', color: brand.colors.text },
  chipTextActive: { color: brand.colors.white },
  chipTextDisabled: { color: brand.colors.textMuted },
  blockedBox: {
    borderRadius: brand.radius.md,
    backgroundColor: brand.colors.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 10,
  },
  blockedText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 20,
  },
  close: {
    textAlign: 'center',
    color: brand.colors.textMuted,
    paddingVertical: 6,
  },
});
