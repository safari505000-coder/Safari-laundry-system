import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { roleLabelAr } from '@/auth/roles';
import { StatusPill } from '@/components/ui';
import { brand } from '@/theme/brand';

export function RoleShell({
  title,
  children,
  showBack,
}: {
  title: string;
  children: ReactNode;
  showBack?: boolean;
}) {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.meta}>
          <Text style={styles.kicker}>SAFARI ERP</Text>
          <Text style={styles.title}>{title}</Text>
          {user ? (
            <View style={styles.userRow}>
              <StatusPill label={roleLabelAr(user.safariRole)} tone="neutral" />
              <Text style={styles.user}>{user.fullName}</Text>
            </View>
          ) : null}
        </View>
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}
          >
            <Text style={styles.logout}>رجوع</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={async () => {
              await signOut();
              router.replace('/(auth)/login');
            }}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}
          >
            <Text style={styles.logout}>خروج</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brand.colors.grayBackground,
  },
  topBar: {
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: brand.radius.xl,
    paddingTop: 56,
    paddingHorizontal: brand.space.lg,
    paddingBottom: brand.space.lg,
    backgroundColor: brand.colors.darkBlue,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  meta: { flex: 1, alignItems: 'flex-end', gap: 7 },
  kicker: {
    color: brand.colors.cyan,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    color: brand.colors.white,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  userRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  user: {
    color: '#DCEBFF',
    fontSize: 13,
    fontWeight: '700',
  },
  logoutButton: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  logoutPressed: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  logout: {
    color: brand.colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
});
