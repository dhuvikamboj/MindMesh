import { useCallback, useEffect, useState } from 'react';

import { getDb, initDatabase } from '@/lib/db';

const PROFILE_KEY = 'user_profile';
const MAX_LEN = 1500;

export function useUserProfile() {
  const [profile, setProfileState] = useState<string>('');
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let isActive = true;

    (async () => {
      try {
        await initDatabase();
        const result = await getDb().execute(
          `SELECT value FROM app_meta WHERE key = ?;`,
          [PROFILE_KEY]
        );
        if (isActive) {
          const rows = (result.rows ?? []) as { value?: string }[];
          setProfileState(rows[0]?.value ?? '');
        }
      } catch {
        if (isActive) {
          setProfileState('');
        }
      } finally {
        if (isActive) {
          setIsHydrating(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const setProfile = useCallback(async (text: string) => {
    const trimmed = text.trim().slice(0, MAX_LEN);
    await getDb().execute(
      `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?);`,
      [PROFILE_KEY, trimmed]
    );
    setProfileState(trimmed);
  }, []);

  const clearProfile = useCallback(async () => {
    await getDb().execute(`DELETE FROM app_meta WHERE key = ?;`, [PROFILE_KEY]);
    setProfileState('');
  }, []);

  return { profile, isHydrating, setProfile, clearProfile };
}
