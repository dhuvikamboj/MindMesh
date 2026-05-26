import * as FileSystem from 'expo-file-system/legacy';
import {
  createDownloadTask,
  getExistingDownloadTasks,
  completeHandler,
} from '@kesha-antonov/react-native-background-downloader';

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

/** Absolute floor — file must be at least this big to count as real. */
const MIN_FLOOR_BYTES = 1024 * 1024;
/**
 * Tolerance for comparing against catalog sizeBytes (display estimates, not exact).
 * 10 % absorbs rounding while still catching clearly partial files.
 */
const SIZE_TOLERANCE = 0.10;

function isArtifactComplete(actualBytes: number, expectedBytes: number): boolean {
  if (actualBytes < MIN_FLOOR_BYTES) return false;
  if (!expectedBytes) return actualBytes >= MIN_FLOOR_BYTES;
  return actualBytes >= expectedBytes * (1 - SIZE_TOLERANCE);
}

// ── Remote size fetch ─────────────────────────────────────────────────────────

/**
 * Fetch exact Content-Length via HTTP HEAD.
 * Returns 0 if server doesn't support it or request fails.
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

// ── Prefetch exact artifact sizes in parallel ─────────────────────────────────

/**
 * Fire HEAD requests for all artifacts in parallel and return a map of
 * fileName → exact byte count (falls back to catalog estimate if server
 * doesn't respond).
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

// ── Download snapshot — persists bundle state for UI progress restore ─────────

export type ArtifactDownloadState = {
  fileName: string;
  sizeBytes: number;
  completed: boolean;
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
  /** Called as soon as the native task handle is available (new or reconnected). */
  onTaskReady?: (task: ReturnType<typeof createDownloadTask>) => void;
};

/**
 * Download a single model artifact using the native background downloader.
 * - Resumes any existing background task for this artifact automatically.
 * - Download survives app backgrounding and app kills (iOS NSURLSession /
 *   Android DownloadManager).
 */
export const downloadModelArtifact = async (
  artifact: ModelArtifact,
  options: DownloadArtifactOptions = {}
): Promise<string> => {
  const { onProgress, onTaskReady } = options;

  await ensureModelDirectory();
  const destination = getModelArtifactUri(artifact.fileName);

  // Resolve exact size from server; fall back to catalog estimate.
  const remoteBytes = await fetchRemoteFileSize(artifact.url);
  let knownBytes = remoteBytes || artifact.sizeBytes;

  // Skip if already complete.
  const existing = await FileSystem.getInfoAsync(destination, { size: true } as never);
  const existingSize = (existing as { size?: number }).size ?? 0;
  if (existing.exists && isArtifactComplete(existingSize, knownBytes)) {
    onProgress?.(1);
    return destination;
  }

  // Use artifact fileName as the stable task ID.
  const taskId = artifact.fileName;

  return new Promise<string>((resolve, reject) => {
    const attachHandlers = (task: ReturnType<typeof createDownloadTask>) => {
      onTaskReady?.(task);
      task
        .begin(({ expectedBytes }) => {
          // Update knownBytes if server provides a more accurate value.
          if (expectedBytes > 0) knownBytes = expectedBytes;
        })
        .progress(({ bytesDownloaded, bytesTotal }) => {
          const total = bytesTotal || knownBytes;
          if (total) onProgress?.(bytesDownloaded / total);
        })
        .done(() => {
          completeHandler(taskId);
          onProgress?.(1);
          resolve(destination); // destination already has file:// prefix
        })
        .error(({ error }) => {
          reject(new Error(`Failed to download ${artifact.fileName}: ${error}`));
        });
    };

    // Reconnect to any existing background task for this artifact.
    getExistingDownloadTasks().then((existingTasks) => {
      const existing = existingTasks.find((t) => t.id === taskId);

      if (existing) {
        attachHandlers(existing);
        if (existing.state === 'PAUSED') {
          existing.resume().catch(() => {
            reject(new Error(`Failed to resume download for ${artifact.fileName}`));
          });
        }
        // If DOWNLOADING, just re-attached handlers — events will fire naturally.
        return;
      }

      // No existing task — start fresh.
      const task = createDownloadTask({
        id: taskId,
        url: artifact.url,
        destination: destination.replace('file://', ''),
        metadata: { sizeBytes: knownBytes },
      });

      attachHandlers(task);
      task.start();
    }).catch(reject);
  });
};

// ── Presence check ────────────────────────────────────────────────────────────

export const getPresentModelUri = async (
  fileName: string = DEFAULT_RUNTIME_MODEL.modelFileName,
  expectedBytes = 0
): Promise<string | null> => {
  const uri = getModelArtifactUri(fileName);
  const info = await FileSystem.getInfoAsync(uri, { size: true } as never);
  const size = (info as { size?: number }).size ?? 0;
  if (info.exists && isArtifactComplete(size, expectedBytes)) {
    return uri;
  }
  return null;
};
