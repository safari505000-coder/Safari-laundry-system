import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import {
  listWebsiteOrderRequests,
  updateWebsiteOrderRequestStatus,
  type WebsiteOrderRequestRow,
  type WebsiteOrderRequestStatus,
} from '@/api/call-center';
import { useAuth } from '@/auth/auth-context';
import { CcChrome } from '@/components/call-center/cc-chrome';
import { MutedText, PrimaryButton } from '@/components/ui';
import { brand } from '@/theme/brand';

const STATUS_LABELS: Record<WebsiteOrderRequestStatus, string> = {
  NEW: 'جديد',
  CONTACTED: 'تم التواصل',
  CONVERTED: 'تم التحويل',
  CANCELLED: 'ملغى',
};

const FILTERS: Array<WebsiteOrderRequestStatus | 'ALL'> = [
  'ALL',
  'NEW',
  'CONTACTED',
  'CONVERTED',
  'CANCELLED',
];

export default function WebsiteOrdersScreen() {
  const { getValidAccessToken } = useAuth();
  const [rows, setRows] = useState<WebsiteOrderRequestRow[]>([]);
  const [filter, setFilter] = useState<WebsiteOrderRequestStatus | 'ALL'>(
    'NEW',
  );
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
      const data = await listWebsiteOrderRequests(
        token,
        filter === 'ALL' ? undefined : filter,
      );
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحميل');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, getValidAccessToken]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function setStatus(id: string, status: WebsiteOrderRequestStatus) {
    setBusyId(id);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        throw new Error('انتهت الجلسة');
      }
      await updateWebsiteOrderRequestStatus(token, id, status);
      setRows((prev) =>
        filter !== 'ALL' && filter !== status
          ? prev.filter((row) => row.id !== id)
          : prev.map((row) =>
              row.id === id ? { ...row, status } : row,
            ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل التحديث');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <CcChrome title="طلبات الموقع">
      <View style={styles.wrap}>
        <View style={styles.filters}>
          {FILTERS.map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setFilter(tab)}
              style={[styles.chip, filter === tab && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  filter === tab && styles.chipTextActive,
                ]}
              >
                {tab === 'ALL' ? 'الكل' : STATUS_LABELS[tab]}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && rows.length === 0 ? (
          <ActivityIndicator color={brand.colors.darkBlue} />
        ) : error && rows.length === 0 ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
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
            ListEmptyComponent={
              <Text style={styles.empty}>لا طلبات في هذا الفلتر</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.ref}>{item.publicReference}</Text>
                <Text style={styles.name}>
                  {item.customerDisplayName ?? item.customerPhone}
                </Text>
                <Pressable
                  onPress={() =>
                    void Linking.openURL(`tel:${item.customerPhone}`)
                  }
                >
                  <Text style={styles.phone}>{item.customerPhone}</Text>
                </Pressable>
                {item.customerAddress ? (
                  <MutedText>{item.customerAddress}</MutedText>
                ) : null}
                <MutedText>
                  {STATUS_LABELS[item.status]} · {item.serviceType}
                </MutedText>
                {item.notes ? <MutedText>{item.notes}</MutedText> : null}
                {item.status === 'NEW' ? (
                  <PrimaryButton
                    label={
                      busyId === item.id ? '…' : 'تم التواصل'
                    }
                    onPress={() => void setStatus(item.id, 'CONTACTED')}
                    disabled={busyId !== null}
                  />
                ) : null}
              </View>
            )}
          />
        )}
      </View>
    </CcChrome>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 10 },
  filters: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: brand.colors.white,
    borderWidth: 1,
    borderColor: '#D8D8E6',
  },
  chipActive: {
    backgroundColor: brand.colors.darkBlue,
    borderColor: brand.colors.darkBlue,
  },
  chipText: { fontSize: 12, color: brand.colors.textMuted },
  chipTextActive: { color: brand.colors.white, fontWeight: '700' },
  list: { gap: 10, paddingBottom: 24 },
  card: {
    backgroundColor: brand.colors.white,
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ref: {
    fontWeight: '700',
    color: brand.colors.darkBlue,
    textAlign: 'right',
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
    color: brand.colors.text,
  },
  phone: {
    color: brand.colors.primaryBlue,
    textAlign: 'right',
  },
  empty: { textAlign: 'center', color: brand.colors.textMuted, marginTop: 24 },
  error: { color: brand.colors.danger, textAlign: 'right' },
});
