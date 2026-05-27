import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import {
  listWebsiteCustomerPayments,
  type WebsiteCustomerPaymentFilter,
  type WebsiteCustomerPaymentRow,
} from '@/api/call-center';
import { useAuth } from '@/auth/auth-context';
import { CcChrome } from '@/components/call-center/cc-chrome';
import { MutedText, SectionHeader } from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

const FILTERS: WebsiteCustomerPaymentFilter[] = ['PENDING', 'PAID', 'ALL'];

const FILTER_LABELS: Record<WebsiteCustomerPaymentFilter, string> = {
  PENDING: 'معلّقة',
  PAID: 'مدفوعة',
  ALL: 'الكل',
};

export default function WebsitePaymentsScreen() {
  const { getValidAccessToken } = useAuth();
  const [rows, setRows] = useState<WebsiteCustomerPaymentRow[]>([]);
  const [filter, setFilter] = useState<WebsiteCustomerPaymentFilter>(
    'PENDING',
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const data = await listWebsiteCustomerPayments(token, filter);
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, getValidAccessToken]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <CcChrome title="مدفوعات الموقع">
      <View style={styles.wrap}>
        <SectionHeader
          eyebrow="Online Payments"
          title="مدفوعات الموقع"
          subtitle="مراجعة الروابط المفتوحة والمدفوعة"
        />
        <View style={styles.filters}>
          {FILTERS.map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setFilter(tab)}
              style={[styles.chip, filter === tab && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  filter === tab && styles.chipTextActive,
                ]}
              >
                {FILTER_LABELS[tab]}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && rows.length === 0 ? (
          <ActivityIndicator color={brand.colors.primaryBlue} />
        ) : error && rows.length === 0 ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.orderId}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load();
                }}
              />
            }
            ListEmptyComponent={
              <Text style={styles.empty}>لا مدفوعات في هذا الفلتر</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.name}>
                  {item.customerDisplayName ?? item.customerPhone}
                </Text>
                <Text style={styles.meta}>
                  {item.serialNumber ?? item.invoiceNumber ?? item.orderId.slice(0, 8)}
                </Text>
                <Text style={styles.amount}>
                  متبقي: {formatKwdLabel(item.remainingAmountKd)}
                </Text>
                <MutedText>الحالة: {item.paymentStatus}</MutedText>
                {item.paymentUrl ? (
                  <Pressable
                    onPress={() => void Linking.openURL(item.paymentUrl!)}
                  >
                    <Text style={styles.link}>فتح رابط الدفع</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          />
        )}
      </View>
    </CcChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  filters: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: brand.colors.surface,
    borderWidth: 1,
    borderColor: brand.colors.border,
  },
  chipActive: {
    backgroundColor: brand.colors.darkBlue,
    borderColor: brand.colors.darkBlue,
  },
  chipText: { fontSize: 12, color: brand.colors.textMuted },
  chipTextActive: { color: brand.colors.white, fontWeight: '700' },
  list: { gap: 10, paddingBottom: 24 },
  card: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.lg,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: brand.colors.border,
  },
  name: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    color: brand.colors.text,
  },
  meta: {
    textAlign: 'right',
    color: brand.colors.textMuted,
    fontSize: 13,
  },
  amount: {
    textAlign: 'right',
    fontWeight: '800',
    color: brand.colors.text,
  },
  link: {
    color: brand.colors.primaryBlue,
    textAlign: 'right',
    fontWeight: '600',
  },
  empty: { textAlign: 'center', color: brand.colors.textMuted, marginTop: 24 },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
