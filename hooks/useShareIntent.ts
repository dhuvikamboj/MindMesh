/**
 * useShareIntent
 *
 * Reads items shared into MindMesh from other apps.
 *
 * Android: react-native-receive-sharing-intent reads the ACTION_SEND intent.
 * iOS:     ShareViewController writes to UserDefaults (App Group), then opens
 *          mindmesh://share-intent. Expo Linking picks that up and we read
 *          from the native module exposed by react-native-receive-sharing-intent.
 *
 * Returned items are cleared from native storage after reading.
 */

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

export type SharedItem = {
  /** 'text' | 'url' | 'image' */
  type: string;
  value: string;
};

type ReceiveSharingIntentModule = {
  getReceivedFiles: (
    resolve: (files: Array<{ contentUri?: string; text?: string; weblink?: string; mimeType?: string }>) => void,
    reject: (err: unknown) => void,
    scheme: string,
  ) => void;
  clearReceivedFiles: () => void;
};

function getSharingModule(): ReceiveSharingIntentModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-receive-sharing-intent').default as ReceiveSharingIntentModule;
  } catch {
    return null;
  }
}

function normalise(
  raw: Array<{ contentUri?: string; text?: string; weblink?: string; mimeType?: string }>,
): SharedItem[] {
  return raw.flatMap((f) => {
    if (f.text) return [{ type: 'text', value: f.text }];
    if (f.weblink) return [{ type: 'url', value: f.weblink }];
    if (f.contentUri) return [{ type: 'image', value: f.contentUri }];
    return [];
  });
}

export function useShareIntent() {
  const [pendingItems, setPendingItems] = useState<SharedItem[]>([]);
  const mod = useRef(getSharingModule());

  // Read on mount (app cold-started by share intent)
  useEffect(() => {
    const m = mod.current;
    if (!m) return;
    m.getReceivedFiles(
      (files) => {
        const items = normalise(files);
        if (items.length) {
          setPendingItems(items);
          m.clearReceivedFiles();
        }
      },
      () => {},
      'mindmesh://',
    );
  }, []);

  // iOS: app opened via mindmesh://share-intent deep-link while already running
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (!url.startsWith('mindmesh://share-intent')) return;
      const m = mod.current;
      if (!m) return;
      m.getReceivedFiles(
        (files) => {
          const items = normalise(files);
          if (items.length) {
            setPendingItems((prev) => [...prev, ...items]);
            m.clearReceivedFiles();
          }
        },
        () => {},
        'mindmesh://',
      );
    });
    return () => sub.remove();
  }, []);

  const clearSharedItems = () => setPendingItems([]);

  return { pendingItems, clearSharedItems };
}
