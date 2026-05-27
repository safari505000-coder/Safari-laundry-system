import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  approveReceiptFromDriver,
  fetchManagerCashStatus,
  listMyManagerCustody,
  type ManagerCashCustodyRow,
  type ManagerCashStatusDriverRow,
  type ManagerCashStatusResponse,
} from '@/api/manager';
import { useAuth } from '@/auth/auth-context';
import { ManagerChrome } from '@/components/manager/manager-chrome';
import { MutedText, PrimaryButton } from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

const STATUS_LABEL: Record<ManagerCashCustodyRow['status'], string> = {
  PENDING_DEPOSIT: 'بانتظار الإيداع',
  AWAITING_VERIFICATION: 'بانتظار التحقق',
  VERIFIED: 'مُحقّق',
  REJECTED: 'مرفوض',
};

export default function ManagerCustodyScreen() {
  const { user, getValidAccessToken } = useAuth();
  const isBranchManager = user?.safariRole === 'MANAGER';
  const [bags, setBags] = useState<ManagerCashCustodyRow[]>([]);
  const [cashStatus, setCashStatus] = useState<ManagerCashStatusResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const bagsPromise = listMyManagerCustody(token);
      const statusPromise = isBranchManager
        ? fetchManagerCashStatus(token).catch(() => null)
        : Promise.resolve(null);
      const [bagsRes, statusRes] = await Promise.all([bagsPromise, statusPromise]);
      setBags(bagsRes);
      setCashStatus(statusRes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getValidAccessToken, isBranchManager]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmApprove(driver: ManagerCashStatusDriverRow) {
    Alert.alert(
      'تأكيد الاستلام',
      `استلام نقد من ${driver.driverName} — ${formatKwdLabel(driver.heldCashKd)}`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تأكيد',
          onPress: () => void approve(driver.driverId),
        },
      ],
    );
  }

  async function approve(driverId: string) {
    setApprovingId(driverId);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      await approveReceiptFromDriver(token, { driverId });
      Alert.alert('تم', 'تم تسجيل استلام النقد وإنشاء كيس عهدة.');
      await load();
    } catch (err) {
      Alert.alert('فشل', err instanceof Error ? err.message : 'تعذر التأكيد');
    } finally {
      setApprovingId(null);
    }
  }

  const drivers = cashStatus?.drivers ?? [];
  const overdueCount = bags.filter((b) => b.isOverdue).length;

  return (
    <ManagerChrome title="العهدة النقدية">
      <View style={styles.wrap}>
        {isBranchManager && cashStatus ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>
              {cashStatus.bagsCount} كيس ·{' '}
              {formatKwdLabel(cashStatus.custodyBagsTotalKd)}
            </Text>
            <MutedText>
              عند السائقين:{' '}
              {formatKwdLabel(cashStatus.driversAwaitingHandoverKd)}
            </MutedText>
          </View>
        ) : (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>{bags.length} سجل عهدة</Text>
            {overdueCount > 0 ? (
              <Text style={styles.overdue}>{overdueCount} متأخر</Text>
            ) : null}
          </View>
        )}

        {loading && bags.length === 0 && !cashStatus ? (
          <ActivityIndicator color={brand.colors.success} size="large" />
        ) : error && bags.length === 0 ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <FlatList
            data={bags}
            keyExtractor={(item) => item.id}
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
            ListHeaderComponent={
              isBranchManager && drivers.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>استلام من السائقين</Text>
                  <MutedText>المبالغ من cash-status — تأكيد يُنشئ كيس عهدة</MutedText>
                  {drivers.map((driver) => (
                    <View key={driver.driverId} style={styles.driverRow}>
                      <View style={styles.driverMeta}>
                        <Text style={styles.driverName}>{driver.driverName}</Text>
                        <Text style={styles.driverCash}>
                          {formatKwdLabel(driver.heldCashKd)}
                        </Text>
                        <MutedText>
                          {driver.pendingOrderCount} فاتورة ·{' '}
                          {riskLabel(driver.riskLevel)}
                        </MutedText>
                      </View>
                      <PrimaryButton
                        label={
                          approvingId === driver.driverId
                            ? 'جاري…'
                            : 'تأكيد الاستلام'
                        }
                        onPress={() => void confirmApprove(driver)}
                        disabled={approvingId !== null}
                      />
                    </View>
                  ))}
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.bagCard}>
                <Text style={styles.bagDriver}>{item.driverName}</Text>
                <Text style={styles.bagAmount}>
                  {formatKwdLabel(item.amountKd)}
                </Text>
                <MutedText>
                  {STATUS_LABEL[item.status]} · {item.settledOrderCount} فاتورة
                </MutedText>
                {item.isOverdue ? (
                  <Text style={styles.overdue}>متأخر ({item.ageHours} س)</Text>
                ) : (
                  <MutedText>العمر: {item.ageHours} س</MutedText>
                )}
              </View>
            )}
            ListEmptyComponent={
              !loading ? (
                <View style={styles.empty}>
                  <MutedText>لا توجد أكياس عهدة حالياً.</MutedText>
                </View>
              ) : null
            }
          />
        )}
      </View>
    </ManagerChrome>
  );
}

function riskLabel(level: ManagerCashStatusDriverRow['riskLevel']): string {
  switch (level) {
    case 'CRITICAL':
      return 'خطر حرج';
    case 'WARNING':
      return 'تحذير';
    default:
      return 'طبيعي';
  }
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
  section: {
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    color: brand.colors.text,
  },
  driverRow: {
    backgroundColor: brand.colors.white,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  driverMeta: { alignItems: 'flex-end', gap: 4 },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: brand.colors.text,
  },
  driverCash: {
    fontSize: 18,
    fontWeight: '800',
    color: '#B45309',
  },
  list: { gap: 10, paddingBottom: 24 },
  bagCard: {
    backgroundColor: brand.colors.white,
    borderRadius: 14,
    padding: 12,
    gap: 6,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bagDriver: {
    fontSize: 15,
    fontWeight: '700',
    color: brand.colors.text,
  },
  bagAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: brand.colors.text,
  },
  overdue: {
    color: brand.colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  empty: { padding: 24, alignItems: 'center' },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
