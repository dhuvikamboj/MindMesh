import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';

import { getDb, initDatabase } from '@/lib/db';

export default function IndexRedirect() {
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    initDatabase()
      .then(async () => {
        const result = await getDb().execute(
          `SELECT value FROM app_meta WHERE key = 'onboarding_done';`
        );
        setOnboardingDone((result.rows?.length ?? 0) > 0);
      })
      .catch(() => {
        // DB not ready — skip onboarding
        setOnboardingDone(true);
      });
  }, []);

  if (onboardingDone === null) {
    // Splash is still visible; return null while checking
    return null;
  }

  return onboardingDone ? <Redirect href="/chat" /> : <Redirect href="/onboarding" />;
}
