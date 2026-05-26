import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { useChatSessions } from '@/hooks/useChatSessions';
import { useDigest } from '@/hooks/useDigest';
import { useModelSettings } from '@/hooks/useModelSettings';
import { useEmbedder } from '@/hooks/useEmbedder';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { useKnowledgeSearch } from '@/hooks/useKnowledgeSearch';
import { ContentPart, useLlama } from '@/hooks/useLlama';
import { useMemory } from '@/hooks/useMemory';
import { useUserProfile } from '@/hooks/useUserProfile';
import {
  applyMetadataExtraction,
  buildMetadataPrompt,
  buildWorkspacePrompt,
  extractJsonObject,
  sanitizeMetadataExtraction,
} from '@/lib/knowledge';
import { applyDownloadConfig } from '@/lib/downloadConfig';
import { AGENT_TOOLS, buildAgentSystemPrompt } from '@/lib/agent';
import { DEFAULT_EMBED_MODEL, DEFAULT_RUNTIME_MODEL, EMBED_CATALOG, MODEL_CATALOG, RuntimeModelBundle } from '@/lib/modelCatalog';
import * as FileSystem from 'expo-file-system/legacy';

import {
  clearDownloadSnapshot,
  downloadModelArtifact,
  DownloadSnapshot,
  getModelArtifactUri,
  getPresentModelUri,
  loadDownloadSnapshot,
  prefetchArtifactSizes,
  saveDownloadSnapshot,
} from '@/lib/modelStorage';
import { ChatTurn } from '@/types/agent';
import { KnowledgeItem } from '@/types/knowledge';

type LlamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  tool_call_id?: string;
  tool_calls?: unknown[];
};

type AssistantContextValue = ReturnType<typeof useAssistantWorkspace>;

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const value = useAssistantWorkspace();
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) {
    throw new Error('useAssistant must be used inside AssistantProvider.');
  }
  return value;
}

type LinkSuggestion = {
  fromId: string;
  toId: string;
  fromTitle: string;
  toTitle: string;
};

