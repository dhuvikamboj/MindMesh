import { setConfig } from '@kesha-antonov/react-native-background-downloader';

/**
 * Apply global background-downloader configuration.
 *
 * Call once on startup (with saved wifiOnly preference) and again whenever
 * the user toggles the WiFi-only setting.
 *
 * Android notifications: silent by default — the in-app progress bar is the
 * primary UI. Android 14+ (UIDT) still creates a notification but at lowest
 * priority so it's barely visible. Pass `showNotifications: true` to surface
 * a grouped progress notification in the shade.
 */
export function applyDownloadConfig(
  wifiOnly: boolean,
  showNotifications = false,
): void {
  setConfig({
    // ── Network ───────────────────────────────────────────────────────────────
    // iOS: sets allowsCellularAccess on the NSURLSession config.
    // Android: sets isAllowedOverMetered flag on DownloadManager requests.
    allowsCellularAccess: !wifiOnly,

    // ── iOS parallel limit ────────────────────────────────────────────────────
    // Models are downloaded sequentially in the app, so 4 (the default) is fine.
    // Increase if you add parallel multi-file download in the future.
    maxParallelDownloads: 4,

    // ── Android notifications ─────────────────────────────────────────────────
    // Android 14+ UIDT jobs require a notification — can't be fully suppressed.
    // false → minimal silent notification (lowest priority, empty content).
    // true  → visible grouped notification in the shade.
    showNotificationsEnabled: showNotifications,

    ...(showNotifications && {
      notificationsGrouping: {
        enabled: true,
        // summaryOnly: one notification showing aggregate progress.
        // Ideal since each model has 1-2 artifacts and the in-app bar is primary.
        mode: 'summaryOnly' as const,
        texts: {
          downloadTitle: 'MindMesh Download',
          downloadStarting: 'Starting…',
          downloadProgress: 'Downloading… {progress}%',
          downloadPaused: 'Paused',
          downloadFinished: 'Download complete',
          groupTitle: 'MindMesh',
          groupText: '{count} file(s) downloading',
        },
      },
    }),
  });
}
