import * as FileSystem from 'expo-file-system/legacy';

const ROOT_URI = `${FileSystem.documentDirectory ?? ''}mindmesh`;
const ASSET_DIR_URI = `${ROOT_URI}/assets`;
const MODEL_DIR_URI = `${ROOT_URI}/models`;
const LIBRARY_FILE_URI = `${ROOT_URI}/library.json`;
const MEMORY_FILE_URI = `${ROOT_URI}/memory.json`;
const SESSIONS_FILE_URI = `${ROOT_URI}/sessions.json`;

export const storagePaths = {
  root: ROOT_URI,
  assets: ASSET_DIR_URI,
  models: MODEL_DIR_URI,
  library: LIBRARY_FILE_URI,
  memory: MEMORY_FILE_URI,
  sessions: SESSIONS_FILE_URI,
};

export const ensureStorageDirectories = async () => {
  if (!FileSystem.documentDirectory) {
    throw new Error('Local document storage is not available on this device.');
  }

  await FileSystem.makeDirectoryAsync(ROOT_URI, { intermediates: true });
  await FileSystem.makeDirectoryAsync(ASSET_DIR_URI, { intermediates: true });
  await FileSystem.makeDirectoryAsync(MODEL_DIR_URI, { intermediates: true });
};

export const readStoredJson = async <T>(uri: string): Promise<T | null> => {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    return null;
  }

  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return JSON.parse(content) as T;
};

export const writeStoredJson = async (uri: string, value: unknown) => {
  await ensureStorageDirectories();
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(value, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
};

export const copyAssetToStorage = async (from: string, name: string) => {
  await ensureStorageDirectories();
  const destinationUri = `${ASSET_DIR_URI}/${Date.now()}-${sanitizeFileName(name)}`;
  await FileSystem.copyAsync({
    from,
    to: destinationUri,
  });
  return destinationUri;
};

export const getFileInfo = async (uri: string) => {
  const info = await FileSystem.getInfoAsync(uri);
  return info;
};

export const readTextFileSnippet = async (uri: string) => {
  const content = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  return content.slice(0, 12000);
};

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase() || 'capture';