function useAssistantWorkspace() {
  const knowledge = useKnowledgeBase();
  const model = useLlama();
  const embedder = useEmbedder();
  const memory = useMemory();
  const chat = useChatSessions();
  const userProfile = useUserProfile();
  const knowledgeSearch = useKnowledgeSearch();
  const modelSettings = useModelSettings();
  const digest = useDigest(modelSettings.settings.digestIntervalHours);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Success banners auto-clear so they don't linger forever.
  useEffect(() => {
    if (!statusMessage) {
      return;
    }
    const timer = setTimeout(() => setStatusMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);
  const [isImporting, setIsImporting] = useState(false);
  const [isEnrichingId, setIsEnrichingId] = useState<string | null>(null);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [activeModelId, setActiveModelId] = useState<string | null>(DEFAULT_RUNTIME_MODEL.id);

  // Embed-model download state (separate from runtime model to allow both to run)
  const [isEmbedDownloading, setIsEmbedDownloading] = useState(false);
  const [embedDownloadProgress, setEmbedDownloadProgress] = useState(0);
  const [downloadingEmbedModelId, setDownloadingEmbedModelId] = useState<string | null>(null);
  const [isEmbedDownloadPaused, setIsEmbedDownloadPaused] = useState(false);
  const [activeEmbedModelId, setActiveEmbedModelId] = useState<string | null>(DEFAULT_EMBED_MODEL.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeEmbedDownloadTaskRef = useRef<any>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [pendingLinkSuggestion, setPendingLinkSuggestion] = useState<LinkSuggestion | null>(null);
  const [pendingImageAttachment, setPendingImageAttachment] = useState<{
    noteId: string;
    noteTitle: string;
    availableImages: string[];
  } | null>(null);
  const imageAttachResolveRef = useRef<((uris: string[]) => void) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeDownloadTaskRef = useRef<any>(null);
  const didAutoLoadRef = useRef(false);
  const didResumeCheckRef = useRef(false);
  const [isDownloadPaused, setIsDownloadPaused] = useState(false);

  // Auto-resume any download that was interrupted by an app kill or crash.
  useEffect(() => {
    if (didResumeCheckRef.current) return;
    didResumeCheckRef.current = true;

    loadDownloadSnapshot().then((snapshot) => {
      if (!snapshot) return;
      const bundle = MODEL_CATALOG.find((b) => b.id === snapshot.bundleId);
      if (bundle) {
        downloadModel(bundle, snapshot);
      } else {
        clearDownloadSnapshot();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the app returns to foreground during an active download, update the
  // progress bar to reflect bytes that landed while we were backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      if (!isDownloadingModel || !downloadingModelId) return;

      const bundle = MODEL_CATALOG.find((b) => b.id === downloadingModelId);
      if (!bundle) return;

      // Check if all artifacts arrived in the background.
      const presenceChecks = await Promise.all(
        bundle.artifacts.map((a) => getPresentModelUri(a.fileName, a.sizeBytes))
      );
      const allPresent = presenceChecks.every(Boolean);
      if (allPresent) {
        setDownloadProgress(1);
      }
    });
    return () => sub.remove();
  }, [isDownloadingModel, downloadingModelId]);

  // Apply background-downloader global config whenever the WiFi-only pref changes.
  // Also runs on mount (after settings are loaded) to apply the persisted value.
  useEffect(() => {
    if (!modelSettings.isSettingsLoaded) return;
    applyDownloadConfig(modelSettings.settings.wifiOnlyDownloads);
  }, [modelSettings.isSettingsLoaded, modelSettings.settings.wifiOnlyDownloads]);

  useEffect(() => {
    if (didAutoLoadRef.current) {
      return;
    }
    didAutoLoadRef.current = true;

    (async () => {
      let gemmaUri: string | null = null;
      try {
        gemmaUri = await getPresentModelUri(
          DEFAULT_RUNTIME_MODEL.modelFileName,
          DEFAULT_RUNTIME_MODEL.artifacts.find((a) => a.fileName === DEFAULT_RUNTIME_MODEL.modelFileName)?.sizeBytes ?? 0
        );
        if (gemmaUri) {
          setStatusMessage('Loading local model.');
          const mmprojFile = DEFAULT_RUNTIME_MODEL.mmprojFileName;
          const mmprojUri = mmprojFile
            ? (await getPresentModelUri(
                mmprojFile,
                DEFAULT_RUNTIME_MODEL.artifacts.find((a) => a.fileName === mmprojFile)?.sizeBytes ?? 0
              )) ?? undefined
            : undefined;
          await model.initModel(gemmaUri, mmprojUri);
          setStatusMessage(
            mmprojUri ? 'Local model attached (vision enabled).' : 'Local model attached.'
          );
        }
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Failed to load the local model.'
        );
      }

      // Load embed model if already on disk — independent of which runtime model
      // is active. Don't auto-download here; onboarding step 3 and the embed
      // catalog screen own that flow.
      try {
        const embedUri = await getPresentModelUri(
          DEFAULT_EMBED_MODEL.modelFileName,
          DEFAULT_EMBED_MODEL.artifacts[0]?.sizeBytes ?? 0
        );
        if (embedUri) {
          await embedder.initEmbedder(embedUri);
          setActiveEmbedModelId(DEFAULT_EMBED_MODEL.id);
        }
      } catch {
        // Memory tools degrade gracefully if the embedding model is unavailable.
      }
    })();
  }, [model, embedder]);

  const reviewItems = useMemo(
    () => knowledge.items.filter((item) => item.status !== 'ready'),
    [knowledge.items]
  );

  const readyItems = useMemo(
    () => knowledge.items.filter((item) => item.status === 'ready'),
    [knowledge.items]
  );

  const pickModel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync();
      if (result.canceled || !('assets' in result) || result.assets.length === 0) {
        return;
      }

      let uri = result.assets[0].uri;
      if (!uri.startsWith('file://')) {
        uri = `file://${uri}`;
      }

      await model.initModel(uri);
      setStatusMessage('Local model attached.');
      setActionError(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to attach local model.');
    }
  };

  /** Download + load any catalog model. Also seeds the embed model if not yet present.
   *  Pass a pre-loaded `snapshot` to resume an interrupted download. */
  const downloadModel = async (bundle: RuntimeModelBundle, snapshot?: DownloadSnapshot) => {
    // Auto-load saved snapshot for this bundle so interrupted downloads resume
    // even when the caller doesn't pass one (e.g. user taps Download again).
    if (!snapshot) {
      const saved = await loadDownloadSnapshot();
      if (saved?.bundleId === bundle.id) {
        snapshot = saved;
      }
    }

    setIsDownloadingModel(true);
    setDownloadingModelId(bundle.id);
    setDownloadProgress(0);
    setActionError(null);
    const hasPartial = snapshot?.artifacts.some((a) => !a.completed);
    setStatusMessage(hasPartial ? `Resuming ${bundle.label}…` : `Downloading ${bundle.label}…`);

    try {
      // Fetch exact sizes from server in parallel; fall back to catalog estimates.
      setStatusMessage(`Checking ${bundle.label}…`);
      const exactSizes = await prefetchArtifactSizes(bundle.artifacts);

      const totalBytes = bundle.artifacts.reduce(
        (sum, a) => sum + (exactSizes.get(a.fileName) ?? a.sizeBytes),
        0
      );
      let completedBytes = 0;

      const artifactStates = bundle.artifacts.map((a) => ({
        fileName: a.fileName,
        sizeBytes: exactSizes.get(a.fileName) ?? a.sizeBytes,
        completed: snapshot?.artifacts.find((s) => s.fileName === a.fileName)?.completed ?? false,
      }));

      // Persist snapshot so UI can restore progress on foreground.
      await saveDownloadSnapshot({
        bundleId: bundle.id,
        bundleLabel: bundle.label,
        totalBytes,
        artifacts: artifactStates,
      });

      setStatusMessage(`Downloading ${bundle.label}…`);

      for (let i = 0; i < bundle.artifacts.length; i++) {
        const artifact = bundle.artifacts[i];
        const state = artifactStates[i];

        if (state.completed) {
          completedBytes += state.sizeBytes;
          setDownloadProgress(Math.min(1, completedBytes / totalBytes));
          continue;
        }

        const weight = state.sizeBytes / totalBytes;

        // Native background downloader handles resume automatically.
        await downloadModelArtifact(artifact, {
          onTaskReady: (task) => { activeDownloadTaskRef.current = task; },
          onProgress: (progress) => {
            const normalized = completedBytes / totalBytes + progress * weight;
            setDownloadProgress(Math.min(1, normalized));
          },
        });
        activeDownloadTaskRef.current = null; // artifact done

        artifactStates[i].completed = true;
        completedBytes += state.sizeBytes;
        setDownloadProgress(Math.min(1, completedBytes / totalBytes));
        await saveDownloadSnapshot({
          bundleId: bundle.id,
          bundleLabel: bundle.label,
          totalBytes,
          artifacts: artifactStates,
        });
      }

      const modelUri = getModelArtifactUri(bundle.modelFileName);
      const mmprojUri = bundle.mmprojFileName
        ? getModelArtifactUri(bundle.mmprojFileName)
        : undefined;
      await model.initModel(modelUri, mmprojUri);
      setActiveModelId(bundle.id);
      setStatusMessage(`Ready — ${bundle.label}.`);

      // All done — discard the saved snapshot.
      await clearDownloadSnapshot();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Failed to download ${bundle.label}.`);
    } finally {
      activeDownloadTaskRef.current = null;
      setIsDownloadPaused(false);
      setIsDownloadingModel(false);
      setDownloadingModelId(null);
    }
  };

  /** Load a catalog model that's already been downloaded. */
  const loadCatalogModel = async (bundle: RuntimeModelBundle) => {
    setActionError(null);
    try {
      const modelArtifact = bundle.artifacts.find((a) => a.fileName === bundle.modelFileName);
      const modelUri = await getPresentModelUri(bundle.modelFileName, modelArtifact?.sizeBytes ?? 0);
      if (!modelUri) {
        setActionError(`${bundle.label} not downloaded yet.`);
        return;
      }
      const mmprojArtifact = bundle.mmprojFileName
        ? bundle.artifacts.find((a) => a.fileName === bundle.mmprojFileName)
        : undefined;
      const mmprojUri = bundle.mmprojFileName
        ? (await getPresentModelUri(bundle.mmprojFileName, mmprojArtifact?.sizeBytes ?? 0)) ?? undefined
        : undefined;
      await model.initModel(modelUri, mmprojUri);
      setActiveModelId(bundle.id);
      setStatusMessage(`Loaded ${bundle.label}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Failed to load ${bundle.label}.`);
    }
  };

  /** Delete downloaded files for a catalog model (frees storage). */
  const deleteModelFiles = async (bundle: RuntimeModelBundle) => {
    try {
      for (const artifact of bundle.artifacts) {
        const uri = getModelArtifactUri(artifact.fileName);
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
      if (activeModelId === bundle.id) setActiveModelId(null);
      setStatusMessage(`Deleted ${bundle.label}.`);
    } catch {
      setActionError(`Failed to delete ${bundle.label} files.`);
    }
  };

  const pauseDownload = async () => {
    try {
      await activeDownloadTaskRef.current?.pause();
      setIsDownloadPaused(true);
    } catch {
      // ignore
    }
  };

  const resumeDownload = async () => {
    try {
      await activeDownloadTaskRef.current?.resume();
      setIsDownloadPaused(false);
    } catch {
      // ignore
    }
  };

  const cancelDownload = async () => {
    try {
      await activeDownloadTaskRef.current?.stop();
    } catch {
      // ignore
    }
    activeDownloadTaskRef.current = null;
    setIsDownloadingModel(false);
    setDownloadingModelId(null);
    setIsDownloadPaused(false);
    setDownloadProgress(0);
    setStatusMessage(null);
    await clearDownloadSnapshot();
  };

  /** Download and initialise an embedding model. */
  const downloadEmbedModel = async (bundle: RuntimeModelBundle) => {
    setIsEmbedDownloading(true);
    setDownloadingEmbedModelId(bundle.id);
    setEmbedDownloadProgress(0);
    setActionError(null);
    setStatusMessage(`Downloading ${bundle.label}…`);

    try {
      const exactSizes = await prefetchArtifactSizes(bundle.artifacts);
      const totalBytes = bundle.artifacts.reduce(
        (sum, a) => sum + (exactSizes.get(a.fileName) ?? a.sizeBytes),
        0
      );
      let completedBytes = 0;

      for (const artifact of bundle.artifacts) {
        const weight = (exactSizes.get(artifact.fileName) ?? artifact.sizeBytes) / totalBytes;
        await downloadModelArtifact(artifact, {
          onTaskReady: (task) => { activeEmbedDownloadTaskRef.current = task; },
          onProgress: (progress) => {
            const normalized = completedBytes / totalBytes + progress * weight;
            setEmbedDownloadProgress(Math.min(1, normalized));
          },
        });
        activeEmbedDownloadTaskRef.current = null;
        completedBytes += exactSizes.get(artifact.fileName) ?? artifact.sizeBytes;
      }

      const embedUri = getModelArtifactUri(bundle.modelFileName);
      await embedder.initEmbedder(embedUri);
      setActiveEmbedModelId(bundle.id);
      setStatusMessage(`${bundle.label} ready.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `Failed to download ${bundle.label}.`);
    } finally {
      activeEmbedDownloadTaskRef.current = null;
      setIsEmbedDownloadPaused(false);
      setIsEmbedDownloading(false);
      setDownloadingEmbedModelId(null);
    }
  };

  const pauseEmbedDownload = async () => {
    try {
      await activeEmbedDownloadTaskRef.current?.pause();
      setIsEmbedDownloadPaused(true);
    } catch { /* ignore */ }
  };

  const resumeEmbedDownload = async () => {
    try {
      await activeEmbedDownloadTaskRef.current?.resume();
      setIsEmbedDownloadPaused(false);
    } catch { /* ignore */ }
  };

  const cancelEmbedDownload = async () => {
    try { await activeEmbedDownloadTaskRef.current?.stop(); } catch { /* ignore */ }
    activeEmbedDownloadTaskRef.current = null;
    setIsEmbedDownloading(false);
    setDownloadingEmbedModelId(null);
    setIsEmbedDownloadPaused(false);
    setEmbedDownloadProgress(0);
    setStatusMessage(null);
  };

  /** Delete downloaded files for an embedding model. */
  const deleteEmbedModelFiles = async (bundle: RuntimeModelBundle) => {
    try {
      for (const artifact of bundle.artifacts) {
        await FileSystem.deleteAsync(getModelArtifactUri(artifact.fileName), { idempotent: true });
      }
      if (activeEmbedModelId === bundle.id) setActiveEmbedModelId(null);
      setStatusMessage(`Deleted ${bundle.label}.`);
    } catch {
      setActionError(`Failed to delete ${bundle.label} files.`);
    }
  };

  // Keep backward-compat alias used by onboarding / old code paths.
  const downloadDefaultModel = () => downloadModel(DEFAULT_RUNTIME_MODEL);

  const importCapture = async (linkToId?: string) => {
    setIsImporting(true);
    setActionError(null);
    setStatusMessage(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: false });
      if (result.canceled || !('assets' in result) || result.assets.length === 0) {
        return null;
      }

      const item = await knowledge.importAsset(result.assets[0], linkToId);
      setStatusMessage(`Imported ${item.title}.`);

      // Embed immediately so RAG works before enrichment completes.
      embedAndStoreItem(item).catch(() => undefined);

      if (model.isReady) {
        await enrichItem(item.id, item);
      }

      return item;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to import capture.');
      return null;
    } finally {
      setIsImporting(false);
    }
  };

  const createNote = async (params: { body: string; title: string; linkToId?: string }) => {
    setActionError(null);
    setStatusMessage(null);

    try {
      const item = await knowledge.addQuickNote(params);
      setStatusMessage(`Added ${item.title}.`);

      // Embed immediately with raw content so RAG works even before enrichment.
      embedAndStoreItem(item).catch(() => undefined);

      if (model.isReady) {
        await enrichItem(item.id, item);
        // enrichItem calls embedAndStoreItem again post-enrichment with better metadata.
      }

      return item;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to create note.');
      return null;
    }
  };

  const enrichItem = async (id: string, itemOverride?: KnowledgeItem) => {
    const item = itemOverride ?? knowledge.items.find((candidate) => candidate.id === id);
    if (!item) {
      return null;
    }

    if (!model.isReady) {
      setActionError('Attach your local Gemma model before enrichment.');
      return null;
    }

    setIsEnrichingId(id);
    setActionError(null);
    setStatusMessage(null);

    try {
      const prompt = buildMetadataPrompt(item, knowledge.items);
      const raw = await model.runPrompt(prompt, {
        nPredict: 768,
        temperature: 0,
        enableThinking: false,
      });
      console.log(`[MindMesh enrich] ${id} prompt:\n${prompt}`);
      console.log(`[MindMesh enrich] ${id} raw response:\n${raw}`);

      if (!raw) {
        throw new Error('Model did not return a structured response.');
      }

      const debug = { prompt, response: raw, enrichedAt: new Date().toISOString() };
      let merged: KnowledgeItem;

      try {
        const parsed = extractJsonObject(raw);
        console.log(`[MindMesh enrich] ${id} parsed JSON:`, JSON.stringify(parsed));
        const sanitized = sanitizeMetadataExtraction(
          parsed,
          knowledge.items
            .filter((candidate) => candidate.id !== id)
            .map((candidate) => candidate.id)
        );
        merged = applyMetadataExtraction(item, sanitized);
        setStatusMessage(`Applied metadata to ${merged.title}.`);
      } catch (parseError) {
        console.log(`[MindMesh enrich] ${id} JSON parse failed:`, parseError);
        // Output unusable as JSON — route to review instead of leaving it queued.
        merged = {
          ...item,
          status: 'needs-review',
          updatedAt: new Date().toISOString(),
        };
        setActionError('Model output was not valid JSON. Item moved to review.');
      }

      knowledge.updateItem(id, { ...merged, debug });
      // Embed enriched content for RAG + auto-link (fire-and-forget).
      embedAndStoreItem(merged).then(() => checkAutoLink(merged)).catch(() => undefined);
      return merged;
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Failed to enrich the selected item.'
      );
      return null;
    } finally {
      setIsEnrichingId(null);
    }
  };

  /**
   * Embed a knowledge item's content and store it for RAG + auto-link.
   * Fire-and-forget — caller should not await if embedder is busy.
   */
  const embedAndStoreItem = async (item: KnowledgeItem) => {
    if (!embedder.isEmbedderReady) return;
    try {
      const text = [item.title, item.summary, ...(item.tags ?? []), ...(item.topics ?? [])]
        .filter(Boolean)
        .join('. ');
      const embedding = await embedder.embed(`search_document: ${text}`);
      await knowledgeSearch.upsertItemEmbedding(item.id, text, embedding);
    } catch {
      // non-critical — skip silently
    }
  };

  /**
   * After creating/enriching an item, check for semantically similar existing items.
   * If a close match exists (score ≥ 0.72), surface a link suggestion.
   */
  const checkAutoLink = async (newItem: KnowledgeItem) => {
    if (!embedder.isEmbedderReady) return;
    try {
      const text = [newItem.title, newItem.summary].filter(Boolean).join('. ');
      const embedding = await embedder.embed(`search_query: ${text}`);
      const hits = await knowledgeSearch.searchSimilarItems(embedding, 1, newItem.id);
      if (!hits.length || hits[0].score < modelSettings.settings.autoLinkThreshold) return;
      const similar = knowledge.items.find((i) => i.id === hits[0].id);
      if (!similar) return;
      // Don't suggest if already linked
      if (newItem.links.includes(similar.id) || similar.links.includes(newItem.id)) return;
      setPendingLinkSuggestion({
        fromId: newItem.id,
        toId: similar.id,
        fromTitle: newItem.title,
        toTitle: similar.title,
      });
    } catch {
      // non-critical
    }
  };

  const runAgentTool = async (
    tool: string,
    args: Record<string, unknown>,
    context?: { imageUris?: string[] }
  ): Promise<{ observation: string; displayText: string }> => {
    const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

    if (tool === 'create_note') {
      const title = asString(args.title) || 'Untitled note';
      const content = asString(args.content) || title;
      const item = await knowledge.addQuickNote({ title, body: content });

      // Collect all unique image URIs from the current session turns.
      const sessionImages = Array.from(
        new Set(
          chat.currentTurns.flatMap((turn) => turn.imageUris ?? []).filter(Boolean)
        )
      );

      let attachedUris: string[] = [];
      if (sessionImages.length > 0) {
        // Pause the agent loop and ask the user which images to attach.
        attachedUris = await new Promise<string[]>((resolve) => {
          imageAttachResolveRef.current = resolve;
          setPendingImageAttachment({
            noteId: item.id,
            noteTitle: item.title,
            availableImages: sessionImages,
          });
        });
      }

      if (attachedUris.length > 0) {
        knowledge.updateItem(item.id, { sourceUri: attachedUris[0], type: 'image' });
      }

      // Embed in background.
      embedAndStoreItem({ ...item, sourceUri: attachedUris[0] ?? item.sourceUri })
        .then(() => checkAutoLink(item))
        .catch(() => undefined);

      return {
        observation: `Created note "${item.title}" with id ${item.id}.${attachedUris.length > 0 ? ` ${attachedUris.length} image(s) attached.` : ''}`,
        displayText: `Created note "${item.title}"`,
      };
    }

    if (tool === 'search_notes') {
      const query = asString(args.query).toLowerCase();
      const hits = knowledge.items
        .filter((it) =>
          [it.title, it.summary, it.content ?? '', ...it.topics, ...it.tags]
            .join(' ')
            .toLowerCase()
            .includes(query)
        )
        .slice(0, 5);
      if (!hits.length) {
        return {
          observation: `No notes match "${query}".`,
          displayText: `Searched notes — 0 results`,
        };
      }
      const list = hits.map((h) => `- ${h.id}: ${h.title} — ${h.summary}`).join('\n');
      return {
        observation: `Found notes:\n${list}`,
        displayText: `Searched notes — ${hits.length} result(s)`,
      };
    }

    if (tool === 'link_notes') {
      const fromId = asString(args.fromId);
      const toId = asString(args.toId);
      const from = knowledge.items.find((it) => it.id === fromId);
      const to = knowledge.items.find((it) => it.id === toId);
      if (!from || !to) {
        return {
          observation: 'One or both note ids do not exist. Use search_notes to find valid ids.',
          displayText: 'Link failed — unknown note id',
        };
      }
      knowledge.updateItem(fromId, {
        links: Array.from(new Set([...from.links, toId])),
      });
      return {
        observation: `Linked "${from.title}" to "${to.title}".`,
        displayText: `Linked "${from.title}" → "${to.title}"`,
      };
    }

    if (tool === 'save_memory') {
      const fact = asString(args.fact);
      if (!fact) {
        return { observation: 'No fact provided.', displayText: 'Save memory — empty' };
      }
      if (!embedder.isEmbedderReady) {
        return {
          observation: 'Memory model is not loaded, cannot save.',
          displayText: 'Memory model not loaded',
        };
      }
      const embedding = await embedder.embed(`search_document: ${fact}`);
      await memory.addFact(fact, embedding);
      return {
        observation: `Saved to memory: "${fact}".`,
        displayText: `Remembered: ${fact}`,
      };
    }

    if (tool === 'recall_memory') {
      const query = asString(args.query);
      if (!embedder.isEmbedderReady) {
        return {
          observation: 'Memory model is not loaded, cannot recall.',
          displayText: 'Memory model not loaded',
        };
      }
      if (!memory.facts.length) {
        return { observation: 'No memories saved yet.', displayText: 'Recall — nothing saved' };
      }
      const queryEmbedding = await embedder.embed(`search_query: ${query}`);
      const hits = (await memory.recall(queryEmbedding, 5)).filter((hit) => hit.score > 0.3);
      if (!hits.length) {
        return {
          observation: `No memories relevant to "${query}".`,
          displayText: `Recall — 0 relevant`,
        };
      }
      const list = hits.map((hit) => `- ${hit.text}`).join('\n');
      return {
        observation: `Relevant memories:\n${list}`,
        displayText: `Recalled ${hits.length} memory item(s)`,
      };
    }

    if (tool === 'create_file') {
      const filename = (asString(args.filename) || `file-${Date.now()}.md`).replace(/[/\\]/g, '-');
      const content = asString(args.content);
      const title = asString(args.title) || filename;

      // Persist to filesystem
      const dir = `${FileSystem.documentDirectory ?? ''}mindmesh/files/`;
      try {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      } catch {
        // dir may already exist
      }
      const uri = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(uri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Create knowledge note
      const item = await knowledge.addQuickNote({ title, body: content });
      knowledge.updateItem(item.id, { sourceUri: uri, content });
      embedAndStoreItem({ ...item, content }).catch(() => undefined);

      return {
        observation: `Created file "${filename}" (${content.length} chars). Note id: ${item.id}.`,
        displayText: `Created file "${filename}"`,
      };
    }

    if (tool === 'read_note') {
      const noteId = asString(args.noteId);
      const item = knowledge.items.find((i) => i.id === noteId);
      if (!item) {
        return {
          observation: 'Note not found. Use search_notes to find valid ids.',
          displayText: 'Read note — not found',
        };
      }
      const body =
        item.content || item.transcript || item.description || item.summary || '(empty)';
      return {
        observation: `Note "${item.title}" (id: ${item.id}):\n\n${body.slice(0, 3000)}${body.length > 3000 ? '\n…(truncated)' : ''}`,
        displayText: `Read note "${item.title}"`,
      };
    }

    if (tool === 'edit_note') {
      const noteId = asString(args.noteId);
      const newContent = asString(args.content);
      const mode = asString(args.mode) === 'append' ? 'append' : 'replace';
      const item = knowledge.items.find((i) => i.id === noteId);
      if (!item) {
        return {
          observation: 'Note not found. Use search_notes or read_note to get a valid id.',
          displayText: 'Edit note — not found',
        };
      }
      const merged =
        mode === 'append' ? `${item.content ?? ''}${item.content ? '\n\n' : ''}${newContent}` : newContent;
      knowledge.updateItem(noteId, { content: merged });
      embedAndStoreItem({ ...item, content: merged }).catch(() => undefined);

      // Sync to file if note has a URI
      if (item.sourceUri) {
        FileSystem.writeAsStringAsync(item.sourceUri, merged, {
          encoding: FileSystem.EncodingType.UTF8,
        }).catch(() => undefined);
      }

      return {
        observation: `${mode === 'append' ? 'Appended to' : 'Replaced content of'} note "${item.title}".`,
        displayText: `${mode === 'append' ? 'Appended to' : 'Edited'} "${item.title}"`,
      };
    }

    if (tool === 'update_profile') {
      const next = asString(args.profile);
      if (!next) {
        return { observation: 'No profile text provided.', displayText: 'Profile update — empty' };
      }
      await userProfile.setProfile(next);
      return {
        observation: 'User profile updated.',
        displayText: 'Updated user profile',
      };
    }

    return {
      observation: `Unknown tool "${tool}".`,
      displayText: `Unknown tool "${tool}"`,
    };
  };

  const sendChat = async (text: string, images?: string[]) => {
    const trimmed = text.trim();
    const cleanImages = (images ?? []).filter(Boolean);
    if (!trimmed && !cleanImages.length) {
      return;
    }
    if (!model.isReady) {
      setActionError('Load a model before chatting.');
      return;
    }
    if (cleanImages.length && !model.isMultimodalReady) {
      setActionError('Vision projector is not loaded — cannot use images yet.');
      return;
    }

    const now = Date.now();
    const userTurn: ChatTurn = {
      id: `u-${now}`,
      role: 'user',
      text: trimmed,
      imageUris: cleanImages.length ? cleanImages : undefined,
      createdAt: new Date().toISOString(),
    };
    const baseTurns = [...chat.currentTurns, userTurn];
    chat.appendTurn(userTurn);
    setIsAgentRunning(true);
    setActionError(null);

    const toMessageContent = (turn: ChatTurn): string | ContentPart[] => {
      if (!turn.imageUris?.length) {
        return turn.text;
      }
      const parts: ContentPart[] = [];
      if (turn.text) {
        parts.push({ type: 'text', text: turn.text });
      }
      for (const uri of turn.imageUris) {
        parts.push({ type: 'image_url', image_url: { url: uri } });
      }
      return parts;
    };

    try {
      // RAG: embed user query, pull top-3 semantically relevant notes, inject into system prompt.
      let ragContext: string | undefined;
      if (embedder.isEmbedderReady && trimmed) {
        try {
          const queryEmbedding = await embedder.embed(`search_query: ${trimmed}`);
          const hits = await knowledgeSearch.searchSimilarItems(queryEmbedding, 3);
          const relevant = hits
            .filter((h) => h.score > modelSettings.settings.ragThreshold)
            .map((h) => knowledge.items.find((i) => i.id === h.id))
            .filter((item): item is KnowledgeItem => !!item && item.status === 'ready');
          if (relevant.length) {
            ragContext = relevant
              .map((i) => `[${i.title}] ${i.summary || (i.content ?? '').slice(0, 120)}`)
              .join('\n');
          }
        } catch {
          // RAG is non-critical — proceed without it
        }
      }

      const { systemPromptMode, customSystemPrompt, systemPromptAppend } = modelSettings.settings;
      const systemContent =
        systemPromptMode === 'custom' && customSystemPrompt.trim()
          ? [customSystemPrompt.trim(), systemPromptAppend.trim()].filter(Boolean).join('\n\n')
          : buildAgentSystemPrompt(userProfile.profile, ragContext, systemPromptAppend || undefined);

      const messages: LlamaMessage[] = [
        { role: 'system', content: systemContent },
        ...baseTurns
          .filter((turn) => turn.role !== 'tool')
          .map((turn) => ({
            role: turn.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: toMessageContent(turn),
          })),
      ];

      const { maxAgentSteps, nPredict, temperature, enableThinking, enabledTools } =
        modelSettings.settings;
      const activeTools = AGENT_TOOLS.filter((t) =>
        (enabledTools as readonly string[]).includes(t.function.name)
      );

      const MAX_STEPS = maxAgentSteps;
      for (let step = 0; step < MAX_STEPS; step += 1) {
        let streamAccum = '';
        setStreamingText('');

        const { text, toolCalls } = await model.complete(messages as any, {
          nPredict,
          temperature,
          enableThinking,
          tools: activeTools.length ? activeTools : AGENT_TOOLS,
          onToken: (token) => {
            streamAccum += token;
            setStreamingText(streamAccum);
          },
        });
        setStreamingText(null);
        console.log(
          `[MindMesh agent] step ${step} text="${text}" toolCalls=${JSON.stringify(toolCalls)}`
        );

        if (!toolCalls.length) {
          chat.appendTurn({
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: text || '…',
            createdAt: new Date().toISOString(),
          });
          return;
        }

        // Synthesize ids for any tool call that did not provide one, so the
        // matching tool reply can reference it.
        const callsWithIds = toolCalls.map((call, index) => ({
          ...call,
          id: call.id || `tc-${step}-${index}`,
        }));

        messages.push({
          role: 'assistant',
          content: text || '',
          tool_calls: callsWithIds,
        });

        for (let i = 0; i < callsWithIds.length; i += 1) {
          const call = callsWithIds[i];
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || '{}');
          } catch {
            args = {};
          }
          const { observation, displayText } = await runAgentTool(
            call.function.name,
            args,
            { imageUris: cleanImages }
          );
          chat.appendTurn({
            id: `t-${Date.now()}-${step}-${i}`,
            role: 'tool',
            toolName: call.function.name,
            text: displayText,
            createdAt: new Date().toISOString(),
          });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: observation,
          });
        }
      }

      setStreamingText(null);
      chat.appendTurn({
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: 'I ran out of steps before finishing that. Try rephrasing.',
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      setStreamingText(null);
      setActionError(error instanceof Error ? error.message : 'The assistant failed to respond.');
    } finally {
      setIsAgentRunning(false);
    }
  };

  const generateDigest = async () => {
    if (!model.isReady || model.isLoading) return;
    const prompt = digest.buildDigestPrompt(knowledge.items);
    await digest.markDigestDone();
    setIsAgentRunning(true);
    setActionError(null);
    let streamAccum = '';
    setStreamingText('');
    try {
      const { text } = await model.complete(
        [
          { role: 'system', content: 'You are MindMesh. Respond concisely and helpfully.' },
          { role: 'user', content: prompt },
        ] as any,
        {
          nPredict: 400,
          temperature: 0.4,
          enableThinking: false,
          onToken: (token) => {
            streamAccum += token;
            setStreamingText(streamAccum);
          },
        }
      );
      setStreamingText(null);
      chat.appendTurn({
        id: `digest-${Date.now()}`,
        role: 'assistant',
        text: text || 'No digest generated.',
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      setStreamingText(null);
      setActionError(error instanceof Error ? error.message : 'Digest generation failed.');
    } finally {
      setIsAgentRunning(false);
    }
  };

  const dismissDigest = () => {
    digest.markDigestDone().catch(() => undefined);
  };

  const acceptLinkSuggestion = () => {
    if (!pendingLinkSuggestion) return;
    const { fromId, toId } = pendingLinkSuggestion;
    const from = knowledge.items.find((i) => i.id === fromId);
    if (from) {
      knowledge.updateItem(fromId, { links: Array.from(new Set([...from.links, toId])) });
    }
    setPendingLinkSuggestion(null);
  };

  const dismissLinkSuggestion = () => setPendingLinkSuggestion(null);

  const resolveImageAttachment = (uris: string[]) => {
    imageAttachResolveRef.current?.(uris);
    imageAttachResolveRef.current = null;
    setPendingImageAttachment(null);
  };

  const askWorkspacePlan = async () => {
    if (!model.isReady || model.isLoading) {
      return null;
    }

    setActionError(null);
    setStatusMessage('Generating workspace plan.');
    return await model.runPrompt(
      `${buildWorkspacePrompt(knowledge.items)}\n\nGive me a compact organization plan and the next best review actions.`,
      { nPredict: 420 }
    );
  };

  return {
    ...knowledge,
    ...model,
    ...embedder,
    memoryFacts: memory.facts,
    clearMemory: memory.clearMemory,
    userProfile: userProfile.profile,
    setUserProfile: userProfile.setProfile,
    clearUserProfile: userProfile.clearProfile,
    reviewItems,
    readyItems,
    pickModel,
    importCapture,
    createNote,
    enrichItem,
    askWorkspacePlan,
    downloadDefaultModel,
    conversation: chat.currentTurns,
    sessions: chat.sessions,
    currentSessionId: chat.currentSessionId,
    currentSession: chat.currentSession,
    newSession: chat.newSession,
    selectSession: chat.selectSession,
    deleteSession: chat.deleteSession,
    sendChat,
    isAgentRunning,
    streamingText,
    // Digest
    isDigestDue: digest.isDigestDue,
    generateDigest,
    dismissDigest,
    // Auto-link suggestion
    pendingLinkSuggestion,
    acceptLinkSuggestion,
    dismissLinkSuggestion,
    // Image attachment prompt
    pendingImageAttachment,
    resolveImageAttachment,
    // Model & agent settings
    modelSettings: modelSettings.settings,
    isSettingsLoaded: modelSettings.isSettingsLoaded,
    updateModelSettings: modelSettings.updateSettings,
    resetModelSettings: modelSettings.resetSettings,
    /** Returns the full system prompt as it will be sent to the model. */
    previewSystemPrompt: (ragContext?: string) => {
      const { systemPromptMode, customSystemPrompt, systemPromptAppend } = modelSettings.settings;
      return systemPromptMode === 'custom' && customSystemPrompt.trim()
        ? [customSystemPrompt.trim(), systemPromptAppend.trim()].filter(Boolean).join('\n\n')
        : buildAgentSystemPrompt(userProfile.profile, ragContext, systemPromptAppend || undefined);
    },
    statusMessage,
    actionError,
    clearBanners: () => {
      setStatusMessage(null);
      setActionError(null);
    },
    isImporting,
    isEnrichingId,
    isDownloadingModel,
    isDownloadPaused,
    downloadProgress,
    downloadingModelId,
    activeModelId,
    modelCatalog: MODEL_CATALOG,
    downloadModel,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    loadCatalogModel,
    deleteModelFiles,
    // Embed models
    embedCatalog: EMBED_CATALOG,
    activeEmbedModelId,
    isEmbedDownloading,
    embedDownloadProgress,
    downloadingEmbedModelId,
    isEmbedDownloadPaused,
    downloadEmbedModel,
    pauseEmbedDownload,
    resumeEmbedDownload,
    cancelEmbedDownload,
    deleteEmbedModelFiles,
  };
}
