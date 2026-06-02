import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { resolveMobileAppRole } from '@/auth/roles';

export default function WorkerLayout() {
  const { user } = useAuth();
  if (user && resolveMobileAppRole(user.safariRole) !== 'worker') {
    return <Redirect href="/(app)/unsupported" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
