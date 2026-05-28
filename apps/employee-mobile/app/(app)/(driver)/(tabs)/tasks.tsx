import { useRouter } from 'expo-router';
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
import { MutedText, PrimaryButton, SectionHeader, StatusPill, SurfaceCard } from '@/components/ui';
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
  const router = useRouter();
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
          <SurfaceCard>
            <Text style={styles.gpsBannerText}>
              الموقع إلزامي لمهام الميدان
            </Text>
            <PrimaryButton
              label="تفعيل الموقع"
              onPress={() => void gps.requestPermission()}
            />
          </SurfaceCard>
        ) : gps.lastUploadedAt ? (
          <MutedText>
            GPS — آخر رفع: {formatRelativeUpdate(gps.lastUploadedAt)}
          </MutedText>
        ) : null}

        <View style={styles.statusBar}>
          <View style={styles.statusMeta}>
            <SectionHeader
              eyebrow="Dispatch"
              title="متابعة المهام"
              subtitle="تحديث تلقائي كل 10 ثوانٍ"
            />
            {lastUpdatedIso ? (
              <MutedText>
                آخر تحديث: {formatRelativeUpdate(lastUpdatedIso)}
              </MutedText>
            ) : null}
          </View>
          {hasAssignedAlert ? (
            <StatusPill label="مهمة جديدة" tone="cancelled" />
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
          <SurfaceCard>
                <Text style={styles.emptyTitle}>لا توجد مهام حالياً</Text>
                <MutedText>
                  ستظهر هنا المهام المسندة لك من الكول سنتر تلقائياً.
                </MutedText>
          </SurfaceCard>
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
                onCreateOrder={(task) => {
                  router.push({
                    pathname: '/(app)/(driver)/pos',
                    params: { dispatchId: task.id },
                  });
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
  gpsBannerText: {
    textAlign: 'right',
    color: '#92400E',
    fontWeight: '800',
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
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
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
