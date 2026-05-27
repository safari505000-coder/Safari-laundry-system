import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchDriverCashCustody } from '@/api/orders';
import type { DriverCashCustodySummary } from '@/api/orders';
import { useAuth } from '@/auth/auth-context';
import {
  readHandoverFlag,
  writeHandoverFlag,
} from '@/auth/handover-flag';
import { DriverChrome } from '@/components/driver/driver-chrome';
import {
  MutedText,
  PrimaryButton,
  SectionHeader,
  StatTile,
  StatusPill as ErpStatusPill,
  Subtitle,
  SurfaceCard,
  Title,
} from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

type SettlementStatus = 'ready' | 'pending' | 'rejected';

export default function DriverDepositsScreen() {
  const { user, getValidAccessToken } = useAuth();
  const [summary, setSummary] = useState<DriverCashCustodySummary | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentAtIso, setSentAtIso] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const data = await fetchDriverCashCustody(token);
      setSummary(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getValidAccessToken]);

  useEffect(() => {
    void load();
    void readHandoverFlag(user?.id).then(setSentAtIso);
  }, [load, user?.id]);

  const cashTotalKd = summary?.cashTotalKd ?? '0.000';
  const cashOrderCount = summary?.cashOrderCount ?? 0;
  const grandTotalKd = summary?.grandTotalKd ?? '0.000';
  const hasPending = cashOrderCount > 0;

  useEffect(() => {
    if (summary && !hasPending && sentAtIso) {
      void writeHandoverFlag(user?.id, null);
      setSentAtIso(null);
    }
  }, [summary, hasPending, sentAtIso, user?.id]);

  const status: SettlementStatus = sentAtIso && hasPending ? 'pending' : 'ready';

  async function confirmNotifyManager() {
    const iso = new Date().toISOString();
    await writeHandoverFlag(user?.id, iso);
    setSentAtIso(iso);
    setModalOpen(false);
  }

  return (
    <DriverChrome title="عهدتي النقدية">
      <ScrollView
        contentContainerStyle={styles.wrap}
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
      >
        <SectionHeader
          eyebrow="Cash Handover"
          title="عهدتي النقدية"
          subtitle="رصيد النقد المطلوب تسليمه للمدير"
        />
        <View style={styles.alert}>
          <Text style={styles.alertText}>
            العهدة = نقد فقط. سلّم المبلغ للمدير — هو يؤكد الاستلام من
            نظامه.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            <StatTile
              label="نقد — PAID_TO_DRIVER"
              value={formatKwdLabel(cashTotalKd)}
              sub={`${cashOrderCount} فاتورة`}
              tone="warning"
            />

            <SurfaceCard>
              <View style={styles.grandRow}>
                <View style={styles.grandMeta}>
                  <Text style={styles.grandLabel}>الإجمالي المطلوب تسليمه</Text>
                  <Text style={styles.grandValue}>
                    {formatKwdLabel(grandTotalKd)}
                  </Text>
                </View>
                <StatusPill status={status} />
              </View>
            </SurfaceCard>

            <PrimaryButton
              label="أبلغ المدير — جاهز للتسليم"
              onPress={() => setModalOpen(true)}
              disabled={!hasPending || status === 'pending'}
            />
            <MutedText>
              إشعار للمدير محلي — يرى رصيدك الحي في لوحته. التسليم الفعلي
              يؤكده المدير.
            </MutedText>
          </>
        )}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <SurfaceCard>
            <Title>تأكيد التسليم</Title>
            <Subtitle>
              أنت على وشك إبلاغ المدير أن النقد جاهز للاستلام.
            </Subtitle>
            <View style={styles.modalLines}>
              <Text style={styles.modalLine}>
                نقد: {formatKwdLabel(cashTotalKd)} ({cashOrderCount} فاتورة)
              </Text>
              <Text style={styles.modalTotal}>
                الإجمالي: {formatKwdLabel(grandTotalKd)}
              </Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setModalOpen(false)} style={styles.cancel}>
                <Text style={styles.cancelText}>إلغاء</Text>
              </Pressable>
              <Pressable onPress={() => void confirmNotifyManager()} style={styles.ok}>
                <Text style={styles.okText}>تأكيد</Text>
              </Pressable>
            </View>
          </SurfaceCard>
        </View>
      </Modal>
    </DriverChrome>
  );
}

function StatusPill({ status }: { status: SettlementStatus }) {
  if (status === 'pending') {
    return (
      <ErpStatusPill label="تم الإرسال — بانتظار المدير" tone="warning" />
    );
  }
  return (
    <ErpStatusPill label="جاهز" tone="completed" />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, paddingBottom: 32 },
  alert: {
    backgroundColor: brand.colors.warningSoft,
    borderRadius: brand.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alertText: {
    color: '#92400E',
    textAlign: 'right',
    lineHeight: 20,
    fontSize: 13,
  },
  grandRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  grandMeta: { flex: 1, alignItems: 'flex-end', gap: 4 },
  grandLabel: { fontSize: 13, color: brand.colors.textMuted },
  grandValue: { fontSize: 20, fontWeight: '900', color: brand.colors.text },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
  },
  errorText: { color: '#991B1B', textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalLines: {
    backgroundColor: brand.colors.surfaceMuted,
    borderRadius: brand.radius.md,
    padding: 12,
    gap: 8,
  },
  modalLine: { textAlign: 'right', color: brand.colors.text, fontSize: 14 },
  modalTotal: {
    textAlign: 'right',
    fontWeight: '900',
    color: brand.colors.text,
    fontSize: 15,
  },
  modalActions: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    gap: 12,
    marginTop: 4,
  },
  cancel: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: brand.colors.textMuted, fontWeight: '600' },
  ok: {
    backgroundColor: brand.colors.primaryBlue,
    borderRadius: brand.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  okText: { color: brand.colors.white, fontWeight: '800' },
});
