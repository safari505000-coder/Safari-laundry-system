import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';
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

export function MutedText({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brand.colors.grayBackground,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  card: {
    backgroundColor: brand.colors.white,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: brand.colors.text,
    textAlign: 'right',
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
    borderRadius: 12,
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
    fontWeight: '600',
  },
});
