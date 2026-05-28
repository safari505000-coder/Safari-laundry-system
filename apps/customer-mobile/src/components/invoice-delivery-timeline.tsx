import { StyleSheet, Text, View } from 'react-native';
import {
  deliveryReturnReasonLabelAr,
  deliveryStatusLabelAr,
  deliveryTimelineActiveIndex,
  DELIVERY_TIMELINE_STEPS,
  type DeliveryStatus,
} from '@/lib/delivery-status';
import { brand } from '@/theme/brand';
import { layout } from '@/theme/layout';

export type InvoiceDeliveryTimelineEvent = {
  id: string;
  fromStatus: string;
  toStatus: string;
  returnReason: string | null;
  notes: string | null;
  createdAt: string;
  actorName: string | null;
};

export function InvoiceDeliveryTimeline({
  status,
  events,
}: {
  status: DeliveryStatus;
  events: InvoiceDeliveryTimelineEvent[];
}) {
  const active = deliveryTimelineActiveIndex(status);
  const returned = status === 'RETURNED_TO_BRANCH';

  return (
    <View style={styles.wrap}>
      {returned ? (
        <View style={styles.returnedBanner}>
          <Text style={styles.returnedTitle}>{deliveryStatusLabelAr(status)}</Text>
          <Text style={styles.returnedHint}>
            تواصل معنا على {brand.phone} لترتيب محاولة توصيل أخرى.
          </Text>
        </View>
      ) : null}

      {DELIVERY_TIMELINE_STEPS.map((step, index) => {
        const done = index <= active && !returned;
        const current = index === active && !returned;
        return (
          <View key={step.status} style={styles.stepRow}>
            <View style={styles.stepMeta}>
              <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>
                {step.label}
              </Text>
              {current ? <Text style={styles.now}>المرحلة الحالية</Text> : null}
            </View>
            <View style={styles.rail}>
              {index < DELIVERY_TIMELINE_STEPS.length - 1 ? (
                <View style={[styles.line, done && styles.lineDone]} />
              ) : null}
              <View
                style={[
                  styles.dot,
                  done && styles.dotDone,
                  current && styles.dotCurrent,
                ]}
              />
            </View>
          </View>
        );
      })}

      {events.length > 0 ? (
        <View style={styles.eventLog}>
          <Text style={styles.eventLogTitle}>سجل الحركة</Text>
          {events.map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <Text style={styles.eventText}>
                {deliveryStatusLabelAr(event.toStatus)}
                {event.returnReason
                  ? ` — ${deliveryReturnReasonLabelAr(event.returnReason)}`
                  : ''}
              </Text>
              <Text style={styles.eventTime}>
                {new Date(event.createdAt).toLocaleString('ar-KW')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: layout.spacing.sm, paddingVertical: layout.spacing.xs },
  returnedBanner: {
    backgroundColor: 'rgba(255,149,0,0.12)',
    borderRadius: layout.radius.md,
    padding: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  returnedTitle: {
    color: brand.colors.warning ?? '#FF9500',
    fontWeight: '800',
    fontSize: 14,
  },
  returnedHint: {
    color: brand.ui.secondaryLabel,
    fontSize: 12,
    textAlign: 'right',
  },
  stepRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 48,
  },
  stepMeta: { flex: 1, alignItems: 'flex-end', paddingTop: 2, gap: 2 },
  stepLabel: {
    fontSize: 13,
    color: brand.ui.secondaryLabel,
    fontWeight: '600',
  },
  stepLabelDone: { color: brand.ui.label },
  now: {
    fontSize: 11,
    color: brand.colors.primaryBlue,
    fontWeight: '800',
  },
  rail: {
    width: 16,
    alignItems: 'center',
    position: 'relative',
  },
  line: {
    position: 'absolute',
    top: 14,
    width: 2,
    height: 28,
    backgroundColor: brand.ui.separator,
  },
  lineDone: { backgroundColor: brand.colors.primaryBlue },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: brand.ui.secondaryFill,
    borderWidth: 2,
    borderColor: brand.ui.separator,
  },
  dotDone: {
    backgroundColor: brand.colors.primaryBlue,
    borderColor: brand.colors.primaryBlue,
  },
  dotCurrent: {
    borderColor: brand.colors.cyan,
  },
  eventLog: {
    marginTop: layout.spacing.sm,
    gap: 8,
    alignItems: 'flex-end',
  },
  eventLogTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: brand.ui.label,
  },
  eventRow: { alignItems: 'flex-end', gap: 2 },
  eventText: {
    fontSize: 12,
    color: brand.ui.label,
    fontWeight: '600',
  },
  eventTime: {
    fontSize: 11,
    color: brand.ui.secondaryLabel,
  },
});
