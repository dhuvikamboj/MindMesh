import { useCallback, useEffect, useState } from 'react';

import { getDb, initDatabase } from '@/lib/db';
import { KnowledgeItem } from '@/types/knowledge';

const DIGEST_META_KEY = 'last_digest_at';
const DEFAULT_INTERVAL_HOURS = 20;

export function useDigest(intervalHours: number = DEFAULT_INTERVAL_HOURS) {
  const [isDigestDue, setIsDigestDue] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await initDatabase();
        const result = await getDb().execute(
          `SELECT value FROM app_meta WHERE key = ?;`,
          [DIGEST_META_KEY]
        );
        const lastAt = (result.rows?.[0] as { value?: string } | undefined)?.value;
        if (!lastAt) {
          if (active) setIsDigestDue(true);
          return;
        }
        const hoursSince = (Date.now() - new Date(lastAt).getTime()) / 3_600_000;
        if (active) setIsDigestDue(hoursSince >= intervalHours);
      } catch {
        // degrade gracefully — skip digest on error
      }
    })();
    return () => {
      active = false;
    };
  }, [intervalHours]);

  const markDigestDone = useCallback(async () => {
    const now = new Date().toISOString();
    try {
      await getDb().execute(
        `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?);`,
        [DIGEST_META_KEY, now]
      );
    } catch {
      // ignore
    }
    setIsDigestDue(false);
  }, []);

  /**
   * Build a prompt asking the model to summarise recent (last 7-day) knowledge items.
   * Caller passes this to model.complete / runPrompt.
   */
  const buildDigestPrompt = useCallback((items: KnowledgeItem[]): string => {
    const cutoff = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const recent = items
      .filter((i) => i.status === 'ready' && i.createdAt >= cutoff)
      .slice(0, 10);

    if (!recent.length) {
      return (
        'No new notes were captured in the past week. ' +
        'Write a short, warm message encouraging the user to start capturing ideas today.'
      );
    }

    const list = recent
      .map((i) => `- ${i.title}: ${i.summary || (i.content ?? '').slice(0, 80)}`)
      .join('\n');

    return [
      'Write a concise daily digest (4–6 sentences).',
      'Identify the main theme across these recent notes, highlight one interesting connection between them, and suggest one concrete next action for the user.',
      'Be specific — reference real note titles. Do not use generic filler.',
      '',
      'Recent notes:',
      list,
    ].join('\n');
  }, []);

  return { isDigestDue, markDigestDone, buildDigestPrompt };
}
