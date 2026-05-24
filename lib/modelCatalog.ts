export type ModelArtifact = {
  fileName: string;
  sizeBytes: number;
  url: string;
};

export type ModelTag = 'vision' | 'reasoning' | 'fast' | 'coding' | 'default' | 'recommended';

export type RuntimeModelBundle = {
  id: string;
  label: string;
  /** Human-readable parameter count, e.g. "1.7B" */
  paramCount: string;
  /** One-line capability description */
  description: string;
  tags: ModelTag[];
  modelFileName: string;
  /** Optional mmproj (multimodal projector) for vision. */
  mmprojFileName?: string;
  artifacts: ModelArtifact[];
};

// ── Default runtime model ──────────────────────────────────────────────────────

export const DEFAULT_RUNTIME_MODEL: RuntimeModelBundle = {
  id: 'gemma-4-e2b-q4km',
  label: 'Gemma 4 E2B',
  paramCount: '2B',
  description: "Google's multimodal Gemma 4 with vision support.",
  tags: ['vision', 'default', 'recommended'],
  modelFileName: 'gemma-4-E2B-it-Q4_K_M.gguf',
  mmprojFileName: 'mmproj-F16.gguf',
  artifacts: [
    {
      fileName: 'gemma-4-E2B-it-Q4_K_M.gguf',
      sizeBytes: 3_106_736_256,
      url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf',
    },
    {
      fileName: 'mmproj-F16.gguf',
      sizeBytes: 985_654_080,
      url: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/mmproj-F16.gguf',
    },
  ],
};

// ── Embedding model (not user-selectable) ─────────────────────────────────────

export const DEFAULT_EMBED_MODEL: RuntimeModelBundle = {
  id: 'nomic-embed-v1.5-q4km',
  label: 'Nomic Embed v1.5 Q4_K_M',
  paramCount: '137M',
  description: 'Embedding model for semantic search.',
  tags: [],
  modelFileName: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
  artifacts: [
    {
      fileName: 'nomic-embed-text-v1.5.Q4_K_M.gguf',
      sizeBytes: 84_106_624,
      url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
    },
  ],
};

// ── Full user-selectable catalog ───────────────────────────────────────────────

export const MODEL_CATALOG: RuntimeModelBundle[] = [
  // ── Gemma ────────────────────────────────────────────────────────────────────
  DEFAULT_RUNTIME_MODEL,

  // ── Qwen3 ────────────────────────────────────────────────────────────────────
  {
    id: 'qwen3-1.7b-q4km',
    label: 'Qwen3 1.7B',
    paramCount: '1.7B',
    description: 'Alibaba Qwen3 with hybrid thinking mode. Punches above weight.',
    tags: ['fast', 'reasoning'],
    modelFileName: 'Qwen3-1.7B-Q4_K_M.gguf',
    artifacts: [
      {
        fileName: 'Qwen3-1.7B-Q4_K_M.gguf',
        sizeBytes: 1_124_073_472,
        url: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf',
      },
    ],
  },
  {
    id: 'qwen3-4b-q4km',
    label: 'Qwen3 4B',
    paramCount: '4B',
    description: 'Best-in-class at 4B. Beats many 7B models. Hybrid thinking mode.',
    tags: ['reasoning', 'recommended'],
    modelFileName: 'Qwen3-4B-Q4_K_M.gguf',
    artifacts: [
      {
        fileName: 'Qwen3-4B-Q4_K_M.gguf',
        sizeBytes: 2_684_354_560,
        url: 'https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
      },
    ],
  },

  // ── Qwen2.5 ──────────────────────────────────────────────────────────────────
  {
    id: 'qwen2.5-1.5b-instruct-q4km',
    label: 'Qwen2.5 1.5B Instruct',
    paramCount: '1.5B',
    description: 'Excellent instruction following and tool calling for 1.5B.',
    tags: ['fast'],
    modelFileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    artifacts: [
      {
        fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
        sizeBytes: 986_049_536,
        url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
      },
    ],
  },
  {
    id: 'qwen2.5-3b-instruct-q4km',
    label: 'Qwen2.5 3B Instruct',
    paramCount: '3B',
    description: 'Solid balance of quality and speed. Strong multilingual support.',
    tags: [],
    modelFileName: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
    artifacts: [
      {
        fileName: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        sizeBytes: 1_930_371_072,
        url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf',
      },
    ],
  },

  // ── Phi-4 ─────────────────────────────────────────────────────────────────────
  {
    id: 'phi4-mini-instruct-q4km',
    label: 'Phi-4 Mini Instruct',
    paramCount: '3.8B',
    description: "Microsoft Phi-4 mini — top benchmark scorer at ≤4B. Strong reasoning.",
    tags: ['reasoning', 'recommended'],
    modelFileName: 'Phi-4-mini-instruct-Q4_K_M.gguf',
    artifacts: [
      {
        fileName: 'Phi-4-mini-instruct-Q4_K_M.gguf',
        sizeBytes: 2_494_646_272,
        url: 'https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf',
      },
    ],
  },
  {
    id: 'phi4-mini-reasoning-q4km',
    label: 'Phi-4 Mini Reasoning',
    paramCount: '3.8B',
    description: 'Chain-of-thought reasoning variant of Phi-4 mini. Best for logic tasks.',
    tags: ['reasoning'],
    modelFileName: 'Phi-4-mini-reasoning-Q4_K_M.gguf',
    artifacts: [
      {
        fileName: 'Phi-4-mini-reasoning-Q4_K_M.gguf',
        sizeBytes: 2_494_646_272,
        url: 'https://huggingface.co/unsloth/Phi-4-mini-reasoning-GGUF/resolve/main/Phi-4-mini-reasoning-Q4_K_M.gguf',
      },
    ],
  },

  // ── Llama 3.2 ─────────────────────────────────────────────────────────────────
  {
    id: 'llama-3.2-1b-instruct-q4km',
    label: 'Llama 3.2 1B Instruct',
    paramCount: '1B',
    description: 'Ultra-light Meta model. Fastest inference, works on older devices.',
    tags: ['fast'],
    modelFileName: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    artifacts: [
      {
        fileName: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        sizeBytes: 847_249_408,
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
      },
    ],
  },
  {
    id: 'llama-3.2-3b-instruct-q4km',
    label: 'Llama 3.2 3B Instruct',
    paramCount: '3B',
    description: 'Meta Llama 3.2 3B — strong multilingual, good general assistant.',
    tags: [],
    modelFileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    artifacts: [
      {
        fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        sizeBytes: 2_169_470_976,
        url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
      },
    ],
  },

  // ── SmolLM2 ───────────────────────────────────────────────────────────────────
  {
    id: 'smollm2-1.7b-instruct-q4km',
    label: 'SmolLM2 1.7B Instruct',
    paramCount: '1.7B',
    description: "HuggingFace's own SLM. Clean Apache 2.0. Fast, capable for size.",
    tags: ['fast'],
    modelFileName: 'smollm2-1.7b-instruct-q4_k_m.gguf',
    artifacts: [
      {
        fileName: 'smollm2-1.7b-instruct-q4_k_m.gguf',
        sizeBytes: 1_073_741_824,
        url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/main/smollm2-1.7b-instruct-q4_k_m.gguf',
      },
    ],
  },
];
