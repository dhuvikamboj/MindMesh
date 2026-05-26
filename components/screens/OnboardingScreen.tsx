import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAssistant } from '@/contexts/AssistantContext';
import { getDb } from '@/lib/db';
import { MODEL_CATALOG, RuntimeModelBundle } from '@/lib/modelCatalog';
import { palette, radius, space } from '@/lib/theme';

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}

const TAG_COLOR: Record<string, string> = {
  vision: '#0369A1',
  reasoning: '#6B21A8',
  fast: '#166534',
  recommended: '#7B5800',
  default: palette.accent,
};

type Step = 'welcome' | 'name' | 'model' | 'done';

export function OnboardingScreen() {
  const router = useRouter();
  const assistant = useAssistant();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [selectedBundle, setSelectedBundle] = useState<RuntimeModelBundle>(MODEL_CATALOG[0]);

  const markDone = async () => {
    try {
      await getDb().execute(
        `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('onboarding_done', '1');`
      );
    } catch {
      // ignore
    }
    router.replace('/chat');
  };

  const handleNameNext = async () => {
    const trimmed = name.trim();
    if (trimmed) {
      await assistant.setUserProfile(`Name: ${trimmed}`);
    }
    setStep('model');
  };

  // ─── Steps ────────────────────────────────────────────────────────────────

  if (step === 'welcome') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles" size={44} color={palette.accent} />
          </View>
          <Text style={styles.headline}>Welcome to MindMesh</Text>
          <Text style={styles.body}>
            Your private, local AI that captures ideas, connects notes, and builds your knowledge graph — all on-device.
          </Text>
          <View style={styles.featureList}>
            {[
              ['chatbubbles-outline', 'Chat to capture notes'],
              ['git-network-outline', 'Auto-builds your mind map'],
              ['lock-closed-outline', 'Everything stays local'],
            ].map(([icon, label]) => (
              <View key={label} style={styles.featureRow}>
                <Ionicons name={icon as any} size={18} color={palette.accent} />
                <Text style={styles.featureText}>{label}</Text>
              </View>
            ))}
          </View>
          <Pressable style={styles.primaryButton} onPress={() => setStep('name')}>
            <Text style={styles.primaryButtonText}>Get started</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'name') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text style={styles.stepLabel}>Step 1 of 2</Text>
          <Text style={styles.headline}>What's your name?</Text>
          <Text style={styles.body}>
            MindMesh uses this to personalise your profile. You can update it anytime in Settings.
          </Text>
          <TextInput
            style={styles.textInput}
            placeholder="Your name"
            placeholderTextColor={palette.textSubtle}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={handleNameNext}
          />
          <Pressable style={styles.primaryButton} onPress={handleNameNext}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={() => setStep('model')}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'model') {
    const modelReady = assistant.isReady;
    const downloading = assistant.isDownloadingModel;
    const loading = assistant.isModelLoading;
    const isActiveDownload =
      downloading && assistant.downloadingModelId === selectedBundle.id;
    const totalBytes = selectedBundle.artifacts.reduce((s, a) => s + a.sizeBytes, 0);

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text style={styles.stepLabel}>Step 2 of 2</Text>
          <Text style={styles.headline}>Choose AI model</Text>
          <Text style={styles.body}>
            All models run fully on-device. Pick one — you can switch anytime in Settings.
          </Text>

          {/* Model list */}
          <ScrollView
            style={styles.catalogScroll}
            contentContainerStyle={styles.catalogList}
            showsVerticalScrollIndicator={false}>
            {MODEL_CATALOG.map((bundle) => {
              const isSelected = bundle.id === selectedBundle.id;
              const bundleBytes = bundle.artifacts.reduce((s, a) => s + a.sizeBytes, 0);
              return (
                <Pressable
                  key={bundle.id}
                  style={[styles.catalogCard, isSelected && styles.catalogCardSelected]}
                  onPress={() => !downloading && setSelectedBundle(bundle)}>
                  <View style={styles.catalogCardRow}>
                    <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <View style={styles.catalogCardText}>
                      <View style={styles.catalogCardTitle}>
                        <Text style={styles.catalogName}>{bundle.label}</Text>
                        <Text style={styles.catalogParam}>{bundle.paramCount}</Text>
                      </View>
                      <Text style={styles.catalogDesc} numberOfLines={2}>
                        {bundle.description}
                      </Text>
                      <View style={styles.catalogFooter}>
                        <Text style={styles.catalogSize}>{formatBytes(bundleBytes)}</Text>
                        <View style={styles.tagRow}>
                          {bundle.tags.slice(0, 2).map((t) => (
                            <View
                              key={t}
                              style={[styles.tag, { backgroundColor: `${TAG_COLOR[t] ?? palette.accent}18` }]}>
                              <Text style={[styles.tagText, { color: TAG_COLOR[t] ?? palette.accent }]}>
                                {t}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Download / status */}
          {isActiveDownload ? (
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressBar, { width: `${Math.round(assistant.downloadProgress * 100)}%` }]}
                />
              </View>
              <View style={styles.progressFooter}>
                <Text style={styles.progressLabel}>
                  {assistant.isDownloadPaused ? '⏸ Paused' : `${Math.round(assistant.downloadProgress * 100)}%`}
                  {' — '}{selectedBundle.label}
                </Text>
                <View style={styles.progressControls}>
                  <Pressable
                    style={styles.ctrlBtn}
                    onPress={assistant.isDownloadPaused ? assistant.resumeDownload : assistant.pauseDownload}
                    hitSlop={8}>
                    <Ionicons
                      name={assistant.isDownloadPaused ? 'play-circle' : 'pause-circle'}
                      size={26}
                      color={palette.accent}
                    />
                  </Pressable>
                  <Pressable style={styles.ctrlBtn} onPress={assistant.cancelDownload} hitSlop={8}>
                    <Ionicons name="stop-circle" size={26} color={palette.danger} />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={palette.accent} />
              <Text style={styles.loadingText}>Loading model…</Text>
            </View>
          ) : modelReady && assistant.activeModelId === selectedBundle.id ? (
            <Text style={styles.readyText}>✓ {selectedBundle.label} loaded and ready!</Text>
          ) : !modelReady && !downloading ? (
            <Pressable
              style={styles.downloadButton}
              onPress={() => assistant.downloadModel(selectedBundle)}>
              <Ionicons name="cloud-download-outline" size={16} color={palette.inverse} />
              <Text style={styles.downloadButtonText}>
                Download {selectedBundle.label} · {formatBytes(totalBytes)}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.primaryButton, !modelReady && styles.primaryButtonMuted]}
            onPress={markDone}>
            <Text style={styles.primaryButtonText}>
              {modelReady ? 'Start using MindMesh' : 'Skip — download later'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // step === 'done' — never shown, markDone navigates away
  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  content: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    paddingBottom: space.xl,
    gap: space.lg,
    justifyContent: 'center',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: palette.accentOn,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: palette.textSubtle,
  },
  headline: { fontSize: 30, fontWeight: '800', color: palette.text, lineHeight: 36 },
  body: { fontSize: 15, lineHeight: 23, color: palette.textMuted },
  featureList: { gap: space.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  featureText: { fontSize: 15, color: palette.text, fontWeight: '600' },
  textInput: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    backgroundColor: palette.inverse,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    fontSize: 16,
    color: palette.text,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: space.sm,
  },
  primaryButtonMuted: { backgroundColor: palette.textSubtle },
  primaryButtonText: { color: palette.inverse, fontSize: 16, fontWeight: '700' },
  skipButton: { alignItems: 'center', paddingVertical: space.sm },
  skipText: { fontSize: 14, color: palette.textSubtle, fontWeight: '600' },
  // catalog
  catalogScroll: { flex: 1, marginHorizontal: -space.xl },
  catalogList: { paddingHorizontal: space.xl, gap: space.sm, paddingBottom: space.sm },
  catalogCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: palette.border,
    padding: space.md,
  },
  catalogCardSelected: { borderColor: palette.accent, backgroundColor: palette.accentOn },
  catalogCardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    borderColor: palette.border, marginTop: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: palette.accent },
  radioInner: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent,
  },
  catalogCardText: { flex: 1, gap: 3 },
  catalogCardTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  catalogName: { fontSize: 14, fontWeight: '700', color: palette.text },
  catalogParam: { fontSize: 12, color: palette.textMuted, fontWeight: '600' },
  catalogDesc: { fontSize: 12, color: palette.textMuted, lineHeight: 17 },
  catalogFooter: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  catalogSize: { fontSize: 12, fontWeight: '700', color: palette.textSubtle },
  tagRow: { flexDirection: 'row', gap: 4 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 },
  tagText: { fontSize: 10, fontWeight: '700' },

  // (kept for legacy reference — no longer rendered)
  modelCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.lg,
    gap: space.md,
  },
  modelCardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  modelCardText: { flex: 1 },
  modelName: { fontSize: 16, fontWeight: '700', color: palette.text },
  modelMeta: { fontSize: 12, color: palette.textSubtle, marginTop: 2 },
  progressWrap: { gap: 8 },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.border,
    overflow: 'hidden',
  },
  progressBar: { height: '100%', backgroundColor: palette.accent, borderRadius: radius.pill },
  progressFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: { fontSize: 12, color: palette.textSubtle, flex: 1 },
  progressControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctrlBtn: { padding: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  loadingText: { fontSize: 14, color: palette.accent, fontWeight: '600' },
  readyText: { fontSize: 14, color: palette.success, fontWeight: '700' },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: palette.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: space.lg,
    alignSelf: 'flex-start',
  },
  downloadButtonText: { color: palette.inverse, fontSize: 14, fontWeight: '700' },
});
