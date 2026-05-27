import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  fetchCollectionUnpaidOnline,
  sendOrderPaymentLinkWhatsapp,
  type CollectionUnpaidOnlineRow,
} from '@/api/call-center';
import { useAuth } from '@/auth/auth-context';
import { CcChrome } from '@/components/call-center/cc-chrome';
import { MutedText, PrimaryButton, SectionHeader, SurfaceCard } from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export default function CallCenterCollectionsScreen() {
  const { getValidAccessToken } = useAuth();
  const [rows, setRows] = useState<CollectionUnpaidOnlineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const data = await fetchCollectionUnpaidOnline(token);
      setRows(data);
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
  }, [load]);

  async function sendWa(orderId: string) {
    setBusyId(orderId);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const res = await sendOrderPaymentLinkWhatsapp(token, orderId);
      Alert.alert(
        res.serverPush ? 'تم الإرسال' : 'تم',
        res.paymentUrl,
      );
    } catch (err) {
      Alert.alert('فشل', err instanceof Error ? err.message : 'تعذر الإرسال');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <CcChrome title="التحصيل">
      <View style={styles.wrap}>
        <SectionHeader
          eyebrow="Collections"
          title="تحصيل الموقع"
          subtitle="متابعة روابط الدفع المفتوحة"
        />
        <SurfaceCard>
          <Text style={styles.summaryText}>{rows.length} فاتورة مفتوحة</Text>
          <MutedText>المبالغ لكل فاتورة من السيرفر</MutedText>
        </SurfaceCard>

        {loading && rows.length === 0 ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : error && rows.length === 0 ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.orderId}
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
            renderItem={({ item }) => {
              const canSend =
                item.canSendCollectionPaymentWa ?? item.canRemindNow;
              return (
                <SurfaceCard>
                  <Pressable
                    onPress={() =>
                      router.push(
                        `/(app)/(call-center)/customer/${item.customerId}`,
                      )
                    }
                  >
                    <Text style={styles.customer}>{item.customerName}</Text>
                    <Text style={styles.meta}>
                      {item.readableId} · {formatKwdLabel(item.amountKd)}
                    </Text>
                    <MutedText>
                      {item.branchName ?? '—'} · {item.driverName ?? '—'}
                    </MutedText>
                  </Pressable>
                  <PrimaryButton
                    label={
                      busyId === item.orderId
                        ? 'جاري…'
                        : canSend
                          ? 'واتساب — رابط دفع'
                          : 'انتظر فترة التبريد'
                    }
                    onPress={() => void sendWa(item.orderId)}
                    disabled={!canSend || busyId !== null}
                  />
                </SurfaceCard>
              );
            }}
          />
        )}
      </View>
    </CcChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  summaryText: {
    fontSize: 18,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
  },
  list: { gap: 10, paddingBottom: 24 },
  customer: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    color: brand.colors.text,
  },
  meta: {
    textAlign: 'right',
    color: brand.colors.textMuted,
    fontSize: 14,
  },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
