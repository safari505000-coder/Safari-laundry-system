import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { readOnboardingCompleted } from '@/auth/customer-session';

export default function Index() {
  const [href, setHref] = useState<'/(tabs)' | '/onboarding' | null>(null);

  useEffect(() => {
    void readOnboardingCompleted().then((done) => {
      setHref(done ? '/(tabs)' : '/onboarding');
    });
  }, []);

  if (!href) {
    return null;
  }

  return <Redirect href={href} />;
}
