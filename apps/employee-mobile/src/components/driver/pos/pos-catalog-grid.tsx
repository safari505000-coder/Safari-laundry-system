import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  LaundryCategoryRow,
  LaundryPriceListItemRow,
} from '@/api/pos-types';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export function PosCatalogGrid({
  items,
  categories,
  categoryId,
  onCategoryChange,
  onItemPress,
}: {
  items: LaundryPriceListItemRow[];
  categories: LaundryCategoryRow[];
  categoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  onItemPress: (item: LaundryPriceListItemRow) => void;
}) {
  const filtered =
    categoryId == null
      ? items
      : items.filter((item) => item.categoryId === categoryId);

  return (
    <View style={styles.wrap}>
      <FlatList
        horizontal
        inverted
        data={[{ id: '__all__', nameAr: 'الكل' }, ...categories]}
        keyExtractor={(row) => row.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => {
          const active =
            item.id === '__all__'
              ? categoryId == null
              : categoryId === item.id;
          return (
            <Pressable
              onPress={() =>
                onCategoryChange(item.id === '__all__' ? null : item.id)
              }
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {item.nameAr}
              </Text>
            </Pressable>
          );
        }}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <Pressable style={styles.tile} onPress={() => onItemPress(item)}>
            <Text style={styles.tileName} numberOfLines={2}>
              {item.nameAr}
            </Text>
            <Text style={styles.tilePrice}>
              {formatKwdLabel(item.priceNormal)}
            </Text>
            {item.manualEntry ? (
              <Text style={styles.manualTag}>سعر يدوي</Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 8 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: brand.colors.border,
    backgroundColor: brand.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: brand.colors.primaryBlue,
    borderColor: brand.colors.primaryBlue,
  },
  chipText: { fontSize: 12, fontWeight: '800', color: brand.colors.text },
  chipTextActive: { color: brand.colors.white },
  grid: { gap: 8, paddingBottom: 120 },
  gridRow: { gap: 8 },
  tile: {
    flex: 1,
    minHeight: 88,
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.lg,
    padding: 10,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: brand.colors.border,
  },
  tileName: {
    fontSize: 13,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
  },
  tilePrice: {
    fontSize: 12,
    color: brand.colors.primaryBlue,
    fontWeight: '800',
  },
  manualTag: {
    fontSize: 10,
    color: brand.colors.textMuted,
  },
});
