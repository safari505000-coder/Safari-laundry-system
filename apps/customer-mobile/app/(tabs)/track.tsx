import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchCustomerOrderRequests,
  type CustomerWebsiteOrderRequest,
} from '@/api/public';
import {
  addRatedOrderId,
  readRatedOrderIds,
  readSavedPhone,
  writeSavedPhone,
} from '@/auth/customer-session';
import { OrderTimeline } from '@/components/order-timeline';
import {
  CinematicOrb,
  FadeIn,
  GlassPanel,
  LuxuryButton,
  LuxuryField,
  LuxuryScreen,
} from '@/design/luxury-system';
import { registerCustomerPushIfPossible } from '@/device/use-customer-push';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import {
  serviceTypeLabel,
  websiteOrderStatusLabel,
} from '@/lib/order-status';
import { luxury } from '@/design/luxury-tokens';
import { brand } from '@/theme/brand';

export default function TrackOrdersScreen() {
  const { scrollBottomPad } = useScreenLayout();
  const [phone, setPhone] = useState('');
  const [requests, setRequests] = useState<CustomerWebsiteOrderRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratedOrderIds, setRatedOrderIds] = useState<string[]>([]);

  const load = useCallback(async (rawPhone: string, mode?: 'refresh') => {
    const normalized = rawPhone.replace(/[\s-]/g, '').trim();
    if (normalized.length < 8) {
      setError('أدخل رقم الجوال المرتبط بطلبك.');
      return;
    }
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await fetchCustomerOrderRequests(normalized);
      setRequests(data.requests ?? []);
      await writeSavedPhone(normalized);
      void registerCustomerPushIfPossible(normalized);
    } catch (err) {
      setRequests([]);
      setError(err instanceof Error ? err.message : 'تعذر عرض طلباتك الآن.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void readRatedOrderIds().then(setRatedOrderIds);
    void readSavedPhone().then((saved) => {
      if (saved) {
        setPhone(saved);
        void load(saved);
      }
    });
  }, [load]);

  const listHeader = (
    <GlassPanel elevated style={styles.searchCard}>
      <Text style={styles.sectionEyebrow}>ORDER TRACKING</Text>
      <Text style={styles.sectionTitle}>متابعة هادئة لكل طلب</Text>
      <LuxuryField
        label="رقم الجوال"
        icon="call-outline"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="5xxxxxxx"
      />
      <LuxuryButton
        label={loading ? 'نحدّث الطلبات…' : 'عرض طلباتي'}
        onPress={() => void load(phone)}
        disabled={loading}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </GlassPanel>
  );

  return (
    <LuxuryScreen>
      <CinematicOrb size={240} style={styles.orbTop} />
      <CinematicOrb size={170} delay={420} style={styles.orbBottom} />
        {loading && requests.length === 0 ? (
          <View style={styles.loader}>
            {listHeader}
            <SkeletonStack />
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: scrollBottomPad },
            ]}
            ListHeaderComponent={listHeader}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load(phone, 'refresh')}
              />
            }
            ListEmptyComponent={
              !loading ? (
                <GlassPanel>
                  <Text style={styles.sectionTitle}>لا توجد طلبات بعد</Text>
                  <Text style={styles.emptyText}>بعد تأكيد أول طلب، ستظهر رحلة العناية هنا خطوة بخطوة.</Text>
                </GlassPanel>
              ) : null
            }
            renderItem={({ item }) => (
              <RequestCard
                request={item}
                rated={ratedOrderIds.includes(item.id)}
                onRate={async () => setRatedOrderIds(await addRatedOrderId(item.id))}
              />
            )}
          />
        )}
    </LuxuryScreen>
  );
}

