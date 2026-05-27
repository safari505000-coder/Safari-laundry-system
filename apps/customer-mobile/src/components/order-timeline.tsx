import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WebsiteOrderRequestStatus } from '@safari-erp/shared-api';
import { brand } from '@/theme/brand';
import { layout } from '@/theme/layout';

const STEPS: Array<{
  status: WebsiteOrderRequestStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { status: 'NEW', label: 'استلام الطلب', icon: 'document-text-outline' },
  { status: 'CONTACTED', label: 'تأكيد التفاصيل', icon: 'call-outline' },
  { status: 'CONVERTED', label: 'العناية والتنفيذ', icon: 'checkmark-circle-outline' },
];

function stepIndex(status: WebsiteOrderRequestStatus): number {
  if (status === 'CANCELLED') {
    return -1;
  }
  const idx = STEPS.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : 0;
}

export function OrderTimeline({ status }: { status: WebsiteOrderRequestStatus }) {
  if (status === 'CANCELLED') {
    return (
      <View style={styles.cancelled}>
        <Ionicons name="close-circle" size={20} color={brand.colors.danger} />
        <Text style={styles.cancelledText}>تم إلغاء الطلب</Text>
      </View>
    );
  }

  const active = stepIndex(status);

  return (
    <View style={styles.wrap}>
      {STEPS.map((step, index) => {
        const done = index <= active;
        const current = index === active;
        return (
          <View key={step.status} style={styles.stepRow}>
            <View style={styles.stepMeta}>
              <Text style={[styles.stepLabel, done && styles.stepLabelDone]}>
                {step.label}
              </Text>
              {current ? <Text style={styles.now}>المرحلة الحالية</Text> : null}
            </View>
            <View style={styles.rail}>
              {index < STEPS.length - 1 ? (
                <View style={[styles.line, done && styles.lineDone]} />
              ) : null}
              <View
                style={[
                  styles.dot,
                  done && styles.dotDone,
                  current && styles.dotCurrent,
                ]}
              >
                <Ionicons
                  name={step.icon}
                  size={14}
                  color={done ? brand.colors.white : brand.colors.textMuted}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0, paddingVertical: layout.spacing.xs },
  stepRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 52,
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
    width: 28,
    alignItems: 'center',
    position: 'relative',
  },
  line: {
    position: 'absolute',
    top: 28,
    width: 2,
    height: 28,
    backgroundColor: brand.ui.separator,
  },
  lineDone: { backgroundColor: brand.colors.primaryBlue },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: brand.ui.secondaryFill,
    alignItems: 'center',
    justifyContent: 'center',
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
  cancelled: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,59,48,0.12)',
    padding: 10,
    borderRadius: layout.radius.md,
  },
  cancelledText: {
    color: brand.colors.danger,
    fontWeight: '700',
  },
});
