import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
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
} from '@/design/luxury-system';
import { useScreenLayout } from '@/hooks/use-screen-layout';
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsWrap}
        >
          <LuxuryChip
            label={`الكل (${services.length})`}
            active={!category}
            onPress={() => setCategory(null)}
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
              onPress={() => setCategory(category === cat ? null : cat)}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.servicesIntro}>
        <Text style={styles.sectionTitle}>الخدمات</Text>
        <Text style={styles.servicesCount}>
          {filtered.length > 0 ? `${filtered.length} خدمة متاحة` : 'اختر الخدمة التي تحتاجها'}
        </Text>
      </View>

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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: scrollBottomPad + (cartCount > 0 ? 84 : 0) },
        ]}
        ListHeaderComponent={listHeader}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        SectionSeparatorComponent={() => <View style={styles.sectionGap} />}
        ListEmptyComponent={
          !loading ? (
            <GlassPanel style={styles.emptyPanel}>
              <Text style={styles.emptyText}>لم نجد خدمة بهذا الاسم. جرّب بحثاً آخر.</Text>
            </GlassPanel>
          ) : null
        }
        renderItem={({ item }) => (
          <ServiceRow
            item={item}
            cartQty={cartQtyById.get(item.id) ?? 0}
            favorite={favoriteIds.includes(item.id)}
            onAdd={() => addService(item)}
            onToggleFavorite={() => toggleFavorite(item.id)}
          />
        )}
      />
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
  return (
    <Pressable style={styles.serviceRow} onPress={onAdd}>
      <Pressable
        style={styles.favoriteButton}
        onPress={onToggleFavorite}
        hitSlop={8}
      >
        <Text style={[styles.favoriteText, favorite && styles.favoriteTextActive]}>
          {favorite ? '★' : '☆'}
        </Text>
      </Pressable>
      <View style={styles.serviceIcon}>
        <Text style={styles.serviceIconText}>{item.nameAr.slice(0, 1)}</Text>
      </View>
      <View style={styles.serviceMeta}>
        <Text style={styles.serviceName} numberOfLines={2}>
          {item.nameAr}
        </Text>
        <Text style={styles.serviceCategory} numberOfLines={1}>
          {item.category ?? item.code} · من {item.priceNormalKd} د.ك
        </Text>
      </View>
      <View style={[styles.addButton, cartQty > 0 && styles.addButtonActive]}>
        <Text style={styles.addButtonText}>{cartQty > 0 ? cartQty : '+'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  orbTop: { top: -90, right: -100 },
  headerBlock: { gap: luxury.space.lg, paddingTop: 62, paddingHorizontal: luxury.space.lg },
  list: { paddingTop: 0 },
  separator: { height: luxury.space.sm },
  sectionGap: { height: luxury.space.md },
  hero: {
    minHeight: 150,
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
    gap: luxury.space.sm,
    paddingLeft: luxury.space.lg,
  },
  serviceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: luxury.space.md,
    backgroundColor: luxury.color.glassStrong,
    borderRadius: luxury.radius.lg,
    padding: luxury.space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: luxury.color.line,
    marginHorizontal: luxury.space.lg,
  },
  favoriteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,17,21,0.045)',
  },
  favoriteText: {
    color: luxury.color.silver,
    fontSize: 18,
    fontWeight: '900',
  },
  favoriteTextActive: {
    color: luxury.color.champagne,
  },
  serviceIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: luxury.color.ice100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceIconText: {
    color: luxury.color.blue600,
    fontWeight: '900',
    fontSize: 20,
  },
  serviceMeta: { flex: 1, alignItems: 'flex-end', minWidth: 0, gap: 4 },
  serviceName: {
    color: luxury.color.graphite,
    fontSize: luxury.type.body,
    fontWeight: '800',
    textAlign: 'right',
    width: '100%',
  },
  serviceCategory: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    textAlign: 'right',
    width: '100%',
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: luxury.color.blue600,
    alignItems: 'center',
    justifyContent: 'center',
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
  sectionHeader: {
    marginHorizontal: luxury.space.lg,
    marginTop: luxury.space.sm,
    marginBottom: luxury.space.xs,
    color: luxury.color.graphite,
    fontSize: luxury.type.headline,
    fontWeight: '900',
    textAlign: 'right',
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
