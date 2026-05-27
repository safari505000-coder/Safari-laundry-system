import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  fetchCashIntelligenceDashboard,
  fetchManagerCashStatus,
  type CashIntelDashboardResponse,
  type ManagerCashStatusResponse,
} from '@/api/manager';
import { useAuth } from '@/auth/auth-context';
import { ManagerChrome } from '@/components/manager/manager-chrome';
import { MutedText, SectionHeader, StatTile, StatusPill, SurfaceCard } from '@/components/ui';
import { useManagerOversight } from '@/hooks/use-manager-oversight';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export default function ManagerSummaryScreen() {
  const { user, getValidAccessToken } = useAuth();
  const isBranchManager = user?.safariRole === 'MANAGER';
  const oversight = useManagerOversight();
  const [cashStatus, setCashStatus] = useState<ManagerCashStatusResponse | null>(
    null,
  );
  const [dashboardOnly, setDashboardOnly] =
    useState<CashIntelDashboardResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(isBranchManager);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      if (isBranchManager) {
        const status = await fetchManagerCashStatus(token);
        setCashStatus(status);
      } else {
        const dash = await fetchCashIntelligenceDashboard(token);
        setDashboardOnly(dash);
      }
    } catch {
      // Non-blocking — oversight tab still works.
    } finally {
      setStatusLoading(false);
      setRefreshing(false);
    }
  }, [getValidAccessToken, isBranchManager]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function onRefresh() {
    setRefreshing(true);
    oversight.refresh();
    await loadStatus();
  }

  const traffic = isBranchManager
    ? null
    : (dashboardOnly?.systemStatus ?? oversight.dashboard?.systemStatus);

  return (
    <ManagerChrome title="ملخص">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
      >
        <SectionHeader
          eyebrow="Executive Console"
          title="لوحة المدير"
          subtitle="مؤشرات التشغيل النقدي ومتابعة السائقين"
        />
        {statusLoading && !cashStatus && !dashboardOnly ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : isBranchManager && cashStatus ? (
          <BranchManagerSummary status={cashStatus} />
        ) : dashboardOnly || oversight.dashboard ? (
          <FleetSummary
            dashboard={dashboardOnly ?? oversight.dashboard!}
            atRiskCount={oversight.totals.atRisk}
            driverCount={oversight.totals.driverCount}
          />
        ) : null}

        <View style={styles.tileRow}>
          <StatTile
            label="سائقين"
            value={String(oversight.totals.driverCount)}
            tone="primary"
          />
          <StatTile
            label="فواتير اليوم"
            value={String(oversight.totals.ordersToday)}
            tone="neutral"
          />
          <StatTile
            label="بحاجة متابعة"
            value={String(oversight.totals.atRisk)}
            tone={oversight.totals.atRisk > 0 ? 'cancelled' : 'completed'}
          />
        </View>

        {traffic ? (
          <StatusPill
            label={
              traffic === 'GREEN'
                ? 'الوضع مستقر'
                : traffic === 'YELLOW'
                  ? 'انتباه'
                  : 'خطر'
            }
            tone={
              traffic === 'GREEN'
                ? 'completed'
                : traffic === 'YELLOW'
                  ? 'warning'
                  : 'cancelled'
            }
          />
        ) : null}

        {oversight.error ? (
          <Text style={styles.error}>{oversight.error}</Text>
        ) : null}
      </ScrollView>
    </ManagerChrome>
  );
}

function BranchManagerSummary({
  status,
}: {
  status: ManagerCashStatusResponse;
}) {
  return (
    <SurfaceCard>
      <Text style={styles.heroLabel}>إجمالي تحت إدارتك</Text>
      <Text style={styles.heroAmount}>
        {formatKwdLabel(status.pendingDepositKd)}
      </Text>
      <MutedText>كل المبالغ من السيرفر — بدون حساب محلي</MutedText>
      <View style={styles.grid}>
        <Metric label="POS خاص بك" value={formatKwdLabel(status.managerOwnPosKd)} />
        <Metric
          label="أكياس العهدة"
          value={formatKwdLabel(status.custodyBagsTotalKd)}
        />
        <Metric
          label="عند السائقين"
          value={formatKwdLabel(status.driversAwaitingHandoverKd)}
        />
        <Metric label="عدد الأكياس" value={String(status.bagsCount)} />
        <Metric
          label="سائقين معرّضين"
          value={String(status.driversAtRiskCount)}
          danger={status.driversAtRiskCount > 0}
        />
      </View>
    </SurfaceCard>
  );
}

function FleetSummary({
  dashboard,
  atRiskCount,
  driverCount,
}: {
  dashboard: CashIntelDashboardResponse;
  atRiskCount: number;
  driverCount: number;
}) {
  return (
    <SurfaceCard>
      <Text style={styles.heroLabel}>نقد على السائقين (SSoT)</Text>
      <Text style={styles.heroAmount}>
        {formatKwdLabel(dashboard.totalCash)}
      </Text>
      <MutedText>{dashboard.summaryText}</MutedText>
      <View style={styles.grid}>
        <Metric label="عدد السائقين" value={String(driverCount)} />
        <Metric label="بحاجة متابعة" value={String(atRiskCount)} danger={atRiskCount > 0} />
      </View>
    </SurfaceCard>
  );
}

function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, danger && styles.dangerText]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 12, paddingBottom: 24 },
  heroLabel: {
    fontSize: 14,
    color: brand.colors.textMuted,
    textAlign: 'right',
  },
  heroAmount: {
    fontSize: 28,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
  },
  grid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  metric: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: brand.colors.surfaceMuted,
    borderRadius: brand.radius.md,
    padding: 10,
    alignItems: 'flex-end',
    gap: 4,
  },
  metricLabel: { fontSize: 12, color: brand.colors.textMuted },
  metricValue: { fontSize: 15, fontWeight: '700', color: brand.colors.text },
  tileRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  dangerText: { color: brand.colors.danger },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
