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
import { MutedText, SectionHeader, SurfaceCard } from '@/components/ui';
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
        <SectionHeader
          eyebrow="Fleet Oversight"
          title="مراقبة السائقين"
          subtitle="متابعة النقد الحي ومخاطر التسليم"
        />
        <SurfaceCard>
          <Text style={styles.summaryTitle}>
            {totals.driverCount} سائق · {totals.atRisk} بحاجة متابعة
          </Text>
          <MutedText>
            نقد حي: {formatKwdLabel(dashboard?.totalCash ?? '0.0000')}
          </MutedText>
          <MutedText>المبالغ من cash-intelligence/dashboard</MutedText>
        </SurfaceCard>

        {loading && rows.length === 0 ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : error && rows.length === 0 ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <SurfaceCard>
            <MutedText>لا يوجد سائقون نشطون في نطاقك.</MutedText>
          </SurfaceCard>
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
  summaryTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
  },
  list: { gap: 10, paddingBottom: 24 },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
