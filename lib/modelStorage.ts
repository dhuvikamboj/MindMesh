import * as FileSystem from 'expo-file-system/legacy';

import { DEFAULT_RUNTIME_MODEL, ModelArtifact } from '@/lib/modelCatalog';
import { ensureStorageDirectories, storagePaths } from '@/lib/storage';

export const ensureModelDirectory = async () => {
  await ensureStorageDirectories();
  await FileSystem.makeDirectoryAsync(storagePaths.models, { intermediates: true });
};

export const getModelArtifactUri = (fileName: string) => `${storagePaths.models}/${fileName}`;

const MIN_VALID_ARTIFACT_BYTES = 1024 * 1024;

export const downloadModelArtifact = async (
  artifact: ModelArtifact,
  onProgress?: (progress: number) => void
) => {
  await ensureModelDirectory();
  const destination = getModelArtifactUri(artifact.fileName);
  const existing = await FileSystem.getInfoAsync(destination, { size: true });

  if (existing.exists) {
    if ((existing.size ?? 0) >= MIN_VALID_ARTIFACT_BYTES) {
      onProgress?.(1);
      return destination;
    }
    // Stale/corrupt partial download — drop it and re-fetch.
    await FileSystem.deleteAsync(destination, { idempotent: true });
  }

  const task = FileSystem.createDownloadResumable(
    artifact.url,
    destination,
    {},
    (event) => {
      if (!event.totalBytesExpectedToWrite) {
        return;
      }
      onProgress?.(event.totalBytesWritten / event.totalBytesExpectedToWrite);
    }
  );

  const result = await task.downloadAsync();
  if (!result?.uri) {
    throw new Error(`Failed to download ${artifact.fileName}.`);
  }

  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
    throw new Error(
      `Failed to download ${artifact.fileName} (HTTP ${result.status}).`
    );
  }

  const downloaded = await FileSystem.getInfoAsync(destination, { size: true });
  if (!downloaded.exists || (downloaded.size ?? 0) < MIN_VALID_ARTIFACT_BYTES) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
    throw new Error(`Downloaded ${artifact.fileName} is incomplete or invalid.`);
  }

  onProgress?.(1);
  return result.uri;
};

export const getPresentModelUri = async (
  fileName: string = DEFAULT_RUNTIME_MODEL.modelFileName
): Promise<string | null> => {
  const uri = getModelArtifactUri(fileName);
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (info.exists && (info.size ?? 0) >= MIN_VALID_ARTIFACT_BYTES) {
    return uri;
  }
  return null;
};
