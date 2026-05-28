import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchCatalog, type PublicServiceItem } from '@/api/public';
import {
  readFavoriteServiceIds,
  writeFavoriteServiceIds,
} from '@/auth/customer-session';
import { useOrderCart } from '@/cart/order-cart';
import {
  CinematicOrb,
  FadeIn,
  GlassPanel,
  LuxuryButton,
  LuxuryChip,
  LuxuryField,
  LuxuryScreen,
  LuxuryScroll,
} from '@/design/luxury-system';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { formatKwdLabel } from '@/lib/kwd';
import { luxury } from '@/design/luxury-tokens';

type ServiceSection = {
  title: string;
  data: PublicServiceItem[];
};

export default function ServicesScreen() {
  const { scrollBottomPad, stickyFooterBottom, sideInset } = useScreenLayout();
  const { lines, addService, totalItems: cartCount, estimateTotalKd } = useOrderCart();
  const [services, setServices] = useState<PublicServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const catalog = await fetchCatalog();
      setServices(catalog.services ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر عرض الخدمات الآن.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void readFavoriteServiceIds().then(setFavoriteIds);
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const service of services) {
      if (service.category?.trim()) {
        set.add(service.category.trim());
      }
    }
    return Array.from(set);
  }, [services]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return services.filter((service) => {
      if (favoritesOnly && !favoriteIds.includes(service.id)) {
        return false;
      }
      if (category && service.category !== category) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        service.nameAr.includes(q) ||
        (service.category?.includes(q) ?? false) ||
        service.nameEn?.toLowerCase().includes(q.toLowerCase()) ||
        service.code.toLowerCase().includes(q.toLowerCase())
      );
    });
  }, [services, query, category, favoritesOnly, favoriteIds]);

  const sections = useMemo((): ServiceSection[] => {
    const map = new Map<string, PublicServiceItem[]>();
    for (const item of filtered) {
      const key = item.category?.trim() || 'عناية إضافية';
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  const cartQtyById = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      map.set(line.serviceId, line.quantity);
    }
    return map;
  }, [lines]);

  function toggleFavorite(serviceId: string) {
    setFavoriteIds((current) => {
      const next = current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId];
      void writeFavoriteServiceIds(next);
      return next;
    });
  }

  function clearFilters() {
    setQuery('');
    setCategory(null);
    setFavoritesOnly(false);
  }

  const listHeader = (
    <View style={styles.headerBlock}>
      <FadeIn>
        <View style={styles.hero}>
          <Text style={styles.brand}>Safari Laundry Group</Text>
          <Text style={styles.heroTitle}>اختر خدمة العناية</Text>
          <Text style={styles.heroCopy}>
            قائمة واضحة للخدمات اليومية. اختر ما تحتاجه، وسنرتب الاستلام من الباب.
          </Text>
        </View>
      </FadeIn>

      {cartCount > 0 ? (
        <Pressable style={styles.cartBanner} onPress={() => router.push('/(tabs)/order')}>
          <Text style={styles.cartBannerText}>
            {cartCount} قطعة مختارة · جاهزة للتأكيد
          </Text>
        </Pressable>
      ) : null}

      <LuxuryField
        icon="search-outline"
        value={query}
        onChangeText={setQuery}
        placeholder="ابحث عن الخدمة المناسبة"
      />

      {categories.length > 0 ? (
        <View style={styles.chipsWrap}>
          <LuxuryChip
            label={`الكل (${services.length})`}
            active={!category && !favoritesOnly}
            onPress={() => {
              setCategory(null);
              setFavoritesOnly(false);
            }}
          />
          <LuxuryChip
            label={`المفضلة (${favoriteIds.length})`}
            active={favoritesOnly}
            onPress={() => setFavoritesOnly((value) => !value)}
          />
          {categories.map((cat) => (
            <LuxuryChip
              key={cat}
              label={cat}
              active={category === cat}
              onPress={() => {
                setFavoritesOnly(false);
                setCategory(category === cat ? null : cat);
              }}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.servicesIntro}>
        <Text style={styles.sectionTitle}>الخدمات</Text>
        <Text style={styles.servicesCount}>
          {loading
            ? 'نجهّز القائمة…'
            : filtered.length > 0
              ? `${filtered.length} خدمة متاحة`
              : services.length > 0
                ? 'لا توجد نتائج للفلتر الحالي'
                : 'لا توجد خدمات نشطة في قائمة الأسعار الآن'}
        </Text>
      </View>

      {!loading && services.length > 0 && filtered.length === 0 ? (
        <GlassPanel style={styles.filterResetPanel}>
          <Text style={styles.emptyText}>
            الفلتر أو البحث الحالي يخفي كل الخدمات ({services.length} في القائمة).
          </Text>
          <LuxuryButton label="إظهار كل الخدمات" variant="secondary" onPress={clearFilters} />
        </GlassPanel>
      ) : null}

      {loading && services.length === 0 ? (
        <GlassPanel><Text style={styles.emptyText}>نجهّز لك قائمة الخدمات…</Text></GlassPanel>
      ) : null}
      {error && services.length === 0 ? (
        <GlassPanel>
          <Text style={styles.errorTitle}>تعذر عرض الخدمات</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <LuxuryButton label="حاول مرة أخرى" variant="secondary" onPress={() => void load()} />
        </GlassPanel>
      ) : null}
    </View>
  );

  return (
    <LuxuryScreen>
      <CinematicOrb size={220} style={styles.orbTop} />
      <LuxuryScroll
        style={styles.flexList}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: scrollBottomPad + (cartCount > 0 ? 84 : 0) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        {listHeader}

        {sections.map((section) => (
          <View key={section.title} style={styles.sectionBlock}>
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionHeader}>{section.title}</Text>
              <Text style={styles.sectionHeaderCount}>{section.data.length} خدمة</Text>
            </View>
            {section.data.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <ServiceRow
                  item={item}
                  cartQty={cartQtyById.get(item.id) ?? 0}
                  favorite={favoriteIds.includes(item.id)}
                  onAdd={() => addService(item)}
                  onToggleFavorite={() => toggleFavorite(item.id)}
                />
              </View>
            ))}
          </View>
        ))}

        {!loading && services.length === 0 && !error ? (
          <GlassPanel style={styles.emptyPanel}>
            <Text style={styles.emptyText}>
              لا توجد أصناف نشطة في النظام. تأكد أن قائمة الأسعار مفعّلة في ERP ثم
              اسحب للأسفل للتحديث.
            </Text>
          </GlassPanel>
        ) : null}
      </LuxuryScroll>
      {cartCount > 0 ? (
        <View
          style={[
            styles.floatingCart,
            { bottom: stickyFooterBottom + 12, paddingHorizontal: sideInset },
          ]}
        >
          <Pressable
            style={styles.floatingCartButton}
            onPress={() => router.push('/(tabs)/order')}
          >
            <Text style={styles.floatingCartMeta}>
              {cartCount} قطعة · {estimateTotalKd('NORMAL')} د.ك
            </Text>
            <Text style={styles.floatingCartText}>مراجعة الطلب</Text>
          </Pressable>
        </View>
      ) : null}
    </LuxuryScreen>
  );
}

