import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAssistant } from '@/contexts/AssistantContext';
import { getModelArtifactUri } from '@/lib/modelStorage';
import { RuntimeModelBundle } from '@/lib/modelCatalog';
import { palette, radius, space, fontSize, fontWeight, shadow } from '@/lib/theme';

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

async function isFullyDownloaded(bundle: RuntimeModelBundle): Promise<boolean> {
  const FLOOR = 1024 * 1024;
  const TOLERANCE = 0.10;
  for (const artifact of bundle.artifacts) {
    const info = await FileSystem.getInfoAsync(
      getModelArtifactUri(artifact.fileName),
      { size: true } as never
    );
    if (!info.exists) return false;
    const actual = (info as { size?: number }).size ?? 0;
    if (actual < FLOOR) return false;
    if (artifact.sizeBytes > 0 && actual < artifact.sizeBytes * (1 - TOLERANCE)) return false;
  }
  return true;
}

// ── Embed model card ──────────────────────────────────────────────────────────

type CardProps = {
  bundle: RuntimeModelBundle;
  isActive: boolean;
  isEmbedderReady: boolean;
  isDownloading: boolean;
  isPaused: boolean;
  downloadProgress: number;
  onDownload: () => void;
  onLoad: () => void;
  onDelete: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
};

function EmbedModelCard({
  bundle,
  isActive,
  isEmbedderReady,
  isDownloading,
  isPaused,
  downloadProgress,
  onDownload,
  onLoad,
  onDelete,
  onPause,
  onResume,
  onCancel,
}: CardProps) {
  const [downloaded, setDownloaded] = useState(false);
  const totalBytes = bundle.artifacts.reduce((s, a) => s + a.sizeBytes, 0);

  useEffect(() => {
    let active = true;
    isFullyDownloaded(bundle).then((ok) => {
      if (active) setDownloaded(ok);
    });
    return () => { active = false; };
  }, [bundle, isDownloading]);

  return (
    <View style={[styles.card, isActive && styles.cardActive, shadow.card]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitles}>
          <Text style={styles.cardLabel}>{bundle.label}</Text>
          <Text style={styles.cardParam}>{bundle.paramCount} parameters</Text>
        </View>
        {isActive && isEmbedderReady && (
          <View style={styles.activeBadge}>
            <Ionicons name="checkmark-circle" size={14} color={palette.success} />
            <Text style={[styles.activeBadgeText, { color: palette.success }]}>Active</Text>
          </View>
        )}
        {isActive && !isEmbedderReady && downloaded && (
          <View style={[styles.activeBadge, { backgroundColor: palette.dangerSoft }]}>
            <Ionicons name="alert-circle-outline" size={14} color={palette.danger} />
            <Text style={[styles.activeBadgeText, { color: palette.danger }]}>Not loaded</Text>
          </View>
        )}
      </View>

      {/* Description */}
      <Text style={styles.cardDesc}>{bundle.description}</Text>

      {/* Status row */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, {
          backgroundColor: isActive && isEmbedderReady
            ? palette.success
            : downloaded
              ? palette.accent
              : palette.border,
        }]} />
        <Text style={styles.statusText}>
          {isActive && isEmbedderReady
            ? 'Loaded — semantic search active'
            : downloaded
              ? 'Downloaded — tap Load to activate'
              : 'Not downloaded'}
        </Text>
      </View>

      {/* Footer: size + actions */}
      <View style={styles.cardFooter}>
        <Text style={styles.sizeText}>{formatBytes(totalBytes)}</Text>

        <View style={styles.cardActions}>
          {isDownloading ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {isPaused ? '⏸' : `${Math.round(downloadProgress * 100)}%`}
              </Text>
              <Pressable style={styles.btnIconSm} onPress={isPaused ? onResume : onPause} hitSlop={8}>
                <Ionicons name={isPaused ? 'play' : 'pause'} size={13} color={palette.accent} />
              </Pressable>
              <Pressable style={styles.btnIconSmDanger} onPress={onCancel} hitSlop={8}>
                <Ionicons name="close" size={13} color={palette.danger} />
              </Pressable>
            </View>
          ) : downloaded ? (
            <>
              {!isActive && (
                <Pressable style={styles.btnSecondary} onPress={onLoad}>
                  <Text style={styles.btnSecondaryText}>Load</Text>
                </Pressable>
              )}
              <Pressable style={styles.btnDanger} onPress={onDelete}>
                <Ionicons name="trash-outline" size={14} color={palette.danger} />
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.btnPrimary} onPress={onDownload}>
              <Ionicons name="cloud-download-outline" size={14} color={palette.inverse} />
              <Text style={styles.btnPrimaryText}>Download</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function EmbedCatalogScreen() {
  const router = useRouter();
  const assistant = useAssistant();

  const handleDownload = useCallback(
    (bundle: RuntimeModelBundle) => {
      if (assistant.isEmbedDownloading) return;
      assistant.downloadEmbedModel(bundle);
    },
    [assistant],
  );

  const handleLoad = useCallback(
    async (bundle: RuntimeModelBundle) => {
      try {
        const uri = getModelArtifactUri(bundle.modelFileName);
        await assistant.initEmbedder(uri);
      } catch {
        // error surfaced via context
      }
    },
    [assistant],
  );

  const handleDelete = useCallback(
    (bundle: RuntimeModelBundle) => {
      const bytes = bundle.artifacts.reduce((s, a) => s + a.sizeBytes, 0);
      Alert.alert(
        `Delete ${bundle.label}?`,
        `Frees ${formatBytes(bytes)}. Semantic search will stop working until you re-download.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => assistant.deleteEmbedModelFiles(bundle),
          },
        ],
      );
    },
    [assistant],
  );

  const renderItem = useCallback(
    ({ item }: { item: RuntimeModelBundle }) => (
      <EmbedModelCard
        bundle={item}
        isActive={assistant.activeEmbedModelId === item.id}
        isEmbedderReady={assistant.isEmbedderReady}
        isDownloading={assistant.isEmbedDownloading && assistant.downloadingEmbedModelId === item.id}
        isPaused={assistant.isEmbedDownloadPaused}
        downloadProgress={assistant.embedDownloadProgress}
        onDownload={() => handleDownload(item)}
        onLoad={() => handleLoad(item)}
        onDelete={() => handleDelete(item)}
        onPause={assistant.pauseEmbedDownload}
        onResume={assistant.resumeEmbedDownload}
        onCancel={assistant.cancelEmbedDownload}
      />
    ),
    [assistant, handleDownload, handleLoad, handleDelete],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Nav bar */}
      <View style={styles.navbar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </Pressable>
        <Text style={styles.navTitle}>Embedding Models</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Status banner */}
      {(assistant.statusMessage || assistant.actionError) && (
        <View style={[styles.banner, assistant.actionError ? styles.bannerError : styles.bannerOk]}>
          <Text style={styles.bannerText}>
            {assistant.actionError ?? assistant.statusMessage}
          </Text>
        </View>
      )}

      {/* Info card */}
      <View style={styles.infoCard}>
        <View style={styles.infoIcon}>
          <Ionicons name="search" size={18} color={palette.accent} />
        </View>
        <Text style={styles.infoText}>
          Embedding models power semantic search and RAG — they convert notes into vectors so
          MindMesh can find related ideas even without exact keyword matches. One model must be
          active for memory recall and smart suggestions to work.
        </Text>
      </View>

      <Text style={styles.subtitle}>
        Runs fully on-device. Q4_K_M quantization.
      </Text>

      <FlatList
        data={assistant.embedCatalog}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },

  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  navTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: palette.text,
  },

  banner: {
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  bannerOk: { backgroundColor: palette.accentSoft },
  bannerError: { backgroundColor: palette.dangerSoft },
  bannerText: { fontSize: fontSize.sm, color: palette.text, fontWeight: fontWeight.semi },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.md,
    backgroundColor: palette.accentOn,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${palette.accent}30`,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: `${palette.accent}18`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: palette.textMuted,
    lineHeight: 18,
  },

  subtitle: {
    fontSize: fontSize.sm,
    color: palette.textMuted,
    marginHorizontal: space.lg,
    marginTop: space.md,
    marginBottom: space.sm,
  },

  list: { padding: space.lg, gap: space.md },

  // Card
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: palette.border,
    gap: space.sm,
  },
  cardActive: { borderColor: palette.success, borderWidth: 2 },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardTitles: { flex: 1 },
  cardLabel: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: palette.text },
  cardParam: { fontSize: fontSize.sm, color: palette.textMuted, marginTop: 2 },

  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.successSoft,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginLeft: space.sm,
  },
  activeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semi,
  },

  cardDesc: {
    fontSize: fontSize.sm,
    color: palette.textMuted,
    lineHeight: 18,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: fontSize.sm,
    color: palette.textMuted,
    fontWeight: fontWeight.semi,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
  sizeText: {
    fontSize: fontSize.sm,
    color: palette.textSubtle,
    fontWeight: fontWeight.semi,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },

  // Buttons
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: palette.accent,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
  },
  btnPrimaryText: { fontSize: fontSize.sm, fontWeight: fontWeight.semi, color: palette.inverse },
  btnSecondary: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  btnSecondaryText: { fontSize: fontSize.sm, fontWeight: fontWeight.semi, color: palette.text },
  btnDanger: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: palette.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIconSm: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: palette.accentOn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIconSmDanger: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: palette.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Progress
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  progressTrack: {
    width: 80,
    height: 6,
    backgroundColor: palette.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: palette.accent, borderRadius: radius.pill },
  progressText: {
    fontSize: fontSize.xs,
    color: palette.textMuted,
    fontWeight: fontWeight.semi,
    minWidth: 28,
  },
});
