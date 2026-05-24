import { KnowledgeItem, KnowledgeItemType, MetadataExtraction, MindMapEdge, MindMapNode } from '@/types/knowledge';

export const getItemAccent = (type: KnowledgeItemType) => {
  switch (type) {
    case 'note':
      return '#2457F5';
    case 'image':
      return '#F97316';
    case 'audio':
      return '#109D75';
    default:
      return '#2457F5';
  }
};

export const getStatusTone = (status: KnowledgeItem['status']) => {
  switch (status) {
    case 'ready':
      return '#DDF7ED';
    case 'needs-review':
      return '#FFF1CC';
    case 'queued':
      return '#E9EEFF';
    default:
      return '#EEF2FF';
  }
};

export const buildMindMap = (items: KnowledgeItem[]) => {
  const nodes: MindMapNode[] = items.map((item) => ({
    id: item.id,
    label: item.title,
    type: item.type,
    x: item.coordinates.x,
    y: item.coordinates.y,
    status: item.status,
  }));

  const edges: MindMapEdge[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    for (const link of item.links) {
      const pair = [item.id, link].slice().sort().join(':');
      if (seen.has(pair)) {
        continue;
      }

      seen.add(pair);
      edges.push({
        id: pair,
        from: item.id,
        to: link,
        label: sharedTopicsLabel(item, items.find((candidate) => candidate.id === link)),
      });
    }
  }

  return { nodes, edges };
};

const sharedTopicsLabel = (left: KnowledgeItem, right?: KnowledgeItem) => {
  if (!right) {
    return 'related';
  }

  const sharedTopic = left.topics.find((topic) => right.topics.includes(topic));
  const sharedTag = left.tags.find((tag) => right.tags.includes(tag));

  return sharedTopic ?? sharedTag ?? 'related';
};

export const METADATA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    people: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string' } },
    actionItems: { type: 'array', items: { type: 'string' } },
    links: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    transcript: { type: 'string' },
    status: { type: 'string', enum: ['ready', 'needs-review'] },
    confidence: { type: 'number' },
  },
  required: ['title', 'summary', 'tags', 'topics', 'status', 'confidence'],
} as const;

export const buildMetadataPrompt = (item: KnowledgeItem, allItems: KnowledgeItem[]) => {
  const linkLines = allItems
    .filter((candidate) => candidate.id !== item.id)
    .slice(0, 24)
    .map((candidate) => `- ${candidate.id}: ${candidate.title} [${candidate.type}]`)
    .join('\n');

  return [
    'You are a local knowledge curator running on-device.',
    '',
    'Task:',
    '1. Extract a short title.',
    '2. Write a 2 sentence summary.',
    '3. Return tags, people, topics, action items, and confidence.',
    '4. Suggest up to 3 links to existing memory IDs when the semantic overlap is strong.',
    '5. If the item is an image or audio file and the text evidence is weak, keep confidence low and mark status as "needs-review".',
    '',
    'Memory item:',
    `- id: ${item.id}`,
    `- type: ${item.type}`,
    `- title: ${item.title}`,
    `- summary: ${item.summary}`,
    `- content: ${item.content ?? 'n/a'}`,
    `- description: ${item.description ?? 'n/a'}`,
    `- transcript: ${item.transcript ?? 'n/a'}`,
    `- file name: ${item.fileName ?? 'n/a'}`,
    `- mime type: ${item.mimeType ?? 'n/a'}`,
    `- file size: ${item.fileSize ?? 'n/a'}`,
    `- existing tags: ${item.tags.join(', ') || 'none'}`,
    `- existing topics: ${item.topics.join(', ') || 'none'}`,
    '',
    'Available memory IDs for linking:',
    linkLines || '- none',
    '',
    'Return strict JSON with this shape:',
    '{',
    '  "title": "string",',
    '  "summary": "string",',
    '  "tags": ["string"],',
    '  "people": ["string"],',
    '  "topics": ["string"],',
    '  "actionItems": ["string"],',
    '  "links": ["memory-id"],',
    '  "description": "string",',
    '  "transcript": "string",',
    '  "status": "ready | needs-review",',
    '  "confidence": 0.0',
    '}',
    '',
    'Rules:',
    '- Output only the JSON object.',
    '- No markdown fences, no comments, no text before or after the JSON.',
    '- Start the response with { and end it with }.',
  ].join('\n');
};

