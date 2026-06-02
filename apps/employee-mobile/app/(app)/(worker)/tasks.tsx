import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { RoleShell } from '@/components/role-shell';
import {
  MutedText,
  PrimaryButton,
  SectionHeader,
  StatusPill,
  SurfaceCard,
} from '@/components/ui';
import {
  acceptWorkerTask,
  completeWorkerTask,
  fetchWorkerTasks,
  ISSUE_OPTIONS,
  reportWorkerIssue,
  STAGE_LABELS_AR,
  startWorkerTask,
  type GarmentIssueType,
  type WorkerTask,
} from '@/api/worker';
import { brand } from '@/theme/brand';

export default function WorkerTasksScreen() {
  const { getValidAccessToken } = useAuth();
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issueFor, setIssueFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      setTasks(await fetchWorkerTasks(token));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر تحميل المهام');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getValidAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (garmentId: string, fn: (token: string) => Promise<unknown>) => {
      setBusyId(garmentId);
      try {
        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('انتهت الجلسة');
        }
        await fn(token);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'تعذّر تنفيذ العملية');
      } finally {
        setBusyId(null);
        setIssueFor(null);
      }
    },
    [getValidAccessToken, load],
  );

  return (
    <RoleShell title="مهام الإنتاج">
      <View style={styles.wrap}>
        <SectionHeader
          eyebrow="Production"
          title="مهامي"
          subtitle="القطع المسندة لك حسب المرحلة"
        />
        {loading && tasks.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={brand.colors.primaryBlue} />
          </View>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(t) => t.garmentId}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load();
                }}
                tintColor={brand.colors.primaryBlue}
              />
            }
            ListEmptyComponent={
              <SurfaceCard>
                <Text style={styles.emptyTitle}>لا توجد مهام حالياً</Text>
                <MutedText>ستظهر هنا القطع التي تنتظر مرحلتك.</MutedText>
              </SurfaceCard>
            }
            renderItem={({ item }) => (
              <SurfaceCard>
                <View style={styles.headerRow}>
                  <Text style={styles.stage}>{STAGE_LABELS_AR[item.stage]}</Text>
                  {item.isLate ? (
                    <StatusPill label="متأخرة" tone="cancelled" />
                  ) : (
                    <StatusPill
                      label={item.serviceType === 'EXPRESS' ? 'مستعجل' : 'عادي'}
                      tone={item.serviceType === 'EXPRESS' ? 'warning' : 'completed'}
                    />
                  )}
                </View>
                <Text style={styles.label}>
                  {item.label ?? `قطعة ${item.garmentId.slice(0, 8)}`}
                </Text>
                <MutedText>
                  طلب {item.orderId.slice(0, 8)} · {item.pieceCount} قطعة · الحالة:{' '}
                  {item.taskStatus}
                  {item.delayMinutes > 0 ? ` · تأخير ${item.delayMinutes}د` : ''}
                </MutedText>
                {item.internalNote ? (
                  <MutedText>ملاحظة: {item.internalNote}</MutedText>
                ) : null}

                <View style={styles.actions}>
                  {item.taskStatus === 'WAITING_NEXT_STAGE' ? (
                    <PrimaryButton
                      label="قبول المهمة"
                      onPress={() =>
                        void run(item.garmentId, (tk) =>
                          acceptWorkerTask(tk, item.garmentId),
                        )
                      }
                      disabled={busyId === item.garmentId}
                    />
                  ) : null}
                  {item.taskStatus === 'ACCEPTED_BY_WORKER' ? (
                    <PrimaryButton
                      label="بدء"
                      onPress={() =>
                        void run(item.garmentId, (tk) =>
                          startWorkerTask(tk, item.garmentId),
                        )
                      }
                      disabled={busyId === item.garmentId}
                    />
                  ) : null}
                  {item.taskStatus === 'IN_PROGRESS' ? (
                    <>
                      <PrimaryButton
                        label="إنهاء"
                        onPress={() =>
                          void run(item.garmentId, (tk) =>
                            completeWorkerTask(tk, item.garmentId),
                          )
                        }
                        disabled={busyId === item.garmentId}
                      />
                      <Text
                        style={styles.issueLink}
                        onPress={() =>
                          setIssueFor(
                            issueFor === item.garmentId ? null : item.garmentId,
                          )
                        }
                      >
                        الإبلاغ عن خلل
                      </Text>
                    </>
                  ) : null}
                </View>

                {issueFor === item.garmentId ? (
                  <View style={styles.issueGrid}>
                    {ISSUE_OPTIONS.map((opt) => (
                      <Text
                        key={opt.value}
                        style={styles.issueChip}
                        onPress={() =>
                          void run(item.garmentId, (tk) =>
                            reportWorkerIssue(tk, item.garmentId, {
                              issueType: opt.value as GarmentIssueType,
                            }),
                          )
                        }
                      >
                        {opt.label}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </SurfaceCard>
            )}
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </RoleShell>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 12 },
  list: { gap: 12, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stage: { fontSize: 16, fontWeight: '900', color: brand.colors.text, textAlign: 'right' },
  label: { fontSize: 15, fontWeight: '700', color: brand.colors.text, textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginTop: 10, alignItems: 'center' },
  issueLink: { color: brand.colors.danger, fontWeight: '700', fontSize: 13 },
  issueGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  issueChip: {
    backgroundColor: brand.colors.surfaceMuted,
    color: brand.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: brand.radius.md,
    fontSize: 13,
  },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: brand.colors.text, textAlign: 'right' },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
