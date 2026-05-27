import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { PosCartLine, PosPaymentMethod } from '@/api/pos-types';
import { MutedText, PrimaryButton } from '@/components/ui';
import {
  DELIVERY_FEE_KD,
  formatPreviewKd,
  sumLinesKd,
} from '@/lib/pos-pricing';
import { brand } from '@/theme/brand';

const PAYMENT_OPTIONS: { value: PosPaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'نقد' },
  { value: 'KNET', label: 'كي نت' },
  { value: 'PAYMENT_LINK', label: 'رابط دفع' },
  { value: 'ONLINE', label: 'أونلاين' },
  { value: 'DEBT_ON_ACCOUNT', label: 'على الحساب' },
];

export function PosCartSheet({
  visible,
  lines,
  hasCustomer,
  systemClosed,
  paymentMethod,
  onPaymentChange,
  onClose,
  onQtyChange,
  onCheckout,
  checkoutBusy,
}: {
  visible: boolean;
  lines: PosCartLine[];
  hasCustomer: boolean;
  systemClosed: boolean;
  paymentMethod: PosPaymentMethod;
  onPaymentChange: (method: PosPaymentMethod) => void;
  onClose: () => void;
  onQtyChange: (lineKey: string, qty: number) => void;
  onCheckout: () => void;
  checkoutBusy: boolean;
}) {
  const lineSum = sumLinesKd(lines);
  const delivery = lineSum > 0 ? DELIVERY_FEE_KD : 0;
  const netTotal = lineSum + delivery;
  const pieceCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const checkoutBlockedReason = systemClosed
    ? 'النظام مغلق حالياً، لا يمكن إصدار فاتورة.'
    : !hasCustomer
      ? 'اختر العميل أولاً من أعلى شاشة POS قبل إتمام البيع.'
      : lines.length === 0
        ? 'السلة فارغة — أضف أصنافاً من القائمة.'
        : null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>السلة · {pieceCount} قطعة</Text>
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
            {lines.length > 0 ? (
              <View style={styles.totals}>
                <TotalRow label="الأصناف" value={formatPreviewKd(lineSum)} />
                <TotalRow
                  label="توصيل"
                  value={formatPreviewKd(delivery)}
                />
                <TotalRow
                  label="الإجمالي"
                  value={formatPreviewKd(netTotal)}
                  highlight
                />
                <MutedText>
                  يُرسل الإجمالي للسيرفر عبر POST /pos/checkout
                </MutedText>
              </View>
            ) : null}
          </ScrollView>

          <Text style={styles.payLabel}>طريقة الدفع</Text>
          <View style={styles.chips}>
            {PAYMENT_OPTIONS.map((opt) => {
              const active = paymentMethod === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onPaymentChange(opt.value)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
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
    maxHeight: '88%',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    color: brand.colors.text,
  },
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
  totalRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { color: brand.colors.textMuted, fontSize: 13 },
  totalValue: { fontSize: 14, fontWeight: '600', color: brand.colors.text },
  totalHighlight: { fontSize: 18, color: brand.colors.primaryBlue },
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
  chipText: { fontSize: 12, fontWeight: '800', color: brand.colors.text },
  chipTextActive: { color: brand.colors.white },
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
