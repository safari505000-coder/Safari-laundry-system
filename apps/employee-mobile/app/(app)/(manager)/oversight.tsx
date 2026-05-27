import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ManagerChrome } from '@/components/manager/manager-chrome';
import { OversightCard } from '@/components/manager/oversight-card';
import { MutedText } from '@/components/ui';
import { useManagerOversight } from '@/hooks/use-manager-oversight';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export default function ManagerOversightScreen() {
  const {
    rows,
    dashboard,
    cashByDriverId,
    totals,
    loading,
    refreshing,
    error,
    refresh,
  } = useManagerOversight();

  return (
    <ManagerChrome title="مراقبة السائقين">
      <View style={styles.wrap}>
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {totals.driverCount} سائق · {totals.atRisk} بحاجة متابعة
          </Text>
          <MutedText>
            نقد حي: {formatKwdLabel(dashboard?.totalCash ?? '0.0000')}
          </MutedText>
          <MutedText>المبالغ من cash-intelligence/dashboard</MutedText>
        </View>

        {loading && rows.length === 0 ? (
          <ActivityIndicator color={brand.colors.success} size="large" />
        ) : error && rows.length === 0 ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <MutedText>لا يوجد سائقون نشطون في نطاقك.</MutedText>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.driverId}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
            renderItem={({ item }) => (
              <OversightCard
                row={item}
                ssotCashKd={cashByDriverId.get(item.driverId) ?? '0.0000'}
              />
            )}
          />
        )}
      </View>
    </ManagerChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  summary: {
    backgroundColor: brand.colors.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: brand.colors.text,
  },
  list: { gap: 10, paddingBottom: 24 },
  empty: {
    backgroundColor: brand.colors.white,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
