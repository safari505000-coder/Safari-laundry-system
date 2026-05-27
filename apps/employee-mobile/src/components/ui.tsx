import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { brand } from '@/theme/brand';

export function Screen({
  children,
  style,
  ...props
}: ViewProps & { children: ReactNode }) {
  return (
    <SafeAreaView style={[styles.screen, style]} {...props}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SurfaceCard({ children }: { children: ReactNode }) {
  return <View style={styles.surfaceCard}>{children}</View>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.ghostButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.ghostButtonPressed,
      ]}
    >
      <Text style={styles.ghostButtonText}>{label}</Text>
    </Pressable>
  );
}

export function MutedText({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export type StatusTone = 'pending' | 'completed' | 'cancelled' | 'neutral' | 'warning';

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: StatusTone;
}) {
  return (
    <View style={[styles.statusPill, STATUS_STYLE[tone]]}>
      <Text style={[styles.statusText, STATUS_TEXT_STYLE[tone]]}>{label}</Text>
    </View>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatusTone | 'primary';
}) {
  const cardTone = tone === 'primary' ? styles.statPrimary : STATUS_TILE_STYLE[tone];
  return (
    <View style={[styles.statTile, cardTone]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
}) {
  return (
    <View style={styles.listRow}>
      <View style={styles.listText}>
        <Text style={styles.listTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listSubtitle}>{subtitle}</Text> : null}
      </View>
      {meta ? <Text style={styles.listMeta}>{meta}</Text> : null}
    </View>
  );
}

export const erpTabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: brand.colors.primaryBlue,
  tabBarInactiveTintColor: brand.colors.textMuted,
  tabBarStyle: {
    height: 78,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingTop: 9,
    paddingBottom: 10,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopColor: brand.colors.border,
    borderTopWidth: 0,
    borderRadius: brand.radius.xl,
    position: 'absolute' as const,
  } satisfies ViewStyle,
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '800' as const,
    marginTop: 2,
  },
  tabBarItemStyle: {
    borderRadius: brand.radius.lg,
    marginHorizontal: 3,
    paddingVertical: 4,
  } satisfies ViewStyle,
};

const STATUS_STYLE = {
  pending: { backgroundColor: brand.colors.warningSoft },
  warning: { backgroundColor: brand.colors.warningSoft },
  completed: { backgroundColor: brand.colors.successSoft },
  cancelled: { backgroundColor: brand.colors.dangerSoft },
  neutral: { backgroundColor: brand.colors.neutralSoft },
} satisfies Record<StatusTone, object>;

const STATUS_TEXT_STYLE = {
  pending: { color: '#92400E' },
  warning: { color: '#92400E' },
  completed: { color: '#166534' },
  cancelled: { color: '#991B1B' },
  neutral: { color: brand.colors.textMuted },
} satisfies Record<StatusTone, object>;

const STATUS_TILE_STYLE = {
  pending: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  warning: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  completed: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  cancelled: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  neutral: { backgroundColor: brand.colors.surfaceMuted, borderColor: brand.colors.border },
} satisfies Record<StatusTone, object>;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brand.colors.grayBackground,
    paddingHorizontal: brand.space.lg,
    paddingTop: brand.space.md,
  },
  card: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.lg,
    borderWidth: 1,
    borderColor: brand.colors.border,
    padding: brand.space.lg,
    gap: brand.space.md,
  },
  surfaceCard: {
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.xl,
    borderWidth: 1,
    borderColor: brand.colors.border,
    padding: brand.space.lg,
    gap: brand.space.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: brand.colors.text,
    textAlign: 'right',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    color: brand.colors.textMuted,
    textAlign: 'right',
    lineHeight: 22,
  },
  muted: {
    fontSize: 13,
    color: brand.colors.textMuted,
    textAlign: 'right',
  },
  button: {
    backgroundColor: brand.colors.primaryBlue,
    borderRadius: brand.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: brand.colors.darkBlue,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: brand.colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  ghostButton: {
    backgroundColor: brand.colors.surface,
    borderColor: brand.colors.borderStrong,
    borderWidth: 1,
    borderRadius: brand.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostButtonPressed: {
    backgroundColor: brand.colors.surfaceMuted,
  },
  ghostButtonText: {
    color: brand.colors.primaryBlue,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'flex-end',
    gap: 6,
  },
  eyebrow: {
    color: brand.colors.primaryBlue,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: brand.colors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    color: brand.colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'right',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statTile: {
    borderWidth: 1,
    borderRadius: brand.radius.md,
    padding: brand.space.md,
    minWidth: 104,
  },
  statPrimary: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  statLabel: {
    color: brand.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  statValue: {
    color: brand.colors.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
    marginTop: 4,
  },
  statSub: {
    color: brand.colors.textMuted,
    fontSize: 11,
    textAlign: 'right',
    marginTop: 2,
  },
  listRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: brand.space.md,
    borderWidth: 1,
    borderColor: brand.colors.border,
    backgroundColor: brand.colors.surface,
    borderRadius: brand.radius.lg,
    padding: brand.space.md,
  },
  listText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  listTitle: {
    color: brand.colors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  listSubtitle: {
    color: brand.colors.textMuted,
    fontSize: 13,
    textAlign: 'right',
    marginTop: 3,
  },
  listMeta: {
    color: brand.colors.primaryBlue,
    fontSize: 12,
    fontWeight: '900',
  },
});
