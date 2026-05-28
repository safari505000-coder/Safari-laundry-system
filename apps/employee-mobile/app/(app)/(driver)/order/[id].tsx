import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  completeOrderDelivery,
  fetchOrderById,
  returnOrderToBranch,
  startOrderDelivery,
  type DeliveryReturnReason,
  type OrderDetailRow,
} from '@/api/orders';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';
import { DriverChrome } from '@/components/driver/driver-chrome';
import { GhostButton, MutedText, PrimaryButton, SectionHeader, SurfaceCard } from '@/components/ui';
import {
  RETURN_REASON_OPTIONS,
  deliveryStatusLabelAr,
  returnReasonLabelAr,
  visibleDeliveryActions,
} from '@/lib/delivery-status';
import { formatKwdLabel } from '@/lib/kwd';
import { isValidOrderId, normalizeScannedOrderId } from '@/lib/order-scan';
import { paymentMethodLabelAr } from '@/lib/payment-methods';
import { brand } from '@/theme/brand';

export default function DriverOrderDetailScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const orderId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    return raw ? normalizeScannedOrderId(raw) : '';
  }, [params.id]);

  if (!isValidOrderId(orderId)) {
    const isManager = user && resolveMobileAppRole(user.safariRole) === 'manager';
    return <Redirect href={isManager ? "/(app)/(manager)/scan" : "/(app)/(driver)/(tabs)/scan"} />;
  }

  return <DriverOrderDetailContent orderId={orderId} />;
}

function DriverOrderDetailContent({ orderId }: { orderId: string }) {
  const { getValidAccessToken, user } = useAuth();
  const isDriver = user?.safariRole === 'DRIVER';
  const [order, setOrder] = useState<OrderDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const row = await fetchOrderById(token, orderId);
      setOrder(row);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [getValidAccessToken, orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (action: 'start' | 'complete' | 'return', reason?: DeliveryReturnReason) => {
      try {
        setActionBusy(true);
        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('انتهت الجلسة');
        }
        let updated: OrderDetailRow;
        if (action === 'start') {
          updated = await startOrderDelivery(token, orderId);
        } else if (action === 'complete') {
          updated = await completeOrderDelivery(token, orderId);
        } else {
          updated = await returnOrderToBranch(token, orderId, {
            reason: reason ?? 'OTHER',
          });
        }
        setOrder(updated);
        Alert.alert('تم', 'تم تحديث حالة التوصيل');
      } catch (err) {
        Alert.alert(
          'تعذّر التحديث',
          err instanceof Error ? err.message : 'حاول مرة أخرى',
        );
      } finally {
        setActionBusy(false);
      }
    },
    [getValidAccessToken, orderId],
  );

  const confirmReturn = useCallback(() => {
    Alert.alert('رجعت للمحل', 'اختر سبب عدم التسليم', [
      ...RETURN_REASON_OPTIONS.map((reason) => ({
        text: returnReasonLabelAr(reason),
        onPress: () => void runAction('return', reason),
      })),
      { text: 'إلغاء', style: 'cancel' },
    ]);
  }, [runAction]);

  const confirmStart = useCallback(() => {
    Alert.alert('بدء التوصيل', 'تأكيد أنك خرجت بالفاتورة نحو العميل؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'بدء التوصيل', onPress: () => void runAction('start') },
    ]);
  }, [runAction]);

  const confirmComplete = useCallback(() => {
    Alert.alert('تم التسليم', 'تأكيد أن العميل استلم الطلب؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تم التسليم', onPress: () => void runAction('complete') },
    ]);
  }, [runAction]);

  const label =
    order?.serialNumber ?? order?.invoiceNumber ?? order?.id.slice(0, 8) ?? 'فاتورة';
  const actions = visibleDeliveryActions(order?.deliveryStatus);

  return (
    <DriverChrome title="تفاصيل الفاتورة" showBack>
      {loading ? (
        <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : order ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <SectionHeader
            eyebrow="Invoice Detail"
            title={label}
            subtitle="تفاصيل الفاتورة من النظام"
          />
          <SurfaceCard>
            <Text style={styles.amount}>
              {formatKwdLabel(String(order.totalPrice))}
            </Text>
            <Row
              label="حالة التوصيل"
              value={deliveryStatusLabelAr(order.deliveryStatus)}
              highlight
            />
            <Row label="حالة الفاتورة" value={order.status} />
            <Row label="التحصيل" value={order.cashStatus} />
            <Row label="الدفع" value={paymentMethodLabelAr(order.posPaymentMethod)} />
            <Row
              label="العميل"
              value={order.customer.displayName ?? order.customer.phone}
            />
            <Row label="الجوال" value={order.customer.phone} />
            <Row label="العنوان" value={order.customer.address ?? '—'} />
            {order.notes ? <Row label="ملاحظات" value={order.notes} /> : null}
            <MutedText>المبلغ من السيرفر — بدون حساب محلي</MutedText>
          </SurfaceCard>

          {actions.length > 0 && isDriver ? (
            <View style={styles.actions}>
              {actions.includes('start') ? (
                <PrimaryButton
                  label={actionBusy ? 'جاري التحديث…' : 'بدء التوصيل'}
                  onPress={confirmStart}
                  disabled={actionBusy}
                />
              ) : null}
              {actions.includes('complete') ? (
                <PrimaryButton
                  label={actionBusy ? 'جاري التحديث…' : 'تم التسليم'}
                  onPress={confirmComplete}
                  disabled={actionBusy}
                />
              ) : null}
              {actions.includes('return') ? (
                <GhostButton
                  label={actionBusy ? 'جاري التحديث…' : 'رجعت للمحل'}
                  onPress={confirmReturn}
                  disabled={actionBusy}
                />
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </DriverChrome>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingBottom: 32 },
  amount: {
    fontSize: 28,
    fontWeight: '900',
    color: brand.colors.primaryBlue,
    textAlign: 'right',
  },
  row: { width: '100%', alignItems: 'flex-end', gap: 2 },
  rowLabel: { fontSize: 12, color: brand.colors.textMuted },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: brand.colors.text,
    textAlign: 'right',
  },
  rowValueHighlight: {
    color: brand.colors.primaryBlue,
    fontWeight: '800',
  },
  actions: { gap: 10 },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
