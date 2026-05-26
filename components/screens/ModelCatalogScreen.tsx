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
import { MODEL_CATALOG, ModelTag, RuntimeModelBundle } from '@/lib/modelCatalog';
import { palette, radius, space, fontSize, fontWeight, shadow } from '@/lib/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimum bytes a file must have to be considered a completed download. */
const MIN_VALID_BYTES = 1024 * 1024;
/**
 * Tolerance for size comparison: catalog sizeBytes are display estimates
 * (rounded MB), not exact byte counts.  Use 10 % to absorb rounding error.
 * A file within 10 % of estimated size is almost certainly the full download.
 */
const SIZE_TOLERANCE = 0.10;

async function isFullyDownloaded(bundle: RuntimeModelBundle): Promise<boolean> {
  for (const artifact of bundle.artifacts) {
    const info = await FileSystem.getInfoAsync(getModelArtifactUri(artifact.fileName), { size: true } as never);
    if (!info.exists) return false;
    const actual = (info as { size?: number }).size ?? 0;
    if (actual < MIN_VALID_BYTES) return false;
    // Only compare against expected size when we have a non-trivial estimate.
    if (artifact.sizeBytes > 0 && actual < artifact.sizeBytes * (1 - SIZE_TOLERANCE)) return false;
  }
  return true;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${bytes} B`;
}

const TAG_STYLES: Record<ModelTag, { bg: string; text: string; label: string }> = {
  default: { bg: palette.accentOn, text: palette.accent, label: 'Default' },
  recommended: { bg: '#FFF8E1', text: '#7B5800', label: '⭐ Recommended' },
  vision: { bg: '#E8F4FD', text: '#0369A1', label: '👁 Vision' },
  reasoning: { bg: '#F3E8FF', text: '#6B21A8', label: '🧠 Reasoning' },
  fast: { bg: palette.successSoft, text: palette.success, label: '⚡ Fast' },
  coding: { bg: '#FEF3C7', text: '#92400E', label: '💻 Coding' },
};

// ── Model card ────────────────────────────────────────────────────────────────

type CardProps = {
  bundle: RuntimeModelBundle;
  isActive: boolean;
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

function ModelCard({
  bundle,
  isActive,
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

  useEffect(() => {
    let active = true;
    isFullyDownloaded(bundle).then((ok) => {
      if (active) setDownloaded(ok);
    });
    return () => { active = false; };
  }, [bundle, isDownloading]);

  const totalBytes = bundle.artifacts.reduce((s, a) => s + a.sizeBytes, 0);

  return (
    <View style={[styles.card, isActive && styles.cardActive, shadow.card]}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitles}>
          <Text style={styles.cardLabel}>{bundle.label}</Text>
          <Text style={styles.cardParam}>{bundle.paramCount}</Text>
        </View>
        {isActive && (
          <View style={styles.activeBadge}>
            <Ionicons name="checkmark-circle" size={14} color={palette.accent} />
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        )}
      </View>

      {/* Description */}
      <Text style={styles.cardDesc}>{bundle.description}</Text>

      {/* Tags */}
      <View style={styles.tagRow}>
        {bundle.tags.map((tag) => {
          const s = TAG_STYLES[tag];
          return (
            <View key={tag} style={[styles.tag, { backgroundColor: s.bg }]}>
              <Text style={[styles.tagText, { color: s.text }]}>{s.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Size + actions */}
      <View style={styles.cardFooter}>
        <Text style={styles.sizeText}>{formatBytes(totalBytes)}</Text>

        <View style={styles.cardActions}>
          {isDownloading ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(downloadProgress * 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
              <Pressable
                style={styles.btnIconSm}
                onPress={isPaused ? onResume : onPause}
                hitSlop={8}>
                <Ionicons
                  name={isPaused ? 'play' : 'pause'}
                  size={13}
                  color={palette.accent}
                />
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

export function ModelCatalogScreen() {
  const router = useRouter();
  const assistant = useAssistant();

  const handleDownload = useCallback(
    (bundle: RuntimeModelBundle) => {
      if (assistant.isDownloadingModel) return;
      assistant.downloadModel(bundle);
    },
    [assistant],
  );

  const handleLoad = useCallback(
    (bundle: RuntimeModelBundle) => {
      assistant.loadCatalogModel(bundle);
    },
    [assistant],
  );

  const handleDelete = useCallback(
    (bundle: RuntimeModelBundle) => {
      Alert.alert(
        `Delete ${bundle.label}?`,
        `This frees ${formatBytes(bundle.artifacts.reduce((s, a) => s + a.sizeBytes, 0))} of storage. You can re-download anytime.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => assistant.deleteModelFiles(bundle),
          },
        ],
      );
    },
    [assistant],
  );

  const renderItem = useCallback(
    ({ item }: { item: RuntimeModelBundle }) => (
      <ModelCard
        bundle={item}
        isActive={assistant.activeModelId === item.id}
        isDownloading={assistant.isDownloadingModel && assistant.downloadingModelId === item.id}
        isPaused={assistant.isDownloadPaused}
        downloadProgress={assistant.downloadProgress}
        onDownload={() => handleDownload(item)}
        onLoad={() => handleLoad(item)}
        onDelete={() => handleDelete(item)}
        onPause={assistant.pauseDownload}
        onResume={assistant.resumeDownload}
        onCancel={assistant.cancelDownload}
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
        <Text style={styles.navTitle}>Models</Text>
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

      {/* Subtitle */}
      <Text style={styles.subtitle}>
        All models run locally on device. Q4_K_M quantization — best quality/size tradeoff.
      </Text>

      <FlatList
        data={MODEL_CATALOG}
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
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
  },
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
  subtitle: {
    fontSize: fontSize.sm,
    color: palette.textMuted,
    marginHorizontal: space.lg,
    marginTop: space.md,
    marginBottom: space.sm,
    lineHeight: 18,
  },
  list: {
    padding: space.lg,
    gap: space.md,
  },

  // Card
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardActive: {
    borderColor: palette.accent,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.xs,
  },
  cardTitles: { flex: 1 },
  cardLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: palette.text,
  },
  cardParam: {
    fontSize: fontSize.sm,
    color: palette.textMuted,
    marginTop: 2,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.accentOn,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    marginLeft: space.sm,
  },
  activeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semi,
    color: palette.accent,
  },
  cardDesc: {
    fontSize: fontSize.sm,
    color: palette.textMuted,
    marginBottom: space.sm,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.md,
  },
  tag: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semi,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  btnPrimaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semi,
    color: palette.inverse,
  },
  btnSecondary: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.border,
  },
  btnSecondaryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semi,
    color: palette.text,
  },
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

  // Download progress
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  progressTrack: {
    width: 100,
    height: 6,
    backgroundColor: palette.border,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
  },
  progressText: {
    fontSize: fontSize.xs,
    color: palette.textMuted,
    fontWeight: fontWeight.semi,
    minWidth: 34,
  },
});
