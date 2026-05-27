import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { roleLabelAr } from '@/auth/roles';
import { brand } from '@/theme/brand';

export function RoleShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          onPress={async () => {
            await signOut();
            router.replace('/(auth)/login');
          }}
        >
          <Text style={styles.logout}>خروج</Text>
        </Pressable>
        <View style={styles.meta}>
          <Text style={styles.title}>{title}</Text>
          {user ? (
            <Text style={styles.user}>
              {user.fullName} · {roleLabelAr(user.safariRole)}
            </Text>
          ) : null}
        </View>
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
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: brand.colors.primaryBlue,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  meta: { flex: 1, alignItems: 'flex-end', gap: 4 },
  title: {
    color: brand.colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  user: {
    color: brand.colors.lightCyan,
    fontSize: 13,
  },
  logout: {
    color: brand.colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    padding: 20,
  },
});
