import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAssistant } from '@/contexts/AssistantContext';
import { ALL_TOOL_NAMES, ToolName } from '@/hooks/useModelSettings';
import { palette, radius, space } from '@/lib/theme';

const N_PREDICT_OPTIONS = [128, 256, 512, 640, 1024, 2048];
const DIGEST_INTERVAL_OPTIONS = [8, 12, 20, 24, 48];

const TOOL_LABELS: Record<ToolName, string> = {
  create_note: 'Create note',
  search_notes: 'Search notes',
  link_notes: 'Link notes',
  save_memory: 'Save memory',
  recall_memory: 'Recall memory',
  update_profile: 'Update profile',
  create_file: 'Create file',
  read_note: 'Read note',
  edit_note: 'Edit note',
};

export function SettingsScreen() {
  const assistant = useAssistant();
  const router = useRouter();
  const { modelSettings: s, updateModelSettings, resetModelSettings } = assistant;

  const [profileDraft, setProfileDraft] = useState(assistant.userProfile ?? '');
  const [customPromptDraft, setCustomPromptDraft] = useState(s.customSystemPrompt);
  const [appendDraft, setAppendDraft] = useState(s.systemPromptAppend);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setCustomPromptDraft(s.customSystemPrompt);
    setAppendDraft(s.systemPromptAppend);
  }, [s.customSystemPrompt, s.systemPromptAppend]);

  useEffect(() => {
    setProfileDraft(assistant.userProfile ?? '');
  }, [assistant.userProfile]);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const fmt = (n: number, decimals = 2) => n.toFixed(decimals);

  const handleResetSettings = () => {
    Alert.alert('Reset settings', 'Restore all model and agent settings to defaults?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetModelSettings },
    ]);
  };

  const toggleTool = useCallback(
    (tool: ToolName) => {
      const current = s.enabledTools;
      const next = current.includes(tool)
        ? current.filter((t) => t !== tool)
        : ([...current, tool] as ToolName[]);
      // Always keep at least 1 tool enabled
      if (next.length === 0) return;
      updateModelSettings({ enabledTools: next });
    },
    [s.enabledTools, updateModelSettings]
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Model status ── */}
        <Section title="Model" icon="cube-outline">
          <Row
            label="Main model"
            value={assistant.isReady ? 'Loaded' : 'Not loaded'}
            tone={assistant.isReady ? 'success' : 'muted'}
          />
          <Row
            label="Vision (mmproj)"
            value={assistant.isMultimodalReady ? 'Enabled' : 'Off'}
            tone={assistant.isMultimodalReady ? 'success' : 'muted'}
          />
          <Row
            label="Memory / embed model"
            value={assistant.isEmbedderReady ? 'Loaded' : 'Off'}
            tone={assistant.isEmbedderReady ? 'success' : 'muted'}
          />
          <ButtonRow
            icon="list-outline"
            label="Browse model catalog…"
            onPress={() => router.push('/models')}
          />
          <ButtonRow
            icon="search-outline"
            label="Manage embedding models…"
            onPress={() => router.push('/embed-models')}
          />
          <ButtonRow
            icon="folder-open-outline"
            label="Attach custom GGUF…"
            disabled={assistant.isModelLoading}
            onPress={assistant.pickModel}
          />
        </Section>

        {/* ── Model tuning ── */}
        <Section title="Model tuning" icon="options-outline">
          {/* Temperature */}
          <View style={styles.tuneRow}>
            <View style={styles.tuneInfo}>
              <Text style={styles.tuneLabel}>Temperature</Text>
              <Text style={styles.tuneHint}>0 = deterministic · 1 = creative</Text>
            </View>
            <Stepper
              value={s.temperature}
              display={fmt(s.temperature)}
              onDecrement={() =>
                updateModelSettings({ temperature: clamp(+(s.temperature - 0.05).toFixed(2), 0, 1) })
              }
              onIncrement={() =>
                updateModelSettings({ temperature: clamp(+(s.temperature + 0.05).toFixed(2), 0, 1) })
              }
            />
          </View>

          {/* nPredict */}
          <View style={styles.tuneBlock}>
            <Text style={styles.tuneLabel}>Max tokens</Text>
            <Text style={styles.tuneHint}>Tokens generated per response</Text>
            <View style={styles.chipRow}>
              {N_PREDICT_OPTIONS.map((n) => (
                <Pressable
                  key={n}
                  style={[styles.chip, s.nPredict === n && styles.chipActive]}
                  onPress={() => updateModelSettings({ nPredict: n })}>
                  <Text style={[styles.chipText, s.nPredict === n && styles.chipTextActive]}>
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* enableThinking */}
          <View style={styles.toggleRow}>
            <View style={styles.tuneInfo}>
              <Text style={styles.tuneLabel}>Enable thinking</Text>
              <Text style={styles.tuneHint}>Reasoning channel (slower, more accurate)</Text>
            </View>
            <Switch
              value={s.enableThinking}
              onValueChange={(v) => updateModelSettings({ enableThinking: v })}
              trackColor={{ false: palette.border, true: palette.accent }}
              thumbColor={palette.inverse}
            />
          </View>
        </Section>

        {/* ── Agent ── */}
        <Section title="Agent" icon="git-network-outline">
          {/* maxAgentSteps */}
          <View style={styles.tuneRow}>
            <View style={styles.tuneInfo}>
              <Text style={styles.tuneLabel}>Max tool steps</Text>
              <Text style={styles.tuneHint}>Tool calls per turn before fallback</Text>
            </View>
            <Stepper
              value={s.maxAgentSteps}
              display={String(s.maxAgentSteps)}
              onDecrement={() =>
                updateModelSettings({ maxAgentSteps: clamp(s.maxAgentSteps - 1, 1, 12) })
              }
              onIncrement={() =>
                updateModelSettings({ maxAgentSteps: clamp(s.maxAgentSteps + 1, 1, 12) })
              }
            />
          </View>

          {/* RAG threshold */}
          <View style={styles.tuneRow}>
            <View style={styles.tuneInfo}>
              <Text style={styles.tuneLabel}>RAG threshold</Text>
              <Text style={styles.tuneHint}>Min similarity to inject note as context</Text>
            </View>
            <Stepper
              value={s.ragThreshold}
              display={fmt(s.ragThreshold)}
              onDecrement={() =>
                updateModelSettings({
                  ragThreshold: clamp(+(s.ragThreshold - 0.05).toFixed(2), 0, 0.95),
                })
              }
              onIncrement={() =>
                updateModelSettings({
                  ragThreshold: clamp(+(s.ragThreshold + 0.05).toFixed(2), 0, 0.95),
                })
              }
            />
          </View>

          {/* autoLinkThreshold */}
          <View style={styles.tuneRow}>
            <View style={styles.tuneInfo}>
              <Text style={styles.tuneLabel}>Auto-link threshold</Text>
              <Text style={styles.tuneHint}>Min similarity for link suggestion</Text>
            </View>
            <Stepper
              value={s.autoLinkThreshold}
              display={fmt(s.autoLinkThreshold)}
              onDecrement={() =>
                updateModelSettings({
                  autoLinkThreshold: clamp(+(s.autoLinkThreshold - 0.05).toFixed(2), 0.3, 0.99),
                })
              }
              onIncrement={() =>
                updateModelSettings({
                  autoLinkThreshold: clamp(+(s.autoLinkThreshold + 0.05).toFixed(2), 0.3, 0.99),
                })
              }
            />
          </View>

          {/* Enabled tools */}
          <View style={styles.tuneBlock}>
            <Text style={styles.tuneLabel}>Enabled tools</Text>
            <Text style={styles.tuneHint}>Agent can only call checked tools</Text>
            <View style={styles.chipRow}>
              {ALL_TOOL_NAMES.map((tool) => {
                const active = s.enabledTools.includes(tool);
                return (
                  <Pressable
                    key={tool}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => toggleTool(tool)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {TOOL_LABELS[tool]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <ButtonRow
            icon="refresh-outline"
            label="Reset to defaults"
            onPress={handleResetSettings}
          />
        </Section>

        {/* ── Digest ── */}
        <Section title="Daily digest" icon="sunny-outline">
          <View style={styles.tuneBlock}>
            <Text style={styles.tuneLabel}>Digest interval</Text>
            <Text style={styles.tuneHint}>Hours between digest prompts</Text>
            <View style={styles.chipRow}>
              {DIGEST_INTERVAL_OPTIONS.map((h) => (
                <Pressable
                  key={h}
                  style={[styles.chip, s.digestIntervalHours === h && styles.chipActive]}
                  onPress={() => updateModelSettings({ digestIntervalHours: h })}>
                  <Text
                    style={[
                      styles.chipText,
                      s.digestIntervalHours === h && styles.chipTextActive,
                    ]}>
                    {h}h
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Section>

        {/* ── System prompt ── */}
        <Section title="System prompt" icon="terminal-outline">
          {/* Mode toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.tuneInfo}>
              <Text style={styles.tuneLabel}>Prompt mode</Text>
              <Text style={styles.tuneHint}>
                {s.systemPromptMode === 'default'
                  ? 'Using built-in MindMesh prompt'
                  : 'Using your custom prompt (full override)'}
              </Text>
            </View>
            <View style={styles.modeToggle}>
              <Pressable
                style={[
                  styles.modeBtn,
                  s.systemPromptMode === 'default' && styles.modeBtnActive,
                ]}
                onPress={() => updateModelSettings({ systemPromptMode: 'default' })}>
                <Text
                  style={[
                    styles.modeBtnText,
                    s.systemPromptMode === 'default' && styles.modeBtnTextActive,
                  ]}>
                  Default
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modeBtn,
                  s.systemPromptMode === 'custom' && styles.modeBtnActive,
                ]}
                onPress={() => updateModelSettings({ systemPromptMode: 'custom' })}>
                <Text
                  style={[
                    styles.modeBtnText,
                    s.systemPromptMode === 'custom' && styles.modeBtnTextActive,
                  ]}>
                  Custom
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Custom prompt (only when mode === custom) */}
          {s.systemPromptMode === 'custom' ? (
            <>
              <Text style={styles.tuneLabel}>Custom system prompt</Text>
              <Text style={styles.tuneHint}>
                Replaces the entire built-in prompt. You are responsible for tool instructions.
              </Text>
              <TextInput
                style={[styles.textarea, styles.textareaTall]}
                placeholder="You are a helpful assistant..."
                placeholderTextColor={palette.textSubtle}
                multiline
                value={customPromptDraft}
                onChangeText={setCustomPromptDraft}
              />
              <Pressable
                style={[
                  styles.primaryButton,
                  customPromptDraft === s.customSystemPrompt ? styles.disabled : null,
                ]}
                disabled={customPromptDraft === s.customSystemPrompt}
                onPress={() => updateModelSettings({ customSystemPrompt: customPromptDraft })}>
                <Text style={styles.primaryButtonText}>Save custom prompt</Text>
              </Pressable>
            </>
          ) : null}

          {/* Append block (both modes) */}
          <Text style={styles.tuneLabel}>
            {s.systemPromptMode === 'default' ? 'Extra instructions' : 'Appended instructions'}
          </Text>
          <Text style={styles.tuneHint}>
            {s.systemPromptMode === 'default'
              ? 'Added at the end of the default prompt every turn'
              : 'Added after your custom prompt every turn'}
          </Text>
          <TextInput
            style={styles.textarea}
            placeholder={'e.g. "Always reply in French." or "Prefer bullet points."'}
            placeholderTextColor={palette.textSubtle}
            multiline
            value={appendDraft}
            onChangeText={setAppendDraft}
          />
          <View style={styles.buttonRow}>
            <Pressable
              style={[
                styles.primaryButton,
                appendDraft === s.systemPromptAppend ? styles.disabled : null,
              ]}
              disabled={appendDraft === s.systemPromptAppend}
              onPress={() => updateModelSettings({ systemPromptAppend: appendDraft })}>
              <Text style={styles.primaryButtonText}>Save</Text>
            </Pressable>
            <Pressable
              style={styles.ghostButton}
              onPress={() => setShowPreview(true)}>
              <Text style={styles.ghostButtonText}>Preview prompt</Text>
            </Pressable>
          </View>
        </Section>

        {/* Preview modal */}
        <Modal visible={showPreview} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={styles.previewModal} edges={['top', 'bottom']}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Full system prompt</Text>
              <Pressable onPress={() => setShowPreview(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={palette.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.previewContent}>
              <Text style={styles.previewText} selectable>
                {assistant.previewSystemPrompt()}
              </Text>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* ── User profile ── */}
        <Section title="User profile" icon="person-outline">
          <Text style={styles.helper}>
            Kept in context every turn. Model rewrites it via the update_profile tool.
          </Text>
          <TextInput
            style={styles.textarea}
            placeholder="(empty — assistant fills this as you chat)"
            placeholderTextColor={palette.textSubtle}
            multiline
            value={profileDraft}
            onChangeText={setProfileDraft}
          />
          <View style={styles.buttonRow}>
            <Pressable
              style={[
                styles.primaryButton,
                profileDraft === (assistant.userProfile ?? '') ? styles.disabled : null,
              ]}
              disabled={profileDraft === (assistant.userProfile ?? '')}
              onPress={() => assistant.setUserProfile(profileDraft)}>
              <Text style={styles.primaryButtonText}>Save</Text>
            </Pressable>
            <Pressable
              style={[styles.ghostButton, !assistant.userProfile ? styles.disabled : null]}
              disabled={!assistant.userProfile}
              onPress={() => {
                assistant.clearUserProfile();
                setProfileDraft('');
              }}>
              <Text style={styles.ghostButtonText}>Clear</Text>
            </Pressable>
          </View>
        </Section>

        {/* ── Semantic memory ── */}
        <Section title="Semantic memory" icon="bookmark-outline">
          <Row label="Stored facts" value={`${assistant.memoryFacts.length}`} />
          <ButtonRow
            icon="trash-outline"
            label="Clear all memory"
            danger
            disabled={!assistant.memoryFacts.length}
            onPress={assistant.clearMemory}
          />
        </Section>

        {/* ── Knowledge ── */}
        <Section title="Knowledge" icon="library-outline">
          <Row label="Notes captured" value={`${assistant.items.length}`} />
          <Row label="Chat sessions" value={`${assistant.sessions.length}`} />
        </Section>
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={15} color={palette.accent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'muted';
}) {
  const color =
    tone === 'success' ? palette.success : tone === 'muted' ? palette.textSubtle : palette.text;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

function ButtonRow({
  icon,
  label,
  onPress,
  danger,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.actionRow, disabled ? styles.disabled : null]}
      onPress={onPress}
      disabled={disabled}>
      <Ionicons name={icon} size={18} color={danger ? palette.danger : palette.accent} />
      <Text style={[styles.actionLabel, danger ? { color: palette.danger } : null]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={palette.textHint} />
    </Pressable>
  );
}

function Stepper({
  value: _value,
  display,
  onDecrement,
  onIncrement,
}: {
  value: number;
  display: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable style={styles.stepBtn} onPress={onDecrement} hitSlop={6}>
        <Ionicons name="remove" size={16} color={palette.text} />
      </Pressable>
      <Text style={styles.stepValue}>{display}</Text>
      <Pressable style={styles.stepBtn} onPress={onIncrement} hitSlop={6}>
        <Ionicons name="add" size={16} color={palette.text} />
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: palette.text,
  },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  section: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: palette.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionBody: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  rowLabel: { fontSize: 14, color: palette.textMuted },
  rowValue: { fontSize: 14, fontWeight: '700' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 12,
  },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: palette.text },
  // tuning rows
  tuneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: space.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: space.sm,
  },
  tuneBlock: { paddingVertical: 8, gap: 8 },
  tuneInfo: { flex: 1 },
  tuneLabel: { fontSize: 14, fontWeight: '700', color: palette.text },
  tuneHint: { fontSize: 11, color: palette.textSubtle, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  chipActive: {
    backgroundColor: palette.accentOn,
    borderColor: palette.accent,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: palette.textMuted },
  chipTextActive: { color: palette.accent },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted,
  },
  stepValue: {
    minWidth: 44,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: palette.text,
  },
  helper: { fontSize: 13, color: palette.textMuted, lineHeight: 19, paddingTop: space.sm },
  textarea: {
    minHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.inverse,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 14,
    color: palette.text,
    textAlignVertical: 'top',
    marginTop: space.sm,
  },
  buttonRow: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  primaryButton: {
    flex: 1,
    backgroundColor: palette.text,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryButtonText: { color: palette.inverse, fontSize: 14, fontWeight: '700' },
  ghostButton: {
    flex: 1,
    backgroundColor: palette.bg,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  ghostButtonText: { color: palette.text, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  textareaTall: { minHeight: 180 },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: palette.bg,
  },
  modeBtnActive: { backgroundColor: palette.accent },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: palette.textSubtle },
  modeBtnTextActive: { color: palette.inverse },
  previewModal: { flex: 1, backgroundColor: palette.bg },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  previewTitle: { fontSize: 17, fontWeight: '800', color: palette.text },
  previewContent: { padding: space.lg },
  previewText: {
    fontSize: 13,
    lineHeight: 20,
    color: palette.text,
    fontFamily: 'monospace',
  },
});
