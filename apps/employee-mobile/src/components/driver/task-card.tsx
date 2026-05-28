import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  DriverDispatchSeverity,
  DriverDispatchTask,
} from '@/api/dispatch';
import { PrimaryButton, StatusPill } from '@/components/ui';
import { brand } from '@/theme/brand';

const severityStyle: Record<
  DriverDispatchSeverity,
  { label: string; tone: 'completed' | 'warning' | 'cancelled' | 'neutral' }
> = {
  ON_TIME: {
    label: 'في الوقت',
    tone: 'completed',
  },
  LATE: {
    label: 'متأخر',
    tone: 'warning',
  },
  CRITICAL: {
    label: 'حرج',
    tone: 'cancelled',
  },
  COMPLETED: {
    label: 'مكتمل',
    tone: 'neutral',
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
  onCreateOrder,
  acknowledgingId,
  gpsBlocked,
  onRequestGps,
}: {
  task: DriverDispatchTask;
  onAcknowledge: (taskId: string) => void;
  onCreateOrder?: (task: DriverDispatchTask) => void;
  acknowledgingId: string | null;
  gpsBlocked?: boolean;
  onRequestGps?: () => void;
}) {
  const address = task.customerAddress ?? task.address ?? null;
  const severity = severityStyle[task.severity];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <StatusPill label={severity.label} tone={severity.tone} />
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
          <StatusPill label="مهمة جديدة" tone="cancelled" />
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
      {task.status === 'IN_PROGRESS' && !task.completedByOrderId && onCreateOrder ? (
        <PrimaryButton
          label="إصدار فاتورة من المهمة"
          onPress={() => onCreateOrder(task)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.xl,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: brand.colors.border,
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
    fontWeight: '900',
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
    backgroundColor: brand.colors.surfaceMuted,
    borderRadius: brand.radius.md,
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
    backgroundColor: brand.colors.warningSoft,
    borderRadius: brand.radius.md,
    padding: 12,
  },
  gpsBlockText: {
    textAlign: 'right',
    color: '#92400E',
    fontSize: 13,
    fontWeight: '800',
  },
});