export const buildWorkspacePrompt = (items: KnowledgeItem[]) => {
  const ids = items.map((item) => `- ${item.id}: ${item.title} [${item.type}]`).join('\n');

  return [
    'You are MindMesh, a private local assistant.',
    '',
    'Operating rules:',
    '- Treat notes, images, and audio as one memory system.',
    '- Prefer retrieval, linking, and summarization over generic conversation.',
    '- Surface conflicts, duplicates, and unfinished threads.',
    '- If metadata is uncertain, mark it as review instead of inventing facts.',
    '',
    'Current memory ids:',
    ids || '- none',
  ].join('\n');
};

export const buildImportedSummary = (
  type: KnowledgeItemType,
  fileName: string,
  extractedText?: string
) => {
  if (type === 'note' && extractedText) {
    return extractedText.trim().replace(/\s+/g, ' ').slice(0, 180);
  }

  if (type === 'image') {
    return `Imported image "${fileName}". Add OCR text or scene notes, then run metadata extraction locally.`;
  }

  if (type === 'audio') {
    return `Imported audio "${fileName}". Add transcript or spoken context, then run metadata extraction locally.`;
  }

  return `Imported note "${fileName}". Add more context if needed, then run metadata extraction locally.`;
};

export const getDefaultDescription = (type: KnowledgeItemType, fileName: string) => {
  if (type === 'image') {
    return `Visual capture from ${fileName}. Describe the scene or paste OCR text before enriching.`;
  }

  if (type === 'audio') {
    return `Audio capture from ${fileName}. Paste a transcript or key beats before enriching.`;
  }

  return '';
};

export const createNodeCoordinates = (index: number) => ({
  x: 90 + (index % 4) * 220,
  y: 80 + Math.floor(index / 4) * 140,
});

export const extractJsonObject = (value: string) => {
  const fenced =
    value.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? value.match(/```\s*([\s\S]*?)```/i)?.[1];
  const text = fenced ?? value;

  // Scan for balanced top-level { ... } objects, ignoring braces inside strings.
  // Reasoning models emit thinking traces before the answer, so collect every
  // complete object and prefer the last one that parses.
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
    } else if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(candidates[i]);
    } catch {
      // try the next-earlier candidate
    }
  }

  throw new Error('Model output did not include a JSON object.');
};

export const sanitizeMetadataExtraction = (
  value: unknown,
  validIds: string[]
): MetadataExtraction => {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    title: sanitizeOptionalString(record.title),
    summary: sanitizeOptionalString(record.summary),
    description: sanitizeOptionalString(record.description),
    transcript: sanitizeOptionalString(record.transcript),
    tags: sanitizeStringArray(record.tags),
    people: sanitizeStringArray(record.people),
    topics: sanitizeStringArray(record.topics),
    actionItems: sanitizeStringArray(record.actionItems),
    links: sanitizeStringArray(record.links).filter((id) => validIds.includes(id)),
    status: sanitizeStatus(record.status),
    confidence: sanitizeConfidence(record.confidence),
  };
};

export const applyMetadataExtraction = (
  item: KnowledgeItem,
  extraction: MetadataExtraction
) => {
  const nextStatus =
    extraction.status ??
    (typeof extraction.confidence === 'number' && extraction.confidence >= 0.75
      ? 'ready'
      : 'needs-review');

  const nextItem: KnowledgeItem = {
    ...item,
    title: extraction.title || item.title,
    summary: extraction.summary || item.summary,
    description: extraction.description ?? item.description,
    transcript: extraction.transcript ?? item.transcript,
    tags: uniqueStrings(extraction.tags?.length ? extraction.tags : item.tags),
    people: uniqueStrings(extraction.people?.length ? extraction.people : item.people),
    topics: uniqueStrings(extraction.topics?.length ? extraction.topics : item.topics),
    actionItems: uniqueStrings(extraction.actionItems?.length ? extraction.actionItems : item.actionItems ?? []),
    links: uniqueStrings(extraction.links?.length ? extraction.links : item.links),
    confidence: extraction.confidence ?? item.confidence,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };

  return nextItem;
};

export const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

const sanitizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const sanitizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueStrings(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
};

const sanitizeStatus = (value: unknown): KnowledgeItem['status'] | undefined => {
  if (value === 'ready' || value === 'needs-review') {
    return value;
  }

  return undefined;
};

const sanitizeConfidence = (value: unknown) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values));
