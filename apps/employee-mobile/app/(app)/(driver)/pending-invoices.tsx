import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fetchDriverPendingInvoices } from '@/api/orders';
import type { DriverPendingInvoiceRow } from '@/api/orders';
import { useAuth } from '@/auth/auth-context';
import { DriverChrome } from '@/components/driver/driver-chrome';
import { PendingInvoiceCard } from '@/components/driver/pending-invoice-card';
import { MutedText } from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export default function DriverPendingInvoicesScreen() {
  const { getValidAccessToken } = useAuth();
  const [rows, setRows] = useState<DriverPendingInvoiceRow[]>([]);
  const [totalAmountKd, setTotalAmountKd] = useState('0.000');
  const [filteredCount, setFilteredCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      try {
        if (mode === 'initial') {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('انتهت الجلسة');
        }
        const data = await fetchDriverPendingInvoices(token, search);
        setRows(data.rows);
        setTotalAmountKd(data.totalAmountKd);
        setFilteredCount(data.filteredCount);
        setTotalCount(data.totalCount);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'فشل التحميل');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getValidAccessToken, search],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  return (
    <DriverChrome title="كشف المتابعة">
      <View style={styles.wrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => void load('refresh')}
          placeholder="بحث بالاسم أو الهاتف…"
          placeholderTextColor={brand.colors.textMuted}
          style={styles.search}
          textAlign="right"
          returnKeyType="search"
        />

        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>إجمالي المتابعة</Text>
          <Text style={styles.summaryValue}>
            {formatKwdLabel(totalAmountKd)}
          </Text>
          <MutedText>
            {filteredCount} / {totalCount} فاتورة
          </MutedText>
        </View>

        <MutedText>
          للقراءة فقط — التحصيل والروابط من الكول سنتر أو POS.
        </MutedText>

        {loading && rows.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
          </View>
        ) : error && rows.length === 0 ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.orderId}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load('refresh')}
                tintColor={brand.colors.primaryBlue}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {search.trim() ? 'لا نتائج للبحث' : 'لا فواتير معلّقة'}
                </Text>
              </View>
            }
            renderItem={({ item }) => <PendingInvoiceCard row={item} />}
          />
        )}
      </View>
    </DriverChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  search: {
    backgroundColor: brand.colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8D8E6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: brand.colors.text,
  },
  summary: {
    backgroundColor: brand.colors.white,
    borderRadius: 14,
    padding: 14,
    alignItems: 'flex-end',
    gap: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: brand.colors.textMuted,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: brand.colors.text,
  },
  list: { gap: 10, paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: {
    padding: 24,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    backgroundColor: brand.colors.white,
  },
  emptyText: { color: brand.colors.textMuted },
  errorBox: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'center',
  },
  errorText: { color: '#991B1B', textAlign: 'center' },
});
