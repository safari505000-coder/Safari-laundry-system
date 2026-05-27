import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DriverOversightCard } from '@/api/manager-types';
import { MutedText } from '@/components/ui';
import { formatKwdLabel } from '@/lib/kwd';
import { brand } from '@/theme/brand';

export function OversightCard({
  row,
  ssotCashKd,
}: {
  row: DriverOversightCard;
  ssotCashKd: string;
}) {
  const onShift = row.shiftStatus === 'ON_SHIFT';
  const tone = row.atRisk ? 'risk' : onShift ? 'active' : 'idle';

  return (
    <View style={[styles.card, styles[`card_${tone}`]]}>
      <View style={[styles.accent, styles[`accent_${tone}`]]} />
      <View style={styles.header}>
        <View style={styles.meta}>
          <Text style={styles.name}>{row.fullName}</Text>
          <MutedText>@{row.username}</MutedText>
          {row.branch ? <MutedText>{row.branch.name}</MutedText> : null}
        </View>
        <View style={[styles.badge, styles[`badge_${tone}`]]}>
          <Text style={styles.badgeText}>
            {onShift ? 'على الوردية' : 'خارج الوردية'}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat label="فواتير اليوم" value={String(row.ordersTodayCount)} />
        <Stat label="معلّقة" value={String(row.pendingInvoicesCount)} />
        <Stat label="نقد SSoT" value={formatKwdLabel(ssotCashKd)} highlight />
      </View>

      {row.staleQuickCount > 0 ? (
        <Text style={styles.stale}>
          {row.staleQuickCount} تقاط سريع قديم ·{' '}
          {formatKwdLabel(row.staleQuickKd)}
        </Text>
      ) : null}

      {row.atRisk ? (
        <Text style={styles.riskLabel}>⚠ سائق بحاجة متابعة</Text>
      ) : null}

      {row.phone ? (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${row.phone}`)}
          style={styles.phoneBtn}
        >
          <Text style={styles.phoneText}>{row.phone}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && styles.statHighlight]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  card_active: {
    backgroundColor: brand.colors.white,
    borderColor: '#A7F3D0',
  },
  card_idle: {
    backgroundColor: '#F4F4F5',
    borderColor: '#E4E4E7',
  },
  card_risk: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FDA4AF',
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  accent_active: { backgroundColor: brand.colors.success },
  accent_idle: { backgroundColor: '#A1A1AA' },
  accent_risk: { backgroundColor: brand.colors.danger },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  meta: { flex: 1, alignItems: 'flex-end', gap: 2 },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: brand.colors.text,
    textAlign: 'right',
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badge_active: { backgroundColor: '#D1FAE5' },
  badge_idle: { backgroundColor: '#E4E4E7' },
  badge_risk: { backgroundColor: '#FECDD3' },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: brand.colors.text,
  },
  stats: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  stat: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 10,
    padding: 8,
    alignItems: 'flex-end',
    gap: 2,
  },
  statLabel: {
    fontSize: 11,
    color: brand.colors.textMuted,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: brand.colors.text,
  },
  statHighlight: {
    color: '#B45309',
  },
  stale: {
    fontSize: 12,
    color: brand.colors.danger,
    textAlign: 'right',
  },
  riskLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: brand.colors.danger,
    textAlign: 'right',
  },
  phoneBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
  },
  phoneText: {
    color: brand.colors.primaryBlue,
    fontSize: 13,
    fontWeight: '600',
  },
});