function RequestCard({
  request,
  rated,
  onRate,
}: {
  request: CustomerWebsiteOrderRequest;
  rated: boolean;
  onRate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const noteLines = request.notes
    ?.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <GlassPanel style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.statusPill}>
          <Ionicons name="sparkles-outline" size={14} color={luxury.color.champagne} />
          <Text style={styles.status} numberOfLines={2}>
            {websiteOrderStatusLabel(request.status)}
          </Text>
        </View>
        <Text style={styles.ref} numberOfLines={1}>
          #{request.publicReference}
        </Text>
      </View>
      <Text style={styles.meta}>
        {serviceTypeLabel(request.serviceType)} ·{' '}
        {new Date(request.createdAtIso).toLocaleString('ar-KW')}
      </Text>
      {noteLines && noteLines.length > 0 ? (
        <View style={styles.noteBox}>
          {noteLines.map((line) => (
            <Text key={line} style={styles.noteLine} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      <OrderTimeline status={request.status} />
      {expanded ? (
        <View style={styles.detailsBox}>
          <DetailLine label="رقم المتابعة" value={request.publicReference} />
          <DetailLine label="نوع الخدمة" value={serviceTypeLabel(request.serviceType)} />
          <DetailLine
            label="تاريخ الطلب"
            value={new Date(request.createdAtIso).toLocaleString('ar-KW')}
          />
          <DetailLine label="الحالة" value={websiteOrderStatusLabel(request.status)} />
        </View>
      ) : null}
      <Pressable style={styles.expandButton} onPress={() => setExpanded((value) => !value)}>
        <Text style={styles.expandText}>
          {expanded ? 'إخفاء التفاصيل' : 'عرض تفاصيل الطلب'}
        </Text>
      </Pressable>
      {request.status === 'CONVERTED' && !rated ? (
        <View style={styles.ratingBox}>
          <Text style={styles.ratingTitle}>كيف كانت التجربة؟</Text>
          <View style={styles.ratingActions}>
            {['ممتازة', 'جيدة', 'تحتاج تحسين'].map((label) => (
              <Pressable key={label} style={styles.ratingButton} onPress={onRate}>
                <Text style={styles.ratingText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          style={styles.actionButton}
          onPress={() => void Linking.openURL(`tel:${brand.phone}`)}
        >
          <Text style={styles.actionText}>اتصال</Text>
        </Pressable>
        <Pressable
          style={styles.actionButtonDark}
          onPress={() => void Linking.openURL(`https://wa.me/965${brand.phone}`)}
        >
          <Text style={styles.actionTextDark}>واتساب سفاري</Text>
        </Pressable>
      </View>
    </GlassPanel>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
  );
}

function SkeletonStack() {
  return (
    <View style={styles.skeletonWrap}>
      <View style={styles.skeletonLineWide} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonCard} />
    </View>
  );
}

const styles = StyleSheet.create({
  orbTop: { top: -70, right: -80 },
  orbBottom: { bottom: 110, left: -70 },
  loader: { flex: 1, paddingTop: 72, gap: 16, paddingHorizontal: luxury.space.lg },
  searchCard: {
    marginTop: 72,
    marginBottom: 4,
    marginHorizontal: luxury.space.lg,
  },
  sectionEyebrow: {
    color: luxury.color.champagne,
    fontSize: luxury.type.micro,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'right',
  },
  sectionTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.section,
    fontWeight: '900',
    textAlign: 'right',
  },
  emptyText: {
    color: luxury.color.slate,
    fontSize: luxury.type.body,
    lineHeight: luxury.lineHeight.body,
    textAlign: 'right',
  },
  error: { color: luxury.color.danger, textAlign: 'right' },
  skeletonWrap: {
    gap: luxury.space.sm,
  },
  skeletonLineWide: {
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15,17,21,0.08)',
  },
  skeletonLine: {
    width: '65%',
    alignSelf: 'flex-end',
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(15,17,21,0.06)',
  },
  skeletonCard: {
    height: 96,
    borderRadius: luxury.radius.lg,
    backgroundColor: 'rgba(15,17,21,0.045)',
  },
  list: { paddingTop: 0 },
  separator: { height: luxury.space.md },
  card: {
    gap: luxury.space.sm,
    marginHorizontal: luxury.space.lg,
  },
  cardHead: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  ref: {
    flex: 1,
    fontSize: luxury.type.headline,
    fontWeight: '900',
    color: luxury.color.graphite,
    textAlign: 'right',
  },
  statusPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: luxury.color.navy900,
    borderRadius: luxury.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  status: {
    fontSize: 11,
    fontWeight: '900',
    color: luxury.color.warmWhite,
  },
  meta: {
    fontSize: luxury.type.caption,
    color: luxury.color.slate,
    textAlign: 'right',
  },
  noteBox: {
    alignItems: 'flex-end',
    gap: 6,
    backgroundColor: 'rgba(15,17,21,0.045)',
    padding: luxury.space.sm,
    borderRadius: luxury.radius.sm,
  },
  noteLine: {
    fontSize: luxury.type.caption,
    color: luxury.color.graphite,
    textAlign: 'right',
    fontWeight: '700',
  },
  detailsBox: {
    gap: luxury.space.xs,
    paddingTop: luxury.space.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: luxury.color.line,
  },
  detailLine: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: luxury.space.md,
  },
  detailLabel: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    fontWeight: '800',
  },
  detailValue: {
    flex: 1,
    color: luxury.color.graphite,
    fontSize: luxury.type.caption,
    fontWeight: '800',
    textAlign: 'right',
  },
  expandButton: {
    alignItems: 'flex-end',
    paddingVertical: luxury.space.xs,
  },
  expandText: {
    color: luxury.color.blue600,
    fontSize: luxury.type.caption,
    fontWeight: '900',
  },
  ratingBox: {
    gap: luxury.space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: luxury.color.line,
    paddingTop: luxury.space.sm,
  },
  ratingTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.caption,
    fontWeight: '900',
    textAlign: 'right',
  },
  ratingActions: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: luxury.space.xs,
  },
  ratingButton: {
    borderRadius: luxury.radius.pill,
    backgroundColor: luxury.color.ice100,
    paddingHorizontal: luxury.space.md,
    paddingVertical: luxury.space.xs,
  },
  ratingText: {
    color: luxury.color.blue600,
    fontWeight: '900',
    fontSize: luxury.type.caption,
  },
  actions: {
    flexDirection: 'row-reverse',
    gap: luxury.space.sm,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: luxury.radius.pill,
    backgroundColor: luxury.color.ice100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonDark: {
    flex: 1,
    minHeight: 44,
    borderRadius: luxury.radius.pill,
    backgroundColor: luxury.color.navy900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: luxury.color.blue600,
    fontWeight: '900',
  },
  actionTextDark: {
    color: luxury.color.warmWhite,
    fontWeight: '900',
  },
});