function ServiceRow({
  item,
  cartQty,
  favorite,
  onAdd,
  onToggleFavorite,
}: {
  item: PublicServiceItem;
  cartQty: number;
  favorite: boolean;
  onAdd: () => void;
  onToggleFavorite: () => void;
}) {
  const hasExpressPrice =
    item.priceExpressKd?.trim() !== item.priceNormalKd?.trim();

  return (
    <View style={styles.serviceCard}>
      <View style={styles.serviceCardInner}>
        <View style={styles.serviceIcon}>
          <Text style={styles.serviceIconText}>{item.nameAr.slice(0, 1)}</Text>
        </View>

        <View style={styles.serviceMeta}>
          <View style={styles.serviceNameRow}>
            <Pressable
              style={styles.favoriteButton}
              onPress={onToggleFavorite}
              hitSlop={8}
            >
              <Ionicons
                name={favorite ? 'star' : 'star-outline'}
                size={18}
                color={favorite ? luxury.color.champagne : luxury.color.silver}
              />
            </Pressable>
            <Text style={styles.serviceName} numberOfLines={2}>
              {item.nameAr}
            </Text>
          </View>
          <Text style={styles.servicePrice}>
            من {formatKwdLabel(item.priceNormalKd)}
          </Text>
          {hasExpressPrice ? (
            <Text style={styles.servicePriceAlt}>
              سريع {formatKwdLabel(item.priceExpressKd)}
            </Text>
          ) : null}
        </View>

        <Pressable
          style={[styles.addButton, cartQty > 0 && styles.addButtonActive]}
          onPress={onAdd}
          hitSlop={8}
        >
          {cartQty > 0 ? (
            <Text style={styles.addButtonText}>{cartQty}</Text>
          ) : (
            <Ionicons name="add" size={22} color={luxury.color.warmWhite} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flexList: { flex: 1 },
  orbTop: { top: -90, right: -100 },
  headerBlock: { gap: luxury.space.lg, paddingTop: 62, paddingHorizontal: luxury.space.lg },
  list: { paddingTop: 0, gap: luxury.space.md },
  sectionBlock: { gap: luxury.space.sm },
  separator: { height: luxury.space.sm },
  filterResetPanel: { gap: luxury.space.sm },
  hero: {
    minHeight: 120,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: luxury.space.sm,
  },
  brand: {
    color: luxury.color.champagne,
    fontSize: luxury.type.caption,
    fontWeight: '900',
    letterSpacing: 1.2,
    textAlign: 'right',
  },
  heroTitle: {
    color: luxury.color.graphite,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -1,
  },
  heroCopy: {
    color: luxury.color.slate,
    fontSize: luxury.type.body,
    lineHeight: luxury.lineHeight.body,
    textAlign: 'right',
  },
  servicesIntro: {
    alignItems: 'flex-end',
    gap: 2,
  },
  servicesCount: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    fontWeight: '700',
    textAlign: 'right',
  },
  sectionTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.section,
    fontWeight: '900',
    textAlign: 'right',
  },
  chipsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: luxury.space.sm,
  },
  serviceCard: {
    marginHorizontal: luxury.space.lg,
    backgroundColor: luxury.color.glassStrong,
    borderRadius: luxury.radius.lg,
    padding: luxury.space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: luxury.color.line,
  },
  serviceCardInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: luxury.space.md,
  },
  serviceNameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: luxury.space.xs,
    width: '100%',
  },
  favoriteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,17,21,0.045)',
    marginTop: 2,
  },
  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: luxury.color.ice100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  serviceIconText: {
    color: luxury.color.blue600,
    fontWeight: '900',
    fontSize: 18,
  },
  serviceMeta: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
    gap: 4,
  },
  serviceName: {
    flex: 1,
    color: luxury.color.graphite,
    fontSize: luxury.type.body,
    fontWeight: '800',
    textAlign: 'right',
  },
  servicePrice: {
    color: luxury.color.blue600,
    fontSize: luxury.type.callout,
    fontWeight: '800',
    textAlign: 'right',
    width: '100%',
  },
  servicePriceAlt: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    fontWeight: '700',
    textAlign: 'right',
    width: '100%',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: luxury.color.blue600,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addButtonActive: {
    backgroundColor: luxury.color.navy900,
  },
  addButtonText: {
    color: luxury.color.warmWhite,
    fontSize: 18,
    fontWeight: '900',
  },
  cartBanner: {
    backgroundColor: luxury.color.navy900,
    borderRadius: luxury.radius.pill,
    padding: luxury.space.md,
  },
  cartBannerText: {
    textAlign: 'right',
    fontWeight: '800',
    color: luxury.color.warmWhite,
  },
  sectionHeaderWrap: {
    marginHorizontal: luxury.space.lg,
    marginTop: luxury.space.md,
    marginBottom: luxury.space.xs,
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: luxury.space.sm,
  },
  sectionHeader: {
    color: luxury.color.graphite,
    fontSize: luxury.type.headline,
    fontWeight: '900',
    textAlign: 'right',
    flex: 1,
  },
  sectionHeaderCount: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    fontWeight: '700',
  },
  emptyPanel: {
    marginHorizontal: luxury.space.lg,
  },
  emptyText: {
    color: luxury.color.slate,
    fontSize: luxury.type.body,
    textAlign: 'right',
    lineHeight: luxury.lineHeight.body,
  },
  errorTitle: {
    color: luxury.color.danger,
    fontSize: luxury.type.headline,
    fontWeight: '900',
    textAlign: 'right',
  },
  floatingCart: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  floatingCartButton: {
    minHeight: 58,
    borderRadius: luxury.radius.pill,
    backgroundColor: luxury.color.navy900,
    paddingHorizontal: luxury.space.lg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: luxury.space.md,
    ...luxury.shadow.soft,
  },
  floatingCartText: {
    color: luxury.color.warmWhite,
    fontSize: luxury.type.body,
    fontWeight: '900',
  },
  floatingCartMeta: {
    color: 'rgba(251,250,247,0.68)',
    fontSize: luxury.type.caption,
    fontWeight: '800',
  },
});
