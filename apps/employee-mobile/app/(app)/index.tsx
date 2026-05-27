import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { homeHrefForRole } from '@/auth/roles';

/** Sends authenticated users to their role home. */
export default function AppIndex() {
  const { user } = useAuth();
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  return <Redirect href={homeHrefForRole(user.safariRole)} />;
}
