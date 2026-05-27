import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { brand } from '@/theme/brand';
import { layout } from '@/theme/layout';

type IconName = keyof typeof Ionicons.glyphMap;

export function AppScreen({ children, style, ...props }: ViewProps) {
  return (
    <View style={[styles.screen, style]} {...props}>
      {children}
    </View>
  );
}

export function AppHeader({
  eyebrow = brand.shortNameAr,
  title,
  subtitle,
  action,
  search,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  search?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { sideInset, largeTitleSize, subtitleSize } = useScreenLayout();

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 12, paddingHorizontal: sideInset },
      ]}
    >
      <View style={styles.headerRow}>
        {action ?? <View style={styles.headerActionPlaceholder} />}
        <View style={styles.headerText}>
          <Text style={styles.eyebrow} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text
            style={[styles.largeTitle, { fontSize: largeTitleSize }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={[styles.headerSubtitle, { fontSize: subtitleSize }]}
              numberOfLines={2}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {search ? <View style={styles.headerSearch}>{search}</View> : null}
    </View>
  );
}

export function Content({
  children,
  fill,
  style,
}: {
  children: ReactNode;
  fill?: boolean;
  style?: ViewStyle;
}) {
  const { contentWidth, sideInset, isTablet } = useScreenLayout();
  return (
    <View style={[styles.contentOuter, fill && styles.fill, isTablet && styles.center]}>
      <View
        style={[
          styles.contentInner,
          fill && styles.fill,
          { width: contentWidth, marginHorizontal: sideInset },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function AppScrollView({
  children,
  contentContainerStyle,
  ...props
}: ScrollViewProps & { children: ReactNode }) {
  const { scrollBottomPad } = useScreenLayout();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: scrollBottomPad },
        contentContainerStyle,
      ]}
      {...props}
    >
      {children}
    </ScrollView>
  );
}

