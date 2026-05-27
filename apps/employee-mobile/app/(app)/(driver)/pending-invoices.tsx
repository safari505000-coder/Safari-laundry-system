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
import { MutedText, SectionHeader, SurfaceCard } from '@/components/ui';
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
        <SectionHeader
          eyebrow="Driver Ledger"
          title="كشف المتابعة"
          subtitle="الفواتير المعلقة من السيرفر"
        />
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

        <SurfaceCard>
          <Text style={styles.summaryLabel}>إجمالي المتابعة</Text>
          <Text style={styles.summaryValue}>
            {formatKwdLabel(totalAmountKd)}
          </Text>
          <MutedText>
            {filteredCount} / {totalCount} فاتورة
          </MutedText>
        </SurfaceCard>

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
          <SurfaceCard>
                <Text style={styles.emptyText}>
                  {search.trim() ? 'لا نتائج للبحث' : 'لا فواتير معلّقة'}
                </Text>
          </SurfaceCard>
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
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.md,
    borderWidth: 1,
    borderColor: brand.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: brand.colors.text,
  },
  summaryLabel: {
    fontSize: 13,
    color: brand.colors.textMuted,
    textAlign: 'right',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
  },
  list: { gap: 10, paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: brand.colors.textMuted, textAlign: 'center' },
  errorBox: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'center',
  },
  errorText: { color: '#991B1B', textAlign: 'center' },
});
