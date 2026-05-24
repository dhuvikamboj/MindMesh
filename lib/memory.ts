import { UserFact } from '@/types/agent';

export const cosineSimilarity = (a: number[], b: number[]): number => {
  if (!a.length || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

export type RankedFact = { fact: UserFact; score: number };

export const rankFacts = (
  facts: UserFact[],
  queryEmbedding: number[],
  limit: number
): RankedFact[] =>
  facts
    .map((fact) => ({ fact, score: cosineSimilarity(fact.embedding, queryEmbedding) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
