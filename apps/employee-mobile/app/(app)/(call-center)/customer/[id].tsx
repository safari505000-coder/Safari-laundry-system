import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import {
  fetchCustomerDebtBreakdown,
  sendFullBalancePaymentLinkWhatsapp,
  sendOrderPaymentLinkWhatsapp,
} from '@/api/call-center';
import type { CustomerCollectionDebtBreakdown } from '@/api/call-center';
import { useAuth } from '@/auth/auth-context';
import { CcChrome } from '@/components/call-center/cc-chrome';
import {
  MutedText,
  PrimaryButton,
  SectionHeader,
  StatTile,
  SurfaceCard,
  Title,
} from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export default function CallCenterCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customerId = typeof id === 'string' ? id : '';
  const { getValidAccessToken } = useAuth();
  const [breakdown, setBreakdown] =
    useState<CustomerCollectionDebtBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!customerId) {
      return;
    }
    setLoading(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const data = await fetchCustomerDebtBreakdown(token, customerId);
      setBreakdown(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [customerId, getValidAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFullBalance() {
    if (!customerId) {
      return;
    }
    setBusy('full');
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const res = await sendFullBalancePaymentLinkWhatsapp(token, customerId);
      Alert.alert(
        res.serverPush ? 'تم الإرسال' : 'تم إنشاء الرابط',
        res.serverPush
          ? 'أُرسل رابط دفع الكامل عبر واتساب'
          : `الرابط: ${res.paymentUrl}`,
      );
    } catch (err) {
      Alert.alert(
        'فشل',
        err instanceof Error ? err.message : 'تعذر إرسال الرابط',
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleOrderLink(orderId: string) {
    setBusy(orderId);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const res = await sendOrderPaymentLinkWhatsapp(token, orderId);
      Alert.alert(
        res.serverPush ? 'تم الإرسال' : 'تم إنشاء الرابط',
        res.paymentUrl,
      );
    } catch (err) {
      Alert.alert(
        'فشل',
        err instanceof Error ? err.message : 'تعذر إرسال الرابط',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <CcChrome title="ملف العميل">
      <ScrollView contentContainerStyle={styles.wrap}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← رجوع</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : breakdown ? (
          <>
            <SectionHeader
              eyebrow="Customer Ledger"
              title={breakdown.customerName}
              subtitle="ملف التحصيل وروابط الدفع"
            />
            <SurfaceCard>
              <Title>{formatKwdLabel(breakdown.totalDebtKd)}</Title>
              <Pressable
                onPress={() =>
                  void Linking.openURL(`tel:${breakdown.customerPhone}`)
                }
              >
                <Text style={styles.phone}>{breakdown.customerPhone}</Text>
              </Pressable>
            </SurfaceCard>

            <PrimaryButton
              label={
                busy === 'full' ? 'جاري الإرسال…' : 'إرسال رابط دفع الكل — واتساب'
              }
              onPress={() => void handleFullBalance()}
              disabled={busy !== null || Number(breakdown.totalDebtKd) <= 0}
            />

            <StatTile
              label="فواتير مفتوحة"
              value={String(breakdown.lines.length)}
              tone={breakdown.lines.length > 0 ? 'warning' : 'completed'}
            />
            {breakdown.lines.map((line) => (
              <SurfaceCard key={line.orderId}>
                <Text style={styles.lineId}>{line.readableId}</Text>
                <Text style={styles.lineAmount}>
                  {formatKwdLabel(line.amountKd)}
                </Text>
                <MutedText>{line.reasonAr}</MutedText>
                <PrimaryButton
                  label={
                    busy === line.orderId ? '…' : 'رابط فاتورة — واتساب'
                  }
                  onPress={() => void handleOrderLink(line.orderId)}
                  disabled={busy !== null}
                />
              </SurfaceCard>
            ))}
          </>
        ) : null}
      </ScrollView>
    </CcChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingBottom: 32 },
  back: {
    color: brand.colors.primaryBlue,
    textAlign: 'right',
    fontWeight: '600',
    marginBottom: 4,
  },
  phone: {
    fontSize: 16,
    color: brand.colors.primaryBlue,
    textAlign: 'right',
  },
  lineId: {
    fontWeight: '900',
    textAlign: 'right',
    color: brand.colors.text,
  },
  lineAmount: {
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '900',
  },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
