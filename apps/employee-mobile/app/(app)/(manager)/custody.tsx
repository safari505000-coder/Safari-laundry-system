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
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  approveReceiptFromDriver,
  fetchManagerCashStatus,
  listMyManagerCustody,
  uploadDepositSlipImage,
  attachDepositSlip,
  type ManagerCashCustodyRow,
  type ManagerCashStatusDriverRow,
  type ManagerCashStatusResponse,
} from '@/api/manager';
import { useAuth } from '@/auth/auth-context';
import { ManagerChrome } from '@/components/manager/manager-chrome';
import { GhostButton, MutedText, PrimaryButton, SectionHeader, SurfaceCard } from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import {
  RECEIPT_COMPRESS_LEVELS,
  RECEIPT_RESIZE_WIDTH,
  receiptFitsPayloadLimit,
} from '@/lib/receipt-image';
import { brand } from '@/theme/brand';

async function compressReceiptImage(uri: string): Promise<string> {
  let lastDataUrl: string | null = null;
  for (const compress of RECEIPT_COMPRESS_LEVELS) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: RECEIPT_RESIZE_WIDTH } }],
      {
        compress,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!result.base64) {
      continue;
    }
    const dataUrl = `data:image/jpeg;base64,${result.base64}`;
    lastDataUrl = dataUrl;
    if (receiptFitsPayloadLimit(dataUrl)) {
      return dataUrl;
    }
  }
  throw new Error(
    lastDataUrl
      ? 'الصورة كبيرة جداً. قرّب على الوصل فقط أو قص الأطراف ثم أعد المحاولة.'
      : 'تعذر ضغط صورة الوصل.',
  );
}

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
  const [uploadingBagId, setUploadingBagId] = useState<string | null>(null);

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

  const handleUploadSlip = useCallback(
    async (bag: ManagerCashCustodyRow) => {
      setUploadingBagId(bag.id);
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('الصلاحية مطلوبة', 'اسمح للتطبيق باستخدام الكاميرا لتصوير إيصال الإيداع.');
          return;
        }
        const picked = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [16, 9],
          quality: 1,
        });
        if (picked.canceled || !picked.assets[0]?.uri) {
          return;
        }

        const compressed = await compressReceiptImage(picked.assets[0].uri);

        const token = await getValidAccessToken();
        if (!token) {
          throw new Error('انتهت الجلسة');
        }

        // Step 1: Upload the slip image
        const { depositSlipUrl } = await uploadDepositSlipImage(token, compressed);

        // Step 2: Attach it to the custody bag
        await attachDepositSlip(token, bag.id, {
          depositSlipUrl,
          declaredDepositTotal: Number(bag.amountKd),
        });

        Alert.alert('تم', 'تم رفع إيصال الإيداع بنجاح وتحويل الحقيبة للمحاسب للتدقيق.');
        await load();
      } catch (err) {
        Alert.alert('فشل الرفع', err instanceof Error ? err.message : 'تعذر رفع الإيصال');
      } finally {
        setUploadingBagId(null);
      }
    },
    [getValidAccessToken, load],
  );

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
        <SectionHeader
          eyebrow="Cash Custody"
          title="العهدة النقدية"
          subtitle="استلام النقد ومتابعة أكياس العهدة"
        />
        {isBranchManager && cashStatus ? (
          <SurfaceCard>
            <Text style={styles.summaryTitle}>
              {cashStatus.bagsCount} كيس ·{' '}
              {formatKwdLabel(cashStatus.custodyBagsTotalKd)}
            </Text>
            <MutedText>
              عند السائقين:{' '}
              {formatKwdLabel(cashStatus.driversAwaitingHandoverKd)}
            </MutedText>
          </SurfaceCard>
        ) : (
          <SurfaceCard>
            <Text style={styles.summaryTitle}>{bags.length} سجل عهدة</Text>
            {overdueCount > 0 ? (
              <Text style={styles.overdue}>{overdueCount} متأخر</Text>
            ) : null}
          </SurfaceCard>
        )}

        {loading && bags.length === 0 && !cashStatus ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
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
                {item.status === 'PENDING_DEPOSIT' || item.status === 'REJECTED' ? (
                  <View style={styles.bagAction}>
                    <GhostButton
                      label={
                        uploadingBagId === item.id
                          ? 'جاري الرفع والربط…'
                          : 'رفع إيصال الإيداع'
                      }
                      onPress={() => void handleUploadSlip(item)}
                      disabled={uploadingBagId !== null}
                    />
                  </View>
                ) : null}
              </View>
            )}
            ListEmptyComponent={
              !loading ? (
                <SurfaceCard>
                  <MutedText>لا توجد أكياس عهدة حالياً.</MutedText>
                </SurfaceCard>
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
  summaryTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
  },
  section: {
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
    color: brand.colors.text,
  },
  driverRow: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.lg,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  driverMeta: { alignItems: 'flex-end', gap: 4 },
  driverName: {
    fontSize: 16,
    fontWeight: '900',
    color: brand.colors.text,
  },
  driverCash: {
    fontSize: 18,
    fontWeight: '800',
    color: '#B45309',
  },
  list: { gap: 10, paddingBottom: 24 },
  bagCard: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.lg,
    padding: 12,
    gap: 6,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: brand.colors.border,
  },
  bagDriver: {
    fontSize: 15,
    fontWeight: '900',
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
  bagAction: {
    width: '100%',
    marginTop: 6,
  },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
