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
import { MutedText, PrimaryButton } from '@/components/ui';
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
        <View style={styles.summary}>
          <Text style={styles.summaryText}>{rows.length} فاتورة مفتوحة</Text>
          <MutedText>المبالغ لكل فاتورة من السيرفر</MutedText>
        </View>

        {loading && rows.length === 0 ? (
          <ActivityIndicator color={brand.colors.darkBlue} size="large" />
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
                <View style={styles.card}>
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
                </View>
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
  summary: {
    backgroundColor: brand.colors.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: brand.colors.text,
  },
  list: { gap: 10, paddingBottom: 24 },
  card: {
    backgroundColor: brand.colors.white,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customer: {
    fontSize: 16,
    fontWeight: '700',
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
