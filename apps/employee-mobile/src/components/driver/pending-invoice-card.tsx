import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { DriverPendingInvoiceRow } from '@/api/orders';
import { StatusPill } from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'نقد',
  KNET: 'كي نت',
  PAYMENT_LINK: 'رابط دفع',
  ONLINE: 'أونلاين',
  DEBT_ON_ACCOUNT: 'على الحساب',
  SUBSCRIPTION_WALLET: 'محفظة',
};

function badgeForRow(row: DriverPendingInvoiceRow): { label: string; tone: 'pending' | 'cancelled' } {
  if (row.linkStatus === 'PENDING') {
    return {
      label: 'رابط دفع نشط',
      tone: 'pending',
    };
  }
  return {
    label: 'غير مدفوع',
    tone: 'cancelled',
  };
}

export function PendingInvoiceCard({ row }: { row: DriverPendingInvoiceRow }) {
  const badge = badgeForRow(row);
  const pm = row.paymentMethod
    ? (PAYMENT_LABELS[row.paymentMethod] ?? row.paymentMethod)
    : '—';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <StatusPill label={badge.label} tone={badge.tone} />
        <Text style={styles.readableId}>{row.readableId}</Text>
      </View>
      <Text style={styles.customer}>{row.customerName}</Text>
      {row.customerPhone ? (
        <Pressable onPress={() => void Linking.openURL(`tel:${row.customerPhone}`)}>
          <Text style={styles.phone}>{row.customerPhone}</Text>
        </Pressable>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.muted}>{pm}</Text>
        <Text style={styles.amount}>{formatKwdLabel(row.amountKd)}</Text>
      </View>
      {row.notes ? <Text style={styles.notes}>{row.notes}</Text> : null}
      <Text style={styles.date}>
        {new Date(row.createdAtIso).toLocaleString('ar-KW')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.lg,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: brand.colors.border,
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  readableId: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: brand.colors.textMuted,
  },
  customer: {
    fontSize: 16,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
  },
  phone: {
    fontSize: 14,
    color: brand.colors.primaryBlue,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  amount: {
    fontSize: 15,
    fontWeight: '900',
    color: brand.colors.text,
  },
  muted: {
    fontSize: 12,
    color: brand.colors.textMuted,
  },
  notes: {
    fontSize: 12,
    color: brand.colors.textMuted,
    textAlign: 'right',
    backgroundColor: brand.colors.surfaceMuted,
    borderRadius: brand.radius.sm,
    padding: 8,
  },
  date: {
    fontSize: 11,
    color: brand.colors.textMuted,
    textAlign: 'right',
  },
});
