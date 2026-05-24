import { useState } from 'react';
import { initLlama, LlamaContext } from 'llama.rn';

export function useEmbedder() {
  const [context, setContext] = useState<LlamaContext | null>(null);
  const [isEmbedderLoading, setIsEmbedderLoading] = useState(false);
  const [embedderError, setEmbedderError] = useState<string | null>(null);

  const initEmbedder = async (modelPath: string) => {
    setIsEmbedderLoading(true);
    setEmbedderError(null);
    try {
      if (context) {
        await context.release();
        setContext(null);
      }
      const newContext = await initLlama({
        model: modelPath,
        embedding: true,
        pooling_type: 'mean',
        n_ctx: 2048,
        n_gpu_layers: 0,
      });
      setContext(newContext);
    } catch (err: any) {
      setEmbedderError(err?.message || 'Failed to load embedding model.');
    } finally {
      setIsEmbedderLoading(false);
    }
  };

  const embed = async (text: string): Promise<number[]> => {
    if (!context) {
      throw new Error('Embedding model not loaded.');
    }
    const result = await context.embedding(text);
    return result.embedding;
  };

  return {
    isEmbedderReady: !!context,
    isEmbedderLoading,
    embedderError,
    initEmbedder,
    embed,
  };
}
