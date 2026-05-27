import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchOrderById, type OrderDetailRow } from '@/api/orders';
import { useAuth } from '@/auth/auth-context';
import { DriverChrome } from '@/components/driver/driver-chrome';
import { MutedText } from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export default function DriverOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getValidAccessToken } = useAuth();
  const [order, setOrder] = useState<OrderDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError('معرّف غير صالح');
      setLoading(false);
      return;
    }
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const row = await fetchOrderById(token, id);
      setOrder(row);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [getValidAccessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const label =
    order?.serialNumber ?? order?.invoiceNumber ?? order?.id.slice(0, 8);

  return (
    <DriverChrome title="تفاصيل الفاتورة">
      {loading ? (
        <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : order ? (
        <ScrollView contentContainerStyle={styles.card}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.amount}>
            {formatKwdLabel(String(order.totalPrice))}
          </Text>
          <Row label="الحالة" value={order.status} />
          <Row label="التحصيل" value={order.cashStatus} />
          <Row label="الدفع" value={order.posPaymentMethod ?? '—'} />
          <Row
            label="العميل"
            value={order.customer.displayName ?? order.customer.phone}
          />
          <Row label="الجوال" value={order.customer.phone} />
          <Row label="العنوان" value={order.customer.address ?? '—'} />
          {order.notes ? <Row label="ملاحظات" value={order.notes} /> : null}
          <MutedText>المبلغ من السيرفر — بدون حساب محلي</MutedText>
        </ScrollView>
      ) : null}
    </DriverChrome>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.colors.white,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: brand.colors.text,
  },
  amount: {
    fontSize: 24,
    fontWeight: '800',
    color: brand.colors.primaryBlue,
  },
  row: { width: '100%', alignItems: 'flex-end', gap: 2 },
  rowLabel: { fontSize: 12, color: brand.colors.textMuted },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: brand.colors.text,
    textAlign: 'right',
  },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
