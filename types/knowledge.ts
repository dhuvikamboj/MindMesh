export type KnowledgeItemType = 'note' | 'image' | 'audio';

export type ItemStatus = 'ready' | 'needs-review' | 'queued';

export type KnowledgeItem = {
  id: string;
  title: string;
  type: KnowledgeItemType;
  status: ItemStatus;
  createdAt: string;
  updatedAt?: string;
  sourceUri?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  summary: string;
  content?: string;
  description?: string;
  transcript?: string;
  tags: string[];
  people: string[];
  topics: string[];
  actionItems?: string[];
  confidence?: number;
  links: string[];
  coordinates: {
    x: number;
    y: number;
  };
  debug?: {
    prompt: string;
    response: string;
    enrichedAt: string;
  };
};

export type MindMapNode = {
  id: string;
  label: string;
  type: KnowledgeItemType;
  x: number;
  y: number;
  status: ItemStatus;
};

export type MindMapEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
};

export type MetadataExtraction = {
  title?: string;
  summary?: string;
  tags?: string[];
  people?: string[];
  topics?: string[];
  actionItems?: string[];
  links?: string[];
  description?: string;
  transcript?: string;
  status?: ItemStatus;
  confidence?: number;
};
