import { useCallback, useEffect, useRef, useState } from 'react';

import { getDb, initDatabase } from '@/lib/db';

export const ALL_TOOL_NAMES = [
  'create_note',
  'search_notes',
  'link_notes',
  'save_memory',
  'recall_memory',
  'update_profile',
  'create_file',
  'read_note',
  'edit_note',
] as const;

export type ToolName = (typeof ALL_TOOL_NAMES)[number];

export type ModelSettings = {
  /** Sampling temperature passed to llama completion (0 = deterministic). */
  temperature: number;
  /** Max tokens to generate per agent step. */
  nPredict: number;
  /** Whether to render reasoning channel (jinja enable_thinking). */
  enableThinking: boolean;
  /** Maximum agent tool-call steps per turn. */
  maxAgentSteps: number;
  /** Minimum cosine similarity for a RAG hit to be injected into the system prompt. */
  ragThreshold: number;
  /** Minimum cosine similarity required to show an auto-link suggestion. */
  autoLinkThreshold: number;
  /** Tools the agent is allowed to use. */
  enabledTools: ToolName[];
  /** Hours between daily digest prompts. */
  digestIntervalHours: number;
  /**
   * 'default' — use built-in MindMesh system prompt.
   * 'custom'  — replace it entirely with `customSystemPrompt`.
   */
  systemPromptMode: 'default' | 'custom';
  /** Replaces the entire system prompt when mode === 'custom'. */
  customSystemPrompt: string;
  /** Appended after the system prompt in either mode. */
  systemPromptAppend: string;
  /**
   * When true, model downloads are restricted to WiFi / unmetered connections.
   * Mapped to `allowsCellularAccess: false` on iOS and `isAllowedOverMetered: false`
   * on Android via setConfig.
   */
  wifiOnlyDownloads: boolean;
};

export const DEFAULT_SETTINGS: ModelSettings = {
  temperature: 0,
  nPredict: 640,
  enableThinking: false,
  maxAgentSteps: 4,
  ragThreshold: 0.45,
  autoLinkThreshold: 0.72,
  enabledTools: [...ALL_TOOL_NAMES],
  digestIntervalHours: 20,
  systemPromptMode: 'default',
  customSystemPrompt: '',
  systemPromptAppend: '',
  wifiOnlyDownloads: true,
};

const SETTINGS_KEY = 'model_settings';

export function useModelSettings() {
  const [settings, setSettingsState] = useState<ModelSettings>(DEFAULT_SETTINGS);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  // Keep a ref so callbacks always see latest without being re-created.
  const settingsRef = useRef<ModelSettings>(DEFAULT_SETTINGS);
  settingsRef.current = settings;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await initDatabase();
        const result = await getDb().execute(
          `SELECT value FROM app_meta WHERE key = ?;`,
          [SETTINGS_KEY]
        );
        const row = (result.rows?.[0] as { value?: string } | undefined);
        if (row?.value) {
          const parsed = JSON.parse(row.value) as Partial<ModelSettings>;
          if (active) {
            const merged = { ...DEFAULT_SETTINGS, ...parsed };
            setSettingsState(merged);
            settingsRef.current = merged;
          }
        }
      } catch {
        // use defaults on error
      } finally {
        if (active) setIsSettingsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<ModelSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    setSettingsState(next);
    settingsRef.current = next;
    try {
      await getDb().execute(
        `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?);`,
        [SETTINGS_KEY, JSON.stringify(next)]
      );
    } catch {
      // non-critical — settings will revert on next launch
    }
  }, []);

  const resetSettings = useCallback(async () => {
    setSettingsState(DEFAULT_SETTINGS);
    settingsRef.current = DEFAULT_SETTINGS;
    try {
      await getDb().execute(
        `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?);`,
        [SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS)]
      );
    } catch {}
  }, []);

  return { settings, isSettingsLoaded, updateSettings, resetSettings };
}
