import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CcChrome } from '@/components/call-center/cc-chrome';
import { MutedText } from '@/components/ui';
import { useCcCustomerSearch } from '@/hooks/use-cc-customer-search';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export default function CallCenterSearchScreen() {
  const [query, setQuery] = useState('');
  const { hits, loading, error, queryTooShort } = useCcCustomerSearch(query);

  return (
    <CcChrome title="بحث عميل">
      <View style={styles.wrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="اسم أو جوال (حرفين على الأقل)…"
          placeholderTextColor={brand.colors.textMuted}
          style={styles.search}
          textAlign="right"
          autoCorrect={false}
        />
        <MutedText>ابحث بالاسم أو رقم الجوال</MutedText>

        {loading ? (
          <ActivityIndicator color={brand.colors.darkBlue} size="large" />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : queryTooShort ? (
          <Text style={styles.hint}>اكتب حرفين على الأقل للبحث</Text>
        ) : (
          <FlatList
            data={hits}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.hint}>لا نتائج — جرّب رقم جوال</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.card}
                onPress={() =>
                  router.push(`/(app)/(call-center)/customer/${item.id}`)
                }
              >
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.phone}>{item.phone}</Text>
                <Text style={styles.debt}>
                  مديونية: {formatKwdLabel(item.totalDebtKd)}
                </Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </CcChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  search: {
    backgroundColor: brand.colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D8D8E6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: brand.colors.text,
  },
  list: { gap: 10, paddingBottom: 24 },
  card: {
    backgroundColor: brand.colors.white,
    borderRadius: 14,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: brand.colors.text,
    textAlign: 'right',
  },
  phone: {
    fontSize: 14,
    color: brand.colors.primaryBlue,
    textAlign: 'right',
  },
  debt: {
    fontSize: 13,
    color: brand.colors.textMuted,
    textAlign: 'right',
  },
  hint: {
    textAlign: 'center',
    color: brand.colors.textMuted,
    marginTop: 24,
  },
  error: {
    color: brand.colors.danger,
    textAlign: 'right',
  },
});
