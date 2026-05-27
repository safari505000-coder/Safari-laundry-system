import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  DriverDispatchSeverity,
  DriverDispatchTask,
} from '@/api/dispatch';
import { PrimaryButton } from '@/components/ui';
import { brand } from '@/theme/brand';

const severityStyle: Record<
  DriverDispatchSeverity,
  { bg: string; text: string; label: string }
> = {
  ON_TIME: {
    bg: '#DCFCE7',
    text: '#166534',
    label: 'في الوقت',
  },
  LATE: {
    bg: '#FEF3C7',
    text: '#92400E',
    label: 'متأخر',
  },
  CRITICAL: {
    bg: '#FEE2E2',
    text: '#991B1B',
    label: 'حرج',
  },
  COMPLETED: {
    bg: '#F1F5F9',
    text: '#475569',
    label: 'مكتمل',
  },
};

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ar-KW', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function TaskCard({
  task,
  onAcknowledge,
  acknowledgingId,
  gpsBlocked,
  onRequestGps,
}: {
  task: DriverDispatchTask;
  onAcknowledge: (taskId: string) => void;
  acknowledgingId: string | null;
  gpsBlocked?: boolean;
  onRequestGps?: () => void;
}) {
  const address = task.customerAddress ?? task.address ?? null;
  const severity = severityStyle[task.severity];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View
          style={[styles.badge, { backgroundColor: severity.bg }]}
        >
          <Text style={[styles.badgeText, { color: severity.text }]}>
            {severity.label}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.customer}>{task.customerDisplay}</Text>
          {task.customerPhone ? (
            <Pressable
              onPress={() => {
                void Linking.openURL(`tel:${task.customerPhone}`);
              }}
            >
              <Text style={styles.phone}>{task.customerPhone}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.address}>
            {address?.trim() ? address : '—'}
          </Text>
        </View>
      </View>

      {task.status === 'ASSIGNED' ? (
        <View style={styles.newBanner}>
          <Text style={styles.newBannerText}>مهمة جديدة</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.muted}>{formatCreatedAt(task.createdAtIso)}</Text>
        <Text style={styles.muted}>
          منذ {task.elapsedMinutes} د · {task.status}
        </Text>
      </View>

      {task.instructionNote ? (
        <View style={styles.noteBox}>
          <Text style={styles.note}>{task.instructionNote}</Text>
        </View>
      ) : null}

      {task.status === 'ASSIGNED' ? (
        gpsBlocked ? (
          <View style={styles.gpsBlock}>
            <Text style={styles.gpsBlockText}>
              فعّل الموقع قبل استلام المهمة
            </Text>
            {onRequestGps ? (
              <PrimaryButton
                label="السماح بالموقع"
                onPress={onRequestGps}
                disabled={acknowledgingId !== null}
              />
            ) : null}
          </View>
        ) : (
          <PrimaryButton
            label={
              acknowledgingId === task.id ? 'جاري الاستلام…' : 'استلمت المهمة'
            }
            onPress={() => onAcknowledge(task.id)}
            disabled={acknowledgingId !== null}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.colors.white,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  meta: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  customer: {
    fontSize: 17,
    fontWeight: '700',
    color: brand.colors.text,
    textAlign: 'right',
  },
  phone: {
    fontSize: 15,
    color: brand.colors.primaryBlue,
    textAlign: 'right',
  },
  address: {
    fontSize: 14,
    color: brand.colors.textMuted,
    textAlign: 'right',
    lineHeight: 20,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  newBanner: {
    alignSelf: 'flex-end',
    backgroundColor: brand.colors.danger,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  newBannerText: {
    color: brand.colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    gap: 8,
  },
  muted: {
    fontSize: 12,
    color: brand.colors.textMuted,
  },
  noteBox: {
    backgroundColor: brand.colors.grayBackground,
    borderRadius: 12,
    padding: 12,
  },
  note: {
    fontSize: 14,
    color: brand.colors.text,
    textAlign: 'right',
    lineHeight: 22,
  },
  gpsBlock: {
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
  },
  gpsBlockText: {
    textAlign: 'right',
    color: '#92400E',
    fontSize: 13,
    fontWeight: '600',
  },
});
