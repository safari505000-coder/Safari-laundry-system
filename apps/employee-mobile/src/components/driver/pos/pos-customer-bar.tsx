import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createPosCustomer,
  fetchCustomerBilling,
  searchPosCustomers,
  type CustomerBillingProfile,
  type PosCustomerRow,
} from '@/api/pos';
import { useAuth } from '@/auth/auth-context';
import { MutedText, SurfaceCard } from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export function PosCustomerBar({
  selected,
  onSelect,
  onBillingChange,
}: {
  selected: PosCustomerRow | null;
  onSelect: (customer: PosCustomerRow | null) => void;
  onBillingChange?: (profile: CustomerBillingProfile | null) => void;
}) {
  const { getValidAccessToken } = useAuth();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PosCustomerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [billing, setBilling] = useState<CustomerBillingProfile | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!selected) {
      setBilling(null);
      onBillingChange?.(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await getValidAccessToken();
        if (!token || cancelled) {
          return;
        }
        const profile = await fetchCustomerBilling(token, selected.id);
        if (!cancelled) {
          setBilling(profile);
          onBillingChange?.(profile);
        }
      } catch {
        if (!cancelled) {
          setBilling(null);
          onBillingChange?.(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getValidAccessToken, onBillingChange, selected]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const token = await getValidAccessToken();
          if (!token) {
            return;
          }
          const rows = await searchPosCustomers(token, q);
          setHits(rows);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [getValidAccessToken, query]);

  const createCustomer = useCallback(async () => {
    setCreating(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      const phone = newPhone.replace(/[\s-]/g, '').trim();
      const customer = await createPosCustomer(token, {
        phone,
        displayName: newName.trim(),
      });
      onSelect(customer);
      setShowNew(false);
      setQuery('');
      setHits([]);
    } finally {
      setCreating(false);
    }
  }, [getValidAccessToken, newName, newPhone, onSelect]);

  if (selected) {
    return (
      <SurfaceCard>
        <View style={styles.selectedBox}>
          <View style={styles.selectedMeta}>
            <Text style={styles.selectedName}>
              {selected.displayName?.trim() || selected.phone}
            </Text>
            <Text style={styles.selectedPhone}>{selected.phone}</Text>
            {billing ? (
              <MutedText>
                رصيد: {formatKwdLabel(billing.remainingBalance)} · دين:{' '}
                {formatKwdLabel(billing.debt)}
              </MutedText>
            ) : null}
          </View>
          <Pressable onPress={() => onSelect(null)}>
            <Text style={styles.change}>تغيير</Text>
          </Pressable>
        </View>
      </SurfaceCard>
    );
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="بحث عميل — جوال أو اسم"
        placeholderTextColor={brand.colors.textMuted}
        textAlign="right"
        style={styles.input}
      />
      {searching ? (
        <ActivityIndicator color={brand.colors.primaryBlue} />
      ) : null}
      {hits.length > 0 ? (
        <FlatList
          data={hits}
          keyExtractor={(item) => item.id}
          style={styles.hits}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.hitRow}
              onPress={() => {
                onSelect(item);
                setQuery('');
                setHits([]);
              }}
            >
              <Text style={styles.hitName}>
                {item.displayName?.trim() || '—'}
              </Text>
              <Text style={styles.hitPhone}>{item.phone}</Text>
            </Pressable>
          )}
        />
      ) : null}
      <Pressable onPress={() => setShowNew((v) => !v)}>
        <Text style={styles.newToggle}>
          {showNew ? 'إلغاء عميل جديد' : '+ عميل جديد'}
        </Text>
      </Pressable>
      {showNew ? (
        <View style={styles.newBox}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="الاسم"
            placeholderTextColor={brand.colors.textMuted}
            textAlign="right"
            style={styles.input}
          />
          <TextInput
            value={newPhone}
            onChangeText={setNewPhone}
            placeholder="الجوال"
            keyboardType="phone-pad"
            placeholderTextColor={brand.colors.textMuted}
            textAlign="right"
            style={styles.input}
          />
          <Pressable
            style={styles.createBtn}
            onPress={() => void createCustomer()}
            disabled={creating}
          >
            <Text style={styles.createBtnText}>
              {creating ? 'جاري…' : 'حفظ العميل'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  input: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.md,
    borderWidth: 1,
    borderColor: brand.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: brand.colors.text,
  },
  hits: { maxHeight: 140 },
  hitRow: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.md,
    padding: 10,
    marginBottom: 6,
    alignItems: 'flex-end',
  },
  hitName: { fontWeight: '900', color: brand.colors.text },
  hitPhone: { color: brand.colors.textMuted, fontSize: 13 },
  newToggle: {
    textAlign: 'right',
    color: brand.colors.primaryBlue,
    fontWeight: '800',
  },
  newBox: { gap: 8 },
  createBtn: {
    backgroundColor: brand.colors.primaryBlue,
    borderRadius: brand.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  createBtnText: { color: brand.colors.white, fontWeight: '800' },
  selectedBox: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  selectedMeta: { flex: 1, alignItems: 'flex-end', gap: 2 },
  selectedName: { fontSize: 16, fontWeight: '900', color: brand.colors.text },
  selectedPhone: { fontSize: 13, color: brand.colors.textMuted },
  change: { color: brand.colors.primaryBlue, fontWeight: '800' },
});
