import * as FileSystem from 'expo-file-system/legacy';

import { DEFAULT_RUNTIME_MODEL, ModelArtifact } from '@/lib/modelCatalog';
import {
  deleteStoredFile,
  ensureStorageDirectories,
  readStoredJson,
  storagePaths,
  writeStoredJson,
} from '@/lib/storage';

export const ensureModelDirectory = async () => {
  await ensureStorageDirectories();
  await FileSystem.makeDirectoryAsync(storagePaths.models, { intermediates: true });
};

export const getModelArtifactUri = (fileName: string) => `${storagePaths.models}/${fileName}`;

/** Absolute floor — file must be at least this big to even check further. */
const MIN_FLOOR_BYTES = 1024 * 1024;
/** Tolerance when falling back to catalog estimate (not server-reported size). */
const ESTIMATE_TOLERANCE = 0.10;

function isArtifactComplete(actualBytes: number, expectedBytes: number): boolean {
  if (actualBytes < MIN_FLOOR_BYTES) return false;
  if (!expectedBytes) return actualBytes >= MIN_FLOOR_BYTES;
  return actualBytes >= expectedBytes * (1 - ESTIMATE_TOLERANCE);
}

/**
 * Fetch the exact Content-Length for a URL via HTTP HEAD.
 * Returns 0 if the server doesn't support it or the request fails.
 */
export const fetchRemoteFileSize = async (url: string): Promise<number> => {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const len = res.headers.get('content-length');
    return len ? parseInt(len, 10) : 0;
  } catch {
    return 0;
  }
};

// ── Download snapshot — persists across kills for resume ──────────────────────

export type ArtifactDownloadState = {
  fileName: string;
  sizeBytes: number;
  completed: boolean;
  /** Serialised DownloadResumable state from task.savable().resumeData */
  resumeData?: string;
};

export type DownloadSnapshot = {
  bundleId: string;
  bundleLabel: string;
  totalBytes: number;
  artifacts: ArtifactDownloadState[];
};

export const saveDownloadSnapshot = (snapshot: DownloadSnapshot) =>
  writeStoredJson(storagePaths.downloadState, snapshot);

export const loadDownloadSnapshot = () =>
  readStoredJson<DownloadSnapshot>(storagePaths.downloadState);

export const clearDownloadSnapshot = () =>
  deleteStoredFile(storagePaths.downloadState);

// ── Artifact downloader ───────────────────────────────────────────────────────

export type DownloadArtifactOptions = {
  onProgress?: (progress: number) => void;
  /** Resume data from a previous interrupted download. */
  resumeData?: string;
  /**
   * Called periodically with the latest DownloadResumable snapshot so the
   * caller can persist it for cross-session resume.  Throttled internally to
   * avoid excessive I/O (fires at most once every 5 s).
   */
  onSavable?: (resumeData: string | undefined) => void;
};

export const downloadModelArtifact = async (
  artifact: ModelArtifact,
  options: DownloadArtifactOptions = {}
): Promise<string> => {
  const { onProgress, resumeData, onSavable } = options;

  await ensureModelDirectory();
  const destination = getModelArtifactUri(artifact.fileName);

  // Resolve exact file size from server; fall back to catalog estimate.
  const remoteBytes = await fetchRemoteFileSize(artifact.url);
  const knownBytes = remoteBytes || artifact.sizeBytes;

  const existing = await FileSystem.getInfoAsync(destination, { size: true });

  if (existing.exists) {
    if (isArtifactComplete(existing.size ?? 0, knownBytes)) {
      onProgress?.(1);
      return destination;
    }
    // Stale / corrupt partial — only wipe if we have no resume data.
    if (!resumeData) {
      await FileSystem.deleteAsync(destination, { idempotent: true });
    }
  }

  // Savable throttle state.
  let lastSaveMs = 0;

  // We need the task reference inside the progress callback — declare first.
  let task!: FileSystem.DownloadResumable;

  const handleProgress = (event: FileSystem.DownloadProgressData) => {
    // Prefer server-reported total; fall back to knownBytes from HEAD.
    const total = event.totalBytesExpectedToWrite || knownBytes;
    if (!total) return;
    onProgress?.(event.totalBytesWritten / total);

    if (onSavable) {
      const now = Date.now();
      if (now - lastSaveMs >= 5000) {
        lastSaveMs = now;
        try {
          onSavable(task.savable().resumeData);
        } catch {
          // savable() can throw if task is in terminal state — ignore.
        }
      }
    }
  };

  task = FileSystem.createDownloadResumable(
    artifact.url,
    destination,
    { sessionType: FileSystem.FileSystemSessionType.BACKGROUND },
    handleProgress,
    resumeData
  );

  const result = await task.downloadAsync();
  if (!result?.uri) {
    throw new Error(`Failed to download ${artifact.fileName}.`);
  }

  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
    throw new Error(`Failed to download ${artifact.fileName} (HTTP ${result.status}).`);
  }

  const downloaded = await FileSystem.getInfoAsync(destination, { size: true } as never);
  const downloadedSize = (downloaded as { size?: number }).size ?? 0;
  // If we got exact size from server HEAD, validate tightly (1 %).
  // Otherwise just check the floor — catalog estimate too rough for strict check.
  const sizeOk = remoteBytes
    ? downloadedSize >= remoteBytes * 0.99
    : downloadedSize >= MIN_FLOOR_BYTES;
  if (!downloaded.exists || !sizeOk) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
    throw new Error(`Downloaded ${artifact.fileName} is incomplete or invalid.`);
  }

  onProgress?.(1);
  return result.uri;
};

// ── Prefetch exact artifact sizes in parallel ─────────────────────────────────

/**
 * Fire HEAD requests for all artifacts in parallel and return a map of
 * fileName → exact byte count (0 if server doesn't respond).
 * Use before starting a multi-artifact download for accurate progress weighting.
 */
export const prefetchArtifactSizes = async (
  artifacts: ModelArtifact[]
): Promise<Map<string, number>> => {
  const entries = await Promise.all(
    artifacts.map(async (a) => {
      const size = await fetchRemoteFileSize(a.url);
      return [a.fileName, size || a.sizeBytes] as const;
    })
  );
  return new Map(entries);
};

// ── Presence check ────────────────────────────────────────────────────────────

export const getPresentModelUri = async (
  fileName: string = DEFAULT_RUNTIME_MODEL.modelFileName,
  expectedBytes = 0
): Promise<string | null> => {
  const uri = getModelArtifactUri(fileName);
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (info.exists && isArtifactComplete(info.size ?? 0, expectedBytes)) {
    return uri;
  }
  return null;
};