export function Surface({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}) {
  return (
    <View style={[styles.surface, padded && styles.surfacePadded, style]}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function MutedText({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'بحث',
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={brand.ui.secondaryLabel} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={brand.ui.tertiaryLabel}
        textAlign="right"
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={styles.searchInput}
      />
    </View>
  );
}

export function FormField({
  label,
  icon,
  style,
  ...props
}: TextInputProps & {
  label?: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.formField}>
      {label ? <Text style={styles.formLabel}>{label}</Text> : null}
      <View style={styles.formInputShell}>
        {icon ? <Ionicons name={icon} size={18} color={brand.ui.secondaryLabel} /> : null}
        <TextInput
          placeholderTextColor={brand.ui.tertiaryLabel}
          textAlign="right"
          style={[styles.formInput, style as TextStyle]}
          {...props}
        />
      </View>
    </View>
  );
}

export function PrimaryAction({
  label,
  onPress,
  disabled,
  variant = 'primary',
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'plain';
  icon?: IconName;
}) {
  const foreground =
    variant === 'primary' || variant === 'danger'
      ? brand.colors.white
      : brand.colors.primaryBlue;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        styles[`action_${variant}`],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
      <Text style={[styles.actionText, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : (
        <View />
      )}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export function ChoiceGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; caption?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choiceGroup}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.choice, active && styles.choiceActive]}
          >
            <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]}>
              {option.label}
            </Text>
            {option.caption ? (
              <Text
                style={[
                  styles.choiceCaption,
                  active && styles.choiceCaptionActive,
                ]}
                numberOfLines={1}
              >
                {option.caption}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  message,
  loading,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  loading?: boolean;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      {loading ? (
        <ActivityIndicator color={brand.colors.primaryBlue} />
      ) : (
        <View style={styles.emptyIcon}>
          <Ionicons name={icon} size={30} color={brand.colors.primaryBlue} />
        </View>
      )}
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {action && onAction ? (
        <PrimaryAction label={action} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

export function ListDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brand.ui.groupedBackground,
  },
  header: {
    backgroundColor: brand.ui.groupedBackground,
    paddingBottom: layout.spacing.lg,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: layout.spacing.md,
  },
  headerActionPlaceholder: {
    width: 42,
    height: 42,
  },
  headerText: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
  },
  eyebrow: {
    color: brand.colors.primaryBlue,
    fontSize: layout.typography.footnote,
    fontWeight: '800',
  },
  largeTitle: {
    color: brand.ui.label,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.5,
    width: '100%',
  },
  headerSubtitle: {
    color: brand.ui.secondaryLabel,
    textAlign: 'right',
    lineHeight: 20,
    width: '100%',
  },
  headerSearch: {
    marginTop: layout.spacing.lg,
  },
  contentOuter: {
    width: '100%',
  },
  contentInner: {
    width: '100%',
  },
  center: {
    alignItems: 'center',
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    gap: layout.spacing.md,
  },
  surface: {
    backgroundColor: brand.ui.card,
    borderRadius: layout.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: brand.ui.separator,
    overflow: 'hidden',
  },
  surfacePadded: {
    padding: layout.spacing.lg,
    gap: layout.spacing.md,
  },
  title: {
    color: brand.ui.label,
    fontSize: layout.typography.title2,
    fontWeight: '900',
    textAlign: 'right',
  },
  subtitle: {
    color: brand.ui.secondaryLabel,
    fontSize: layout.typography.subhead,
    lineHeight: 20,
    textAlign: 'right',
  },
  muted: {
    color: brand.ui.secondaryLabel,
    fontSize: layout.typography.footnote,
    lineHeight: 18,
    textAlign: 'right',
  },
  search: {
    minHeight: 48,
    borderRadius: layout.radius.md,
    backgroundColor: brand.ui.secondaryFill,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: layout.spacing.sm,
    paddingHorizontal: layout.spacing.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: brand.ui.label,
    fontSize: layout.typography.body,
    paddingVertical: layout.spacing.sm,
  },
  formField: {
    gap: layout.spacing.xs,
  },
  formLabel: {
    color: brand.ui.secondaryLabel,
    textAlign: 'right',
    fontSize: layout.typography.footnote,
    fontWeight: '700',
  },
  formInputShell: {
    minHeight: 52,
    borderRadius: layout.radius.md,
    backgroundColor: brand.ui.tertiaryFill,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: layout.spacing.sm,
    paddingHorizontal: layout.spacing.md,
  },
  formInput: {
    flex: 1,
    minWidth: 0,
    color: brand.ui.label,
    fontSize: layout.typography.body,
    paddingVertical: layout.spacing.md,
  },
  action: {
    minHeight: 52,
    borderRadius: layout.radius.pill,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: layout.spacing.sm,
    paddingHorizontal: layout.spacing.lg,
    paddingVertical: layout.spacing.md,
  },
  action_primary: {
    backgroundColor: brand.colors.primaryBlue,
  },
  action_secondary: {
    backgroundColor: brand.ui.secondaryFill,
  },
  action_danger: {
    backgroundColor: brand.ui.systemRed,
  },
  action_plain: {
    backgroundColor: 'transparent',
  },
  actionText: {
    fontSize: layout.typography.body,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: layout.spacing.sm,
  },
  sectionTitle: {
    color: brand.ui.label,
    fontSize: layout.typography.title3,
    fontWeight: '900',
    textAlign: 'right',
  },
  sectionAction: {
    color: brand.colors.primaryBlue,
    fontSize: layout.typography.subhead,
    fontWeight: '800',
  },
  choiceGroup: {
    borderRadius: layout.radius.lg,
    backgroundColor: brand.ui.secondaryFill,
    padding: layout.spacing.xs,
    flexDirection: 'row-reverse',
    gap: layout.spacing.xs,
  },
  choice: {
    flex: 1,
    minHeight: 54,
    borderRadius: layout.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.spacing.sm,
  },
  choiceActive: {
    backgroundColor: brand.ui.card,
    ...layout.shadow.subtle,
  },
  choiceLabel: {
    color: brand.ui.secondaryLabel,
    fontSize: layout.typography.subhead,
    fontWeight: '900',
  },
  choiceLabelActive: {
    color: brand.ui.label,
  },
  choiceCaption: {
    color: brand.ui.tertiaryLabel,
    fontSize: layout.typography.caption,
  },
  choiceCaptionActive: {
    color: brand.ui.secondaryLabel,
  },
  chip: {
    borderRadius: layout.radius.pill,
    backgroundColor: brand.ui.secondaryFill,
    paddingHorizontal: layout.spacing.md,
    paddingVertical: layout.spacing.sm,
    maxWidth: '100%',
  },
  chipActive: {
    backgroundColor: brand.colors.primaryBlue,
  },
  chipText: {
    color: brand.ui.secondaryLabel,
    fontSize: layout.typography.footnote,
    fontWeight: '800',
  },
  chipTextActive: {
    color: brand.colors.white,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: layout.spacing.sm,
    padding: layout.spacing.xxl,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: brand.ui.secondaryFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: brand.ui.label,
    fontSize: layout.typography.headline,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyMessage: {
    color: brand.ui.secondaryLabel,
    fontSize: layout.typography.subhead,
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: brand.ui.separator,
  },
});
