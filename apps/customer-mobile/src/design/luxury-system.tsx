import type { ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { luxury } from './luxury-tokens';

type IconName = keyof typeof Ionicons.glyphMap;

export function LuxuryScreen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function LuxuryScroll({
  children,
  contentContainerStyle,
  ...props
}: ScrollViewProps & { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      {...props}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + luxury.space.xl, paddingBottom: insets.bottom + 42 },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

export function FadeIn({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: luxury.motion.slow,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: luxury.motion.slow,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

export function CinematicOrb({
  size = 220,
  delay = 0,
  style,
}: {
  size?: number;
  delay?: number;
  style?: ViewStyle;
}) {
  const scale = useRef(new Animated.Value(0.96)).current;
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.05,
            duration: 2800,
            delay,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.72,
            duration: 2800,
            delay,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 0.96,
            duration: 2800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.42,
            duration: 2800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ).start();
  }, [delay, opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          transform: [{ scale }],
        },
        style,
      ]}
    />
  );
}

export function LuxuryHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
    </View>
  );
}

export function GlassPanel({
  children,
  style,
  elevated,
}: {
  children: ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
}) {
  return <View style={[styles.panel, elevated && styles.panelElevated, style]}>{children}</View>;
}

export function LuxuryButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  icon?: IconName;
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        variant === 'quiet' && styles.buttonQuiet,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={primary ? luxury.color.warmWhite : luxury.color.blue600}
        />
      ) : null}
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function LuxuryField({
  label,
  icon,
  ...props
}: TextInputProps & {
  label?: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.fieldShell}>
        {icon ? <Ionicons name={icon} size={18} color={luxury.color.slate} /> : null}
        <TextInput
          {...props}
          textAlign="right"
          placeholderTextColor={luxury.color.silver}
          style={[styles.input, props.style]}
        />
      </View>
    </View>
  );
}

export function LuxuryChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function LuxuryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function LuxuryListRow({
  title,
  subtitle,
  meta,
  icon,
}: {
  title: string;
  subtitle: string;
  meta?: string;
  icon: IconName;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={19} color={luxury.color.blue600} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
    </View>
  );
}

export function LuxurySectionTitle({
  title,
  caption,
}: {
  title: string;
  caption?: string;
}) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {caption ? <Text style={styles.sectionCaption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: luxury.color.porcelain,
  },
  orb: {
    position: 'absolute',
    backgroundColor: luxury.color.champagneSoft,
  },
  scroll: {
    paddingHorizontal: luxury.space.lg,
    gap: luxury.space.xl,
  },
  hero: {
    alignItems: 'flex-end',
    paddingTop: luxury.space.md,
    gap: luxury.space.xs,
  },
  eyebrow: {
    color: luxury.color.blue600,
    fontSize: luxury.type.caption,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.hero,
    lineHeight: luxury.lineHeight.hero,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -1,
  },
  heroSubtitle: {
    color: luxury.color.slate,
    fontSize: luxury.type.body,
    lineHeight: luxury.lineHeight.body,
    textAlign: 'right',
    maxWidth: 310,
  },
  panel: {
    backgroundColor: luxury.color.glassStrong,
    borderRadius: luxury.radius.xl,
    padding: luxury.space.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: luxury.color.line,
    gap: luxury.space.lg,
  },
  panelElevated: {
    ...luxury.shadow.soft,
  },
  button: {
    minHeight: 56,
    borderRadius: luxury.radius.pill,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: luxury.space.sm,
    paddingHorizontal: luxury.space.lg,
  },
  buttonPrimary: {
    backgroundColor: luxury.color.blue600,
    ...luxury.shadow.soft,
  },
  buttonSecondary: {
    backgroundColor: luxury.color.ice100,
  },
  buttonQuiet: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.42,
  },
  buttonText: {
    color: luxury.color.blue600,
    fontSize: luxury.type.body,
    fontWeight: '800',
  },
  buttonTextPrimary: {
    color: luxury.color.warmWhite,
  },
  field: {
    gap: luxury.space.xs,
  },
  fieldLabel: {
    color: luxury.color.slate,
    textAlign: 'right',
    fontSize: luxury.type.caption,
    fontWeight: '700',
  },
  fieldShell: {
    minHeight: 56,
    borderRadius: luxury.radius.md,
    backgroundColor: 'rgba(15, 17, 21, 0.045)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: luxury.space.md,
    gap: luxury.space.sm,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: luxury.type.body,
    color: luxury.color.graphite,
    paddingVertical: luxury.space.sm,
  },
  chip: {
    borderRadius: luxury.radius.pill,
    backgroundColor: 'rgba(15,17,21,0.055)',
    paddingHorizontal: luxury.space.md,
    paddingVertical: luxury.space.sm,
  },
  chipActive: {
    backgroundColor: luxury.color.graphite,
  },
  chipText: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    fontWeight: '800',
  },
  chipTextActive: {
    color: luxury.color.warmWhite,
  },
  metric: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  metricValue: {
    color: luxury.color.graphite,
    fontSize: luxury.type.section,
    fontWeight: '900',
  },
  metricLabel: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: luxury.space.md,
    paddingVertical: luxury.space.sm,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: luxury.color.ice100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  },
  rowTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.body,
    fontWeight: '800',
    textAlign: 'right',
  },
  rowSubtitle: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    lineHeight: luxury.lineHeight.caption,
    textAlign: 'right',
  },
  rowMeta: {
    color: luxury.color.blue600,
    fontSize: luxury.type.caption,
    fontWeight: '900',
  },
  sectionTitleWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  sectionTitle: {
    color: luxury.color.graphite,
    fontSize: luxury.type.section,
    fontWeight: '900',
    textAlign: 'right',
  },
  sectionCaption: {
    color: luxury.color.slate,
    fontSize: luxury.type.caption,
    textAlign: 'right',
  },
});
