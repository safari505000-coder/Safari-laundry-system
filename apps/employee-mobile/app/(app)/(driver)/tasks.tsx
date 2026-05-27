import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TaskCard } from '@/components/driver/task-card';
import { DriverChrome } from '@/components/driver/driver-chrome';
import { MutedText, PrimaryButton } from '@/components/ui';
import { useDriverGpsContext } from '@/device/driver-gps-context';
import { useDriverTasks } from '@/hooks/use-driver-tasks';
import { brand } from '@/theme/brand';

function formatRelativeUpdate(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString('ar-KW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function DriverTasksScreen() {
  const {
    tasks,
    hasAssignedAlert,
    loading,
    refreshing,
    error,
    lastUpdatedIso,
    refresh,
    acknowledgeDispatch,
    acknowledgingId,
  } = useDriverTasks();
  const gps = useDriverGpsContext();
  const gpsBlocked = !gps.granted && !gps.checking;

  return (
    <DriverChrome title="مهامي">
      <View style={styles.wrap}>
        {gpsBlocked ? (
          <View style={styles.gpsBanner}>
            <Text style={styles.gpsBannerText}>
              الموقع إلزامي لمهام الميدان
            </Text>
            <PrimaryButton
              label="تفعيل الموقع"
              onPress={() => void gps.requestPermission()}
            />
          </View>
        ) : gps.lastUploadedAt ? (
          <MutedText>
            GPS — آخر رفع: {formatRelativeUpdate(gps.lastUploadedAt)}
          </MutedText>
        ) : null}

        <View style={styles.statusBar}>
          <View style={styles.statusMeta}>
            <Text style={styles.statusTitle}>Dispatch — تحديث كل 10 ثوانٍ</Text>
            {lastUpdatedIso ? (
              <MutedText>
                آخر تحديث: {formatRelativeUpdate(lastUpdatedIso)}
              </MutedText>
            ) : null}
          </View>
          {hasAssignedAlert ? (
            <View style={styles.alertPill}>
              <Text style={styles.alertText}>مهمة جديدة</Text>
            </View>
          ) : null}
        </View>

        {loading && tasks.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={brand.colors.primaryBlue} />
            <Text style={styles.centerText}>جاري تحميل المهام…</Text>
          </View>
        ) : error && tasks.length === 0 ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void refresh();
                }}
                tintColor={brand.colors.primaryBlue}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>لا توجد مهام حالياً</Text>
                <MutedText>
                  ستظهر هنا المهام المسندة لك من الكول سنتر تلقائياً.
                </MutedText>
              </View>
            }
            renderItem={({ item }) => (
              <TaskCard
                task={item}
                acknowledgingId={acknowledgingId}
                gpsBlocked={gpsBlocked}
                onRequestGps={() => void gps.requestPermission()}
                onAcknowledge={(id) => {
                  if (gpsBlocked) {
                    return;
                  }
                  void acknowledgeDispatch(id);
                }}
              />
            )}
          />
        )}

        {error && tasks.length > 0 ? (
          <View style={styles.inlineError}>
            <Text style={styles.inlineErrorText}>{error}</Text>
          </View>
        ) : null}
      </View>
    </DriverChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 12 },
  gpsBanner: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  gpsBannerText: {
    textAlign: 'right',
    color: '#92400E',
    fontWeight: '600',
    fontSize: 14,
  },
  statusBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusMeta: { flex: 1, alignItems: 'flex-end', gap: 2 },
  statusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: brand.colors.text,
    textAlign: 'right',
  },
  alertPill: {
    backgroundColor: brand.colors.danger,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  alertText: {
    color: brand.colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  list: {
    gap: 12,
    paddingBottom: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  centerText: {
    color: brand.colors.textMuted,
    fontSize: 14,
  },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    backgroundColor: brand.colors.white,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: brand.colors.text,
  },
  errorBox: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    padding: 20,
    justifyContent: 'center',
  },
  errorText: {
    color: '#991B1B',
    textAlign: 'center',
    fontSize: 15,
  },
  inlineError: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 10,
  },
  inlineErrorText: {
    color: '#991B1B',
    textAlign: 'right',
    fontSize: 13,
  },
});
