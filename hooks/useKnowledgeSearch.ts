import { useCallback } from 'react';

import { EMBEDDING_DIM, getDb, isVecEnabled } from '@/lib/db';
import { cosineSimilarity } from '@/lib/memory';

export type KnowledgeHit = { id: string; score: number };

// Suppress unused-import warning — EMBEDDING_DIM is referenced in the vec0 MATCH query
// via the stored schema; we keep the import for future typed queries.
void EMBEDDING_DIM;

export function useKnowledgeSearch() {
  /** Persist an item's text + embedding for future RAG and auto-link queries. */
  const upsertItemEmbedding = useCallback(
    async (itemId: string, contentText: string, embedding: number[]) => {
      const embeddingJson = JSON.stringify(embedding);
      const now = new Date().toISOString();
      await getDb().execute(
        `INSERT OR REPLACE INTO knowledge_embeddings (item_id, content_text, embedding, updated_at)
         VALUES (?, ?, ?, ?);`,
        [itemId, contentText, embeddingJson, now]
      );
      if (isVecEnabled()) {
        try {
          await getDb().execute(
            `INSERT OR REPLACE INTO vec_knowledge (item_id, embedding) VALUES (?, ?);`,
            [itemId, embeddingJson]
          );
        } catch {
          // vec table optional — JS cosine fallback works without it
        }
      }
    },
    []
  );

  /**
   * Return top-k knowledge items by semantic similarity.
   * Excludes `excludeId` so a note doesn't match itself.
   */
  const searchSimilarItems = useCallback(
    async (
      queryEmbedding: number[],
      limit: number,
      excludeId?: string
    ): Promise<KnowledgeHit[]> => {
      const queryJson = JSON.stringify(queryEmbedding);
      const fetchLimit = limit + (excludeId ? 1 : 0);

      if (isVecEnabled()) {
        try {
          const result = await getDb().execute(
            `SELECT item_id AS id, distance
             FROM vec_knowledge
             WHERE embedding MATCH ?
             ORDER BY distance
             LIMIT ?;`,
            [queryJson, fetchLimit]
          );
          const rows = (result.rows ?? []) as { id: string; distance: number }[];
          return rows
            .filter((r) => !excludeId || r.id !== excludeId)
            .slice(0, limit)
            .map((r) => ({ id: r.id, score: 1 - r.distance }));
        } catch {
          // fall through to JS cosine
        }
      }

      // JS cosine fallback
      const result = await getDb().execute(
        `SELECT item_id AS id, embedding FROM knowledge_embeddings;`
      );
      const rows = (result.rows ?? []) as { id: string; embedding: string }[];
      return rows
        .filter((r) => !excludeId || r.id !== excludeId)
        .map((r) => ({
          id: r.id,
          score: cosineSimilarity(JSON.parse(r.embedding), queryEmbedding),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
    []
  );

  return { upsertItemEmbedding, searchSimilarItems };
}
