import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentPickerAsset } from 'expo-document-picker';

import { getDb, initDatabase, isVecEnabled } from '@/lib/db';
import {
  buildImportedSummary,
  createNodeCoordinates,
  getDefaultDescription,
} from '@/lib/knowledge';
import {
  copyAssetToStorage,
  getFileInfo,
  readTextFileSnippet,
} from '@/lib/storage';
import { KnowledgeItem, KnowledgeItemType, MetadataExtraction } from '@/types/knowledge';

type UseKnowledgeBaseResult = {
  items: KnowledgeItem[];
  isHydrating: boolean;
  isPersisting: boolean;
  storageError: string | null;
  lastSavedAt: string | null;
  addQuickNote: (params: { body: string; title: string; linkToId?: string }) => Promise<KnowledgeItem>;
  importAsset: (asset: DocumentPickerAsset, linkToId?: string) => Promise<KnowledgeItem>;
  updateItem: (id: string, updates: Partial<KnowledgeItem>) => void;
  applyMetadata: (id: string, extraction: MetadataExtraction) => void;
  deleteItem: (id: string) => Promise<void>;
};

export function useKnowledgeBase(): UseKnowledgeBaseResult {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isPersisting, setIsPersisting] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const itemsRef = useRef<KnowledgeItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    let isActive = true;

    (async () => {
      setIsHydrating(true);
      setStorageError(null);
      try {
        await initDatabase();
        const result = await getDb().execute(
          `SELECT data FROM knowledge_items ORDER BY updated_at DESC;`
        );
        if (!isActive) {
          return;
        }
        const rows = (result.rows ?? []) as { data: string }[];
        setItems(rows.map((row) => JSON.parse(row.data) as KnowledgeItem));
      } catch (error) {
        if (isActive) {
          setItems([]);
          setStorageError(
            error instanceof Error ? error.message : 'Failed to load local library.'
          );
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

  const persistItem = useCallback(async (item: KnowledgeItem) => {
    setIsPersisting(true);
    try {
      await getDb().execute(
        `INSERT OR REPLACE INTO knowledge_items (id, data, updated_at) VALUES (?, ?, ?);`,
        [item.id, JSON.stringify(item), item.updatedAt ?? item.createdAt]
      );
      setLastSavedAt(new Date().toISOString());
      setStorageError(null);
    } catch (error) {
      setStorageError(
        error instanceof Error ? error.message : 'Failed to save the item.'
      );
    } finally {
      setIsPersisting(false);
    }
  }, []);

  const addQuickNote = useCallback(
    async ({ title, body, linkToId }: { body: string; title: string; linkToId?: string }) => {
      const now = new Date().toISOString();
      const newItem: KnowledgeItem = {
        id: `note-${Date.now()}`,
        title: title.trim(),
        type: 'note',
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        summary: body.trim().replace(/\s+/g, ' ').slice(0, 220),
        content: body.trim(),
        description: 'Quick note created inside MindMesh.',
        tags: ['captured'],
        people: ['Me'],
        topics: ['draft'],
        actionItems: [],
        confidence: 0.2,
        links: linkToId ? [linkToId] : [],
        coordinates: createNodeCoordinates(itemsRef.current.length),
      };

      setItems((current) => [newItem, ...current]);
      await persistItem(newItem);
      return newItem;
    },
    [persistItem]
  );

  const importAsset = useCallback(
    async (asset: DocumentPickerAsset, linkToId?: string) => {
      const now = new Date().toISOString();
      const fileName = asset.name ?? 'capture';
      const type = inferItemType(asset.mimeType, fileName);
      const storedUri = await copyAssetToStorage(asset.uri, fileName);
      const info = await getFileInfo(storedUri);
      const extractedText = isTextLike(type, asset.mimeType, fileName)
        ? await safeReadTextSnippet(storedUri)
        : undefined;

      const newItem: KnowledgeItem = {
        id: `item-${Date.now()}`,
        title: fileName.replace(/\.[^.]+$/, ''),
        type,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        sourceUri: storedUri,
        fileName,
        mimeType: asset.mimeType,
        fileSize: info.exists && 'size' in info ? info.size : asset.size,
        summary: buildImportedSummary(type, fileName, extractedText),
        content: type === 'note' ? extractedText : undefined,
        description: type !== 'note' ? getDefaultDescription(type, fileName) : 'Imported note file.',
        transcript: type === 'audio' ? '' : undefined,
        tags: ['inbox'],
        people: [],
        topics: ['new capture'],
        actionItems: defaultActionItems(type, Boolean(extractedText)),
        confidence: extractedText ? 0.45 : 0.12,
        links: linkToId ? [linkToId] : [],
        coordinates: createNodeCoordinates(itemsRef.current.length),
      };

      setItems((current) => [newItem, ...current]);
      await persistItem(newItem);
      return newItem;
    },
    [persistItem]
  );

  const updateItem = useCallback(
    (id: string, updates: Partial<KnowledgeItem>) => {
      const existing = itemsRef.current.find((item) => item.id === id);
      if (!existing) {
        return;
      }
      const merged: KnowledgeItem = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      setItems((current) => current.map((item) => (item.id === id ? merged : item)));
      persistItem(merged);
    },
    [persistItem]
  );

  const applyMetadata = useCallback(
    (id: string, extraction: MetadataExtraction) => {
      const existing = itemsRef.current.find((item) => item.id === id);
      if (!existing) {
        return;
      }
      const merged: KnowledgeItem = {
        ...existing,
        ...extraction,
        tags: extraction.tags?.length ? extraction.tags : existing.tags,
        people: extraction.people?.length ? extraction.people : existing.people,
        topics: extraction.topics?.length ? extraction.topics : existing.topics,
        actionItems: extraction.actionItems?.length
          ? extraction.actionItems
          : existing.actionItems,
        links: extraction.links?.length ? extraction.links : existing.links,
        updatedAt: new Date().toISOString(),
      };
      setItems((current) => current.map((item) => (item.id === id ? merged : item)));
      persistItem(merged);
    },
    [persistItem]
  );

  const deleteItem = useCallback(async (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      await getDb().execute(`DELETE FROM knowledge_items WHERE id = ?;`, [id]);
      await getDb().execute(`DELETE FROM knowledge_embeddings WHERE item_id = ?;`, [id]);
      if (isVecEnabled()) {
        try {
          await getDb().execute(`DELETE FROM vec_knowledge WHERE item_id = ?;`, [id]);
        } catch {
          // ignore
        }
      }
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Failed to delete item.');
    }
  }, []);

  return {
    items,
    isHydrating,
    isPersisting,
    storageError,
    lastSavedAt,
    addQuickNote,
    importAsset,
    updateItem,
    applyMetadata,
    deleteItem,
  };
}

function inferItemType(mimeType?: string, name?: string): KnowledgeItemType {
  const lowerMime = mimeType?.toLowerCase() ?? '';
  const lowerName = name?.toLowerCase() ?? '';

  if (lowerMime.startsWith('audio/') || /\.(m4a|mp3|wav|aac|ogg|flac)$/.test(lowerName)) {
    return 'audio';
  }
  if (lowerMime.startsWith('image/') || /\.(png|jpg|jpeg|heic|webp|gif)$/.test(lowerName)) {
    return 'image';
  }
  return 'note';
}

function isTextLike(type: KnowledgeItemType, mimeType?: string, name?: string) {
  if (type !== 'note') {
    return false;
  }

  const lowerMime = mimeType?.toLowerCase() ?? '';
  const lowerName = name?.toLowerCase() ?? '';

  return (
    lowerMime.startsWith('text/') ||
    /\.(txt|md|markdown|json|csv|tsv|js|ts|tsx|jsx)$/.test(lowerName)
  );
}

async function safeReadTextSnippet(uri: string) {
  try {
    return await readTextFileSnippet(uri);
  } catch {
    return undefined;
  }
}

function defaultActionItems(type: KnowledgeItemType, hasText: boolean) {
  if (type === 'image') {
    return ['Add OCR text or scene notes', 'Run metadata extraction'];
  }
  if (type === 'audio') {
    return ['Paste transcript or summary', 'Run metadata extraction'];
  }
  return hasText ? ['Run metadata extraction'] : ['Add note content'];
}
