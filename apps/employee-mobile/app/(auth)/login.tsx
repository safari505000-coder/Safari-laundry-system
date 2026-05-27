import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { homeHrefForRole } from '@/auth/roles';
import { Card, MutedText, PrimaryButton, Screen, Subtitle, Title } from '@/components/ui';
import { brand } from '@/theme/brand';

export default function LoginScreen() {
  const { status, user, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={brand.colors.primaryBlue} />
      </View>
    );
  }

  if (status === 'authenticated' && user) {
    return <Redirect href={homeHrefForRole(user.safariRole)} />;
  }

  async function handleSubmit() {
    setError(null);
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setError('أدخل اسم المستخدم وكلمة المرور.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn({ username: trimmedUser, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.brandMark}>
          <Text style={styles.brandInitial}>S</Text>
        </View>
        <View style={styles.header}>
          <Title>{brand.nameAr}</Title>
          <Subtitle>بوابة الموظفين — نفس حساب نظام SAFARI ERP</Subtitle>
        </View>

        <Card>
          <Text style={styles.cardEyebrow}>Staff Access</Text>
          <Text style={styles.label}>اسم المستخدم</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            textAlign="right"
            style={styles.input}
            placeholder="username"
            placeholderTextColor={brand.colors.textMuted}
          />

          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textAlign="right"
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={brand.colors.textMuted}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <PrimaryButton
            label={submitting ? 'جاري الدخول…' : 'دخول'}
            onPress={handleSubmit}
            disabled={submitting}
          />

          <MutedText>
            لا يُحسب أي مبلغ داخل التطبيق. كل العمليات المالية تمر عبر السيرفر.
          </MutedText>
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'center', gap: 24 },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.colors.grayBackground,
  },
  brandMark: {
    alignSelf: 'flex-end',
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: brand.colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandInitial: {
    color: brand.colors.white,
    fontSize: 26,
    fontWeight: '900',
  },
  header: { gap: 8, alignItems: 'flex-end' },
  cardEyebrow: {
    color: brand.colors.primaryBlue,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'right',
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: brand.colors.text,
    textAlign: 'right',
  },
  input: {
    borderWidth: 1,
    borderColor: brand.colors.border,
    borderRadius: brand.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: brand.colors.text,
    backgroundColor: brand.colors.surfaceMuted,
  },
  error: {
    color: brand.colors.danger,
    textAlign: 'right',
    fontSize: 14,
  },
});
