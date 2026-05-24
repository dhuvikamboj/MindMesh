import { useCallback, useEffect, useState } from 'react';

import { getDb, initDatabase, isVecEnabled } from '@/lib/db';
import { cosineSimilarity } from '@/lib/memory';
import { UserFact } from '@/types/agent';

export type MemoryHit = { id: string; text: string; score: number };

export function useMemory() {
  const [facts, setFacts] = useState<UserFact[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let isActive = true;

    (async () => {
      try {
        await initDatabase();
        const result = await getDb().execute(
          `SELECT id, text, created_at FROM user_facts ORDER BY created_at DESC;`
        );
        if (isActive) {
          const rows = (result.rows ?? []) as {
            id: string;
            text: string;
            created_at: string;
          }[];
          setFacts(
            rows.map((row) => ({
              id: row.id,
              text: row.text,
              embedding: [],
              createdAt: row.created_at,
            }))
          );
        }
      } catch {
        if (isActive) {
          setFacts([]);
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

  const addFact = useCallback(
    async (text: string, embedding: number[]): Promise<UserFact> => {
      const fact: UserFact = {
        id: `fact-${Date.now()}`,
        text: text.trim(),
        embedding: [],
        createdAt: new Date().toISOString(),
      };
      const embeddingJson = JSON.stringify(embedding);

      await getDb().execute(
        `INSERT OR REPLACE INTO user_facts (id, text, embedding, created_at) VALUES (?, ?, ?, ?);`,
        [fact.id, fact.text, embeddingJson, fact.createdAt]
      );
      if (isVecEnabled()) {
        try {
          await getDb().execute(
            `INSERT OR REPLACE INTO vec_facts (fact_id, embedding) VALUES (?, ?);`,
            [fact.id, embeddingJson]
          );
        } catch {
          // vec table optional — JS cosine fallback still works
        }
      }
      setFacts((current) => [fact, ...current]);
      return fact;
    },
    []
  );

  const recall = useCallback(
    async (queryEmbedding: number[], limit: number): Promise<MemoryHit[]> => {
      const queryJson = JSON.stringify(queryEmbedding);

      if (isVecEnabled()) {
        try {
          const result = await getDb().execute(
            `SELECT v.fact_id AS id, f.text AS text, v.distance AS distance
             FROM vec_facts v
             JOIN user_facts f ON f.id = v.fact_id
             WHERE v.embedding MATCH ? ORDER BY v.distance LIMIT ?;`,
            [queryJson, limit]
          );
          const rows = (result.rows ?? []) as {
            id: string;
            text: string;
            distance: number;
          }[];
          return rows.map((row) => ({ id: row.id, text: row.text, score: 1 - row.distance }));
        } catch {
          // fall through to JS cosine
        }
      }

      const result = await getDb().execute(`SELECT id, text, embedding FROM user_facts;`);
      const rows = (result.rows ?? []) as { id: string; text: string; embedding: string }[];
      return rows
        .map((row) => ({
          id: row.id,
          text: row.text,
          score: cosineSimilarity(JSON.parse(row.embedding), queryEmbedding),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, limit);
    },
    []
  );

  const clearMemory = useCallback(async () => {
    await getDb().execute(`DELETE FROM user_facts;`);
    if (isVecEnabled()) {
      try {
        await getDb().execute(`DELETE FROM vec_facts;`);
      } catch {
        // ignore
      }
    }
    setFacts([]);
  }, []);

  return { facts, isHydrating, addFact, clearMemory, recall };
}
