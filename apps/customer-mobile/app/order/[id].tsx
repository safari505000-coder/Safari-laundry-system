import { useLocalSearchParams, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchOrderDelivery, type OrderDeliveryTracking } from '@/api/public';
import { readCustomerAccessToken } from '@/auth/customer-session';
import { InvoiceDeliveryTimeline } from '@/components/invoice-delivery-timeline';
import {
  CinematicOrb,
  GlassPanel,
  LuxuryScreen,
  LuxuryScroll,
} from '@/design/luxury-system';
import { deliveryStatusLabelAr, type DeliveryStatus } from '@/lib/delivery-status';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { luxury } from '@/design/luxury-tokens';
import { brand } from '@/theme/brand';

export default function OrderDeliveryTrackScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const orderId = useMemo(() => {
    const raw = Array.isArray(params.id) ? params.id[0] : params.id;
    return raw?.trim() ?? '';
  }, [params.id]);

  const { scrollBottomPad } = useScreenLayout();
  const [tracking, setTracking] = useState<OrderDeliveryTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) {
      setError('معرّف الفاتورة غير صالح');
      setLoading(false);
      return;
    }
    try {
      const token = await readCustomerAccessToken();
      if (!token) {
        setError('سجّل الدخول من حسابي لتتبع الفاتورة');
        setLoading(false);
        return;
      }
      const row = await fetchOrderDelivery(orderId);
      setTracking(row);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل التتبع');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <LuxuryScreen>
      <CinematicOrb style={styles.orbTop} />
      <LuxuryScroll contentContainerStyle={{ paddingBottom: scrollBottomPad }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>رجوع</Text>
          </Pressable>
          <Text style={styles.title}>تتبع الفاتورة</Text>
          <Text style={styles.subtitle}>
            {tracking?.invoiceLabel ?? orderId.slice(0, 8).toUpperCase()}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={brand.colors.primaryBlue} size="large" />
        ) : error ? (
          <GlassPanel>
            <Text style={styles.error}>{error}</Text>
          </GlassPanel>
        ) : tracking ? (
          <GlassPanel>
            <Text style={styles.statusLabel}>حالة التوصيل</Text>
            <Text style={styles.statusValue}>
              {deliveryStatusLabelAr(tracking.deliveryStatus)}
            </Text>
            <InvoiceDeliveryTimeline
              status={tracking.deliveryStatus as DeliveryStatus}
              events={tracking.timeline}
            />
          </GlassPanel>
        ) : null}
      </LuxuryScroll>
    </LuxuryScreen>
  );
}

const styles = StyleSheet.create({
  orbTop: { top: -80, right: -90 },
  header: {
    alignItems: 'flex-end',
    gap: luxury.space.xs,
    marginBottom: luxury.space.lg,
  },
  backBtn: { alignSelf: 'flex-start' },
  backText: {
    color: brand.colors.primaryBlue,
    fontWeight: '700',
    fontSize: 14,
  },
  title: {
    color: luxury.color.graphite,
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'right',
  },
  subtitle: {
    color: luxury.color.slate,
    fontSize: 14,
    fontWeight: '600',
  },
  statusLabel: {
    color: luxury.color.slate,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  statusValue: {
    color: brand.colors.primaryBlue,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: luxury.space.md,
  },
  error: {
    color: brand.colors.danger,
    textAlign: 'right',
    fontWeight: '600',
  },
});
