import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { roleLabelAr } from '@/auth/roles';
import { MutedText, PrimaryButton, Screen, Subtitle, SurfaceCard, Title } from '@/components/ui';

export default function UnsupportedRoleScreen() {
  const { user, signOut } = useAuth();

  return (
    <Screen>
      <View style={styles.wrap}>
        <SurfaceCard>
          <Title>الدور غير مدعوم بعد</Title>
          <Subtitle>
            حسابك ({user ? roleLabelAr(user.safariRole) : '—'}) لم يُفعّل على
            تطبيق الموظفين بعد. استخدم نظام الويب أو تواصل مع الإدارة.
          </Subtitle>
          <PrimaryButton
            label="تسجيل خروج"
            onPress={async () => {
              await signOut();
              router.replace('/(auth)/login');
            }}
          />
          <Pressable onPress={() => router.replace('/')}>
            <MutedText>العودة للرئيسية</MutedText>
          </Pressable>
        </SurfaceCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center' },
});
