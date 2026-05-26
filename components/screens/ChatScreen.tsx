import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabBar } from '@/components/layout/TabBar';
import { useAssistant } from '@/contexts/AssistantContext';
import { useShareIntentContext } from '@/contexts/ShareIntentContext';
import { KnowledgeItem } from '@/types/knowledge';
import { copyAssetToStorage } from '@/lib/storage';
import { palette, radius, space } from '@/lib/theme';
import { ChatTurn } from '@/types/agent';

const TOOL_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; label?: string }> = {
  create_note: { icon: 'document-text-outline' },
  search_notes: { icon: 'search-outline' },
  link_notes: { icon: 'git-merge-outline' },
  save_memory: { icon: 'bookmark-outline' },
  recall_memory: { icon: 'sparkles-outline' },
  update_profile: { icon: 'person-outline' },
  create_file: { icon: 'document-outline' },
  read_note: { icon: 'eye-outline' },
  edit_note: { icon: 'create-outline' },
};

/** File attached to the composer before send. */
type PendingFile = { name: string; content: string; sizeChars: number };

export function ChatScreen() {
  const assistant = useAssistant();
  const shareIntent = useShareIntentContext();
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedAttachUris, setSelectedAttachUris] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  // Note mention autocomplete — triggered by @ at end of draft
  const mentionResults = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return assistant.items
      .filter((item) => item.title.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, assistant.items]);

  const handleDraftChange = useCallback((text: string) => {
    setDraft(text);
    // Match @ followed by any non-whitespace chars at end of string.
    const m = text.match(/@([^\s]*)$/);
    setMentionQuery(m ? m[1] : null);
  }, []);

  const insertMention = useCallback((item: KnowledgeItem) => {
    const newDraft = draft.replace(/@[^\s]*$/, `@[${item.title}](${item.id}) `);
    setDraft(newDraft);
    setMentionQuery(null);
    inputRef.current?.focus();
  }, [draft]);

  // Pre-fill draft when app is opened via share intent
  useEffect(() => {
    if (!shareIntent.pendingItems.length) return;
    const texts = shareIntent.pendingItems
      .filter((i) => i.type === 'text' || i.type === 'url')
      .map((i) => i.value);
    if (texts.length) {
      setDraft((prev) => (prev ? `${prev}\n\n${texts.join('\n')}` : texts.join('\n')));
    }
    shareIntent.clearSharedItems();
  }, [shareIntent.pendingItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Inject a live streaming bubble at the front of the inverted list
  // (= bottom of chat) while the model is generating.
  const data = useMemo(() => {
    const turns = [...assistant.conversation].reverse();
    if (assistant.streamingText !== null) {
      const streamingTurn: ChatTurn = {
        id: '__streaming__',
        role: 'assistant',
        text: assistant.streamingText || '▋',
        createdAt: '',
      };
      return [streamingTurn, ...turns];
    }
    return turns;
  }, [assistant.conversation, assistant.streamingText]);
  const isEmpty = data.length === 0 && !assistant.isAgentRunning;

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if ((!text && !pendingImageUri && !pendingFile) || assistant.isAgentRunning) {
      return;
    }
    const images = pendingImageUri ? [pendingImageUri] : undefined;
    // Inject file content as a fenced block the model can read in full
    const messageText = pendingFile
      ? [
          text,
          `\n\n[📄 ${pendingFile.name}]\n\`\`\`\n${pendingFile.content}\n\`\`\``,
        ]
          .filter(Boolean)
          .join('')
      : text;
    setDraft('');
    setPendingImageUri(null);
    setPendingFile(null);
    setAttachError(null);
    await assistant.sendChat(messageText, images);
  }, [assistant, draft, pendingImageUri, pendingFile]);

  const handleAttach = useCallback(async () => {
    setAttachError(null);
    if (!assistant.isMultimodalReady) {
      setAttachError('Vision projector not loaded yet — tap the model pill to enable it.');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        multiple: false,
      });
      if (result.canceled || !('assets' in result) || !result.assets?.length) {
        return;
      }
      const asset = result.assets[0];
      const stored = await copyAssetToStorage(asset.uri, asset.name ?? 'image.jpg');
      setPendingImageUri(stored);
    } catch (error) {
      setAttachError(error instanceof Error ? error.message : 'Failed to attach image.');
    }
  }, [assistant.isMultimodalReady]);

  const handleAttachFile = useCallback(async () => {
    setAttachError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/json', 'application/markdown'],
        multiple: false,
      });
      if (result.canceled || !('assets' in result) || !result.assets?.length) return;
      const asset = result.assets[0];
      const uri = asset.uri.startsWith('file://') ? asset.uri : `file://${asset.uri}`;
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const MAX_CHARS = 12_000;
      setPendingFile({
        name: asset.name ?? 'file.txt',
        content: content.slice(0, MAX_CHARS),
        sizeChars: content.length,
      });
    } catch (error) {
      setAttachError(error instanceof Error ? error.message : 'Failed to read file.');
    }
  }, []);

  const handleModelPress = useCallback(() => {
    if (assistant.isModelLoading || assistant.isDownloadingModel) {
      return;
    }
    if (!assistant.isReady || !assistant.isMultimodalReady) {
      assistant.downloadDefaultModel();
    } else {
      assistant.pickModel();
    }
  }, [assistant]);

  const renderItem = useCallback(({ item }: { item: ChatTurn }) => {
    if (item.role === 'tool') {
      const meta = (item.toolName && TOOL_META[item.toolName]) || { icon: 'sparkles-outline' as const };
      return (
        <View style={styles.toolRow}>
          <View style={styles.toolChip}>
            <Ionicons name={meta.icon} size={13} color={palette.accent} />
            <Text style={styles.toolChipText}>{item.text}</Text>
          </View>
        </View>
      );
    }
    const isUser = item.role === 'user';

    // Detect embedded file block: [📄 filename]\n```\ncontent\n```
    const fileBlockMatch = item.text.match(/\[📄 ([^\]]+)\]\n```[\s\S]*?\n([\s\S]*?)```([\s\S]*)/);
    const preText = fileBlockMatch ? item.text.slice(0, item.text.indexOf('[📄')).trim() : null;
    const fileName = fileBlockMatch?.[1] ?? null;
    const fileContent = fileBlockMatch?.[2] ?? null;
    const postText = fileBlockMatch?.[3]?.trim() ?? null;

    /** Render text with @[Title](id) mention tokens as tappable chips. */
    const renderText = (raw: string, mdStyle: object) => {
      const mentionRe = /(@\[([^\]]+)\]\(([^)]+)\))/g;
      if (!mentionRe.test(raw)) {
        return <Markdown style={mdStyle as any}>{raw}</Markdown>;
      }
      // Split into parts: plain text and mention tokens
      const parts: Array<{ type: 'text' | 'mention'; value: string; id?: string }> = [];
      let last = 0;
      const re = /(@\[([^\]]+)\]\(([^)]+)\))/g;
      let match;
      while ((match = re.exec(raw)) !== null) {
        if (match.index > last) parts.push({ type: 'text', value: raw.slice(last, match.index) });
        parts.push({ type: 'mention', value: match[2], id: match[3] });
        last = match.index + match[0].length;
      }
      if (last < raw.length) parts.push({ type: 'text', value: raw.slice(last) });

      return (
        <Text style={(mdStyle as any).body}>
          {parts.map((p, i) =>
            p.type === 'mention' ? (
              <Text
                key={i}
                style={[styles.mentionChip, isUser ? styles.mentionChipUser : styles.mentionChipBot]}
                onPress={() => router.push(`/item/${p.id}`)}>
                @{p.value}
              </Text>
            ) : (
              <Text key={i}>{p.value}</Text>
            ),
          )}
        </Text>
      );
    };

    const mdStyle = isUser ? mdUserStyles : mdBotStyles;

    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowBot]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
          {item.imageUris?.length
            ? item.imageUris.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.bubbleImage} resizeMode="cover" />
              ))
            : null}
          {preText ? renderText(preText, mdStyle) : null}
          {fileName && fileContent !== null ? (
            <FileBlock name={fileName} content={fileContent} isUser={isUser} />
          ) : null}
          {postText ? renderText(postText, mdStyle) : null}
          {!fileBlockMatch && item.text ? renderText(item.text, mdStyle) : null}
        </View>
      </View>
    );
  }, [router]);

  const modelChipLabel = (() => {
    if (assistant.isDownloadingModel) {
      return `${Math.round(assistant.downloadProgress * 100)}%`;
    }
    if (assistant.isModelLoading) return 'Loading';
    if (!assistant.isReady) return 'Download';
    if (!assistant.isMultimodalReady) return 'Add vision';
    return 'Ready';
  })();

  const modelChipDot =
    assistant.isReady && assistant.isMultimodalReady
      ? palette.success
      : assistant.isReady
        ? palette.warning
        : palette.textHint;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Chat</Text>
            <Text style={styles.eyebrow}>MindMesh</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.modelChip}
              onPress={handleModelPress}
              disabled={assistant.isModelLoading || assistant.isDownloadingModel}>
              <View style={[styles.modelDot, { backgroundColor: modelChipDot }]} />
              <Text style={styles.modelChipText}>{modelChipLabel}</Text>
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => assistant.newSession()}
              hitSlop={6}>
              <Ionicons name="create-outline" size={20} color={palette.text} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => router.push('/sessions')}
              hitSlop={6}>
              <Ionicons name="time-outline" size={20} color={palette.text} />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => router.push('/settings')}
              hitSlop={6}>
              <Ionicons name="settings-outline" size={20} color={palette.text} />
            </Pressable>
          </View>
        </View>

        {/* Errors */}
        {assistant.actionError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={palette.danger} />
            <Text style={styles.errorText}>{assistant.actionError}</Text>
          </View>
        ) : null}

        {/* Daily digest prompt */}
        {assistant.isDigestDue && !assistant.isAgentRunning ? (
          <View style={styles.infoBar}>
            <Ionicons name="sunny-outline" size={16} color={palette.accent} />
            <Text style={styles.infoBarText}>Daily digest ready</Text>
            <Pressable onPress={() => assistant.generateDigest()} style={styles.infoBarAction}>
              <Text style={styles.infoBarActionText}>Generate</Text>
            </Pressable>
            <Pressable onPress={() => assistant.dismissDigest()} hitSlop={8}>
              <Ionicons name="close" size={16} color={palette.textSubtle} />
            </Pressable>
          </View>
        ) : null}

        {/* Auto-link suggestion */}
        {assistant.pendingLinkSuggestion ? (
          <View style={styles.infoBar}>
            <Ionicons name="git-merge-outline" size={16} color={palette.accent} />
            <Text style={styles.infoBarText} numberOfLines={1}>
              Link "{assistant.pendingLinkSuggestion.fromTitle}" → "{assistant.pendingLinkSuggestion.toTitle}"?
            </Text>
            <Pressable onPress={() => assistant.acceptLinkSuggestion()} style={styles.infoBarAction}>
              <Text style={styles.infoBarActionText}>Link</Text>
            </Pressable>
            <Pressable onPress={() => assistant.dismissLinkSuggestion()} hitSlop={8}>
              <Ionicons name="close" size={16} color={palette.textSubtle} />
            </Pressable>
          </View>
        ) : null}

        {/* Image attachment prompt — shown when agent creates a note and session has images */}
        {assistant.pendingImageAttachment ? (
          <View style={styles.imageAttachPanel}>
            <Text style={styles.imageAttachTitle}>
              Attach images to "{assistant.pendingImageAttachment.noteTitle}"?
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imageAttachScroll}
              contentContainerStyle={styles.imageAttachRow}>
              {assistant.pendingImageAttachment.availableImages.map((uri) => {
                const selected = selectedAttachUris.includes(uri);
                return (
                  <Pressable
                    key={uri}
                    onPress={() =>
                      setSelectedAttachUris((prev) =>
                        selected ? prev.filter((u) => u !== uri) : [...prev, uri]
                      )
                    }
                    style={[styles.imageAttachThumb, selected && styles.imageAttachThumbSelected]}>
                    <Image source={{ uri }} style={styles.imageAttachImg} resizeMode="cover" />
                    {selected ? (
                      <View style={styles.imageAttachCheck}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.imageAttachActions}>
              <Pressable
                style={styles.infoBarAction}
                onPress={() => {
                  assistant.resolveImageAttachment(selectedAttachUris);
                  setSelectedAttachUris([]);
                }}>
                <Text style={styles.infoBarActionText}>
                  {selectedAttachUris.length > 0
                    ? `Attach ${selectedAttachUris.length}`
                    : 'Attach none'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  assistant.resolveImageAttachment([]);
                  setSelectedAttachUris([]);
                }}
                hitSlop={8}>
                <Text style={styles.imageAttachSkip}>Skip</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Conversation */}
        {isEmpty ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyCard}>
              <Ionicons name="sparkles" size={28} color={palette.accent} />
              <Text style={styles.emptyTitle}>Talk to MindMesh</Text>
              <Text style={styles.emptyBody}>
                Tell it about yourself, share what you’re working on, or drop an image to discuss.
                It captures notes, links ideas in your mind map, and remembers what matters.
              </Text>
              <View style={styles.suggestionsRow}>
                <Suggestion
                  icon="bulb-outline"
                  text="Remember I prefer dark mode"
                  onPress={() => setDraft('Remember I prefer dark mode')}
                />
                <Suggestion
                  icon="document-text-outline"
                  text="Note: read about d3-force"
                  onPress={() => setDraft('Note: read about d3-force')}
                />
                <Suggestion
                  icon="search-outline"
                  text="What do you know about me?"
                  onPress={() => setDraft('What do you know about me?')}
                />
              </View>
            </View>
          </View>
        ) : (
          <FlatList
            style={styles.flex}
            contentContainerStyle={styles.listContent}
            data={data}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
          />
        )}

        {assistant.isAgentRunning && assistant.streamingText === null ? (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color={palette.accent} />
            <Text style={styles.thinkingText}>Thinking…</Text>
          </View>
        ) : null}

        {attachError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={palette.danger} />
            <Text style={styles.errorText}>{attachError}</Text>
          </View>
        ) : null}

        {pendingImageUri ? (
          <View style={styles.pendingRow}>
            <Image source={{ uri: pendingImageUri }} style={styles.pendingThumb} resizeMode="cover" />
            <Text style={styles.pendingLabel}>Image ready to send</Text>
            <Pressable onPress={() => setPendingImageUri(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={palette.danger} />
            </Pressable>
          </View>
        ) : null}

        {pendingFile ? (
          <View style={styles.pendingRow}>
            <Ionicons name="document-outline" size={22} color={palette.accent} />
            <View style={styles.pendingFileInfo}>
              <Text style={styles.pendingLabel} numberOfLines={1}>{pendingFile.name}</Text>
              <Text style={styles.pendingMeta}>
                {pendingFile.sizeChars.toLocaleString()} chars
                {pendingFile.sizeChars > 12000 ? ' · truncated to 12 000' : ''}
              </Text>
            </View>
            <Pressable onPress={() => setPendingFile(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={22} color={palette.danger} />
            </Pressable>
          </View>
        ) : null}

        {/* Mention autocomplete panel */}
        {mentionResults.length > 0 ? (
          <View style={styles.mentionPanel}>
            {mentionResults.map((item) => (
              <Pressable
                key={item.id}
                style={styles.mentionPanelRow}
                onPress={() => insertMention(item)}>
                <Ionicons name="document-text-outline" size={14} color={palette.accent} />
                <Text style={styles.mentionPanelTitle} numberOfLines={1}>{item.title}</Text>
                {item.summary ? (
                  <Text style={styles.mentionPanelMeta} numberOfLines={1}>{item.summary}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Composer */}
        <View style={styles.composer}>
          <Pressable
            style={styles.attachButton}
            onPress={handleAttach}
            disabled={assistant.isAgentRunning}>
            <Ionicons name="image-outline" size={22} color={palette.accent} />
          </Pressable>
          <Pressable
            style={styles.attachButton}
            onPress={handleAttachFile}
            disabled={assistant.isAgentRunning}>
            <Ionicons name="document-attach-outline" size={22} color={palette.accent} />
          </Pressable>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={pendingImageUri ? 'Describe or ask about the image' : 'Message MindMesh  (@ to mention a note)'}
            placeholderTextColor={palette.textSubtle}
            value={draft}
            onChangeText={handleDraftChange}
            multiline
            editable={!assistant.isAgentRunning}
          />
          <Pressable
            style={[
              styles.sendButton,
              (draft.trim() || pendingImageUri || pendingFile) && !assistant.isAgentRunning
                ? null
                : styles.disabled,
            ]}
            onPress={handleSend}
            disabled={(!draft.trim() && !pendingImageUri && !pendingFile) || assistant.isAgentRunning}>
            <Ionicons name="arrow-up" size={20} color={palette.inverse} />
          </Pressable>
        </View>
        <TabBar active="chat" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FileBlock({
  name,
  content,
  isUser,
}: {
  name: string;
  content: string;
  isUser: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n').length;
  return (
    <View style={[styles.fileBlock, isUser ? styles.fileBlockUser : styles.fileBlockBot]}>
      <Pressable style={styles.fileBlockHeader} onPress={() => setExpanded((v) => !v)}>
        <Ionicons
          name="document-text-outline"
          size={14}
          color={isUser ? palette.inverseMuted : palette.accent}
        />
        <Text
          style={[styles.fileBlockName, isUser ? styles.fileBlockNameUser : null]}
          numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.fileBlockMeta, isUser ? styles.fileBlockMetaUser : null]}>
          {lines} lines
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={13}
          color={isUser ? palette.inverseMuted : palette.textSubtle}
        />
      </Pressable>
      {expanded ? (
        <ScrollView style={styles.fileBlockBody} nestedScrollEnabled>
          <Text style={[styles.fileBlockContent, isUser ? styles.fileBlockContentUser : null]}>
            {content}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function Suggestion({
  icon,
  text,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.suggestion} onPress={onPress}>
      <Ionicons name={icon} size={16} color={palette.accent} />
      <Text style={styles.suggestionText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
  },
  headerLeft: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.textSubtle,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { fontSize: 22, fontWeight: '800', color: palette.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  modelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  modelDot: { width: 8, height: 8, borderRadius: 4 },
  modelChipText: { fontSize: 12, fontWeight: '700', color: palette.text },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: palette.dangerSoft,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  errorText: { flex: 1, fontSize: 13, color: palette.danger, lineHeight: 18 },
  listContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    gap: 10,
  },
  emptyWrap: { flex: 1, padding: space.lg, justifyContent: 'center' },
  emptyCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.xl,
    gap: space.md,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: palette.text },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.textMuted,
    textAlign: 'center',
  },
  suggestionsRow: { width: '100%', gap: space.sm, marginTop: space.sm },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: palette.bg,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  suggestionText: { fontSize: 13, fontWeight: '600', color: palette.text, flex: 1 },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowBot: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '86%',
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: palette.text,
    borderBottomRightRadius: 6,
  },
  bubbleBot: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderBottomLeftRadius: 6,
  },
  toolRow: { alignItems: 'center' },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.accentOn,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  toolChipText: { fontSize: 12, fontWeight: '700', color: palette.accent },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingBottom: 6,
  },
  thinkingText: { fontSize: 13, fontWeight: '700', color: palette.accent },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.bg,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: palette.accentOn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.inverse,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: palette.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },

  // ── Mention autocomplete panel ──────────────────────────────────────────────
  mentionPanel: {
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    maxHeight: 220,
  },
  mentionPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  mentionPanelTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  mentionPanelMeta: {
    fontSize: 12,
    color: palette.textMuted,
    maxWidth: 120,
  },

  // ── Mention chips inside bubbles ────────────────────────────────────────────
  mentionChip: {
    fontWeight: '700',
    borderRadius: 4,
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
  mentionChipUser: {
    color: '#A8D8C0',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  mentionChipBot: {
    color: palette.accent,
    backgroundColor: palette.accentOn,
  },

  bubbleImage: {
    width: 220,
    height: 220,
    borderRadius: radius.md,
    marginBottom: 8,
    backgroundColor: palette.border,
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    borderRadius: radius.md,
    backgroundColor: palette.accentOn,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: space.md,
    paddingVertical: 8,
  },
  infoBarText: { flex: 1, fontSize: 13, fontWeight: '600', color: palette.text },
  infoBarAction: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  infoBarActionText: { fontSize: 12, fontWeight: '700', color: palette.inverse },
  imageAttachPanel: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.md,
    gap: space.sm,
    marginBottom: space.sm,
  },
  imageAttachTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.text,
  },
  imageAttachScroll: { flexGrow: 0 },
  imageAttachRow: { gap: space.sm, paddingBottom: 2 },
  imageAttachThumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: palette.border,
  },
  imageAttachThumbSelected: {
    borderColor: palette.accent,
    borderWidth: 2.5,
  },
  imageAttachImg: { width: '100%', height: '100%' },
  imageAttachCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAttachActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  imageAttachSkip: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.textSubtle,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: 6,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  pendingFileInfo: { flex: 1 },
  pendingMeta: { fontSize: 11, color: palette.textSubtle, marginTop: 2 },
  fileBlock: {
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 4,
  },
  fileBlockBot: { borderColor: palette.border, backgroundColor: palette.surfaceMuted },
  fileBlockUser: { borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.12)' },
  fileBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
  },
  fileBlockName: { flex: 1, fontSize: 12, fontWeight: '700', color: palette.text },
  fileBlockNameUser: { color: palette.inverse },
  fileBlockMeta: { fontSize: 11, color: palette.textSubtle },
  fileBlockMetaUser: { color: palette.inverseMuted },
  fileBlockBody: { maxHeight: 200, borderTopWidth: 1, borderTopColor: palette.border },
  fileBlockContent: {
    padding: space.sm,
    fontSize: 12,
    lineHeight: 18,
    color: palette.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fileBlockContentUser: { color: palette.inverse },
  pendingThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: palette.border,
  },
  pendingLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: palette.text },
});

const mdBotStyles = StyleSheet.create({
  body: { color: palette.text, fontSize: 15, lineHeight: 21 },
  paragraph: { marginTop: 0, marginBottom: 6 },
  heading1: { fontSize: 20, fontWeight: '800', color: palette.text, marginTop: 6, marginBottom: 4 },
  heading2: { fontSize: 18, fontWeight: '700', color: palette.text, marginTop: 6, marginBottom: 4 },
  heading3: { fontSize: 16, fontWeight: '700', color: palette.text, marginTop: 6, marginBottom: 4 },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  link: { color: '#1D4ED8' },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  code_inline: {
    backgroundColor: '#F0EDE3',
    color: palette.text,
    paddingHorizontal: 4,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  code_block: {
    backgroundColor: palette.surfaceMuted,
    color: palette.text,
    padding: 10,
    borderRadius: radius.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  fence: {
    backgroundColor: palette.surfaceMuted,
    color: palette.text,
    padding: 10,
    borderRadius: radius.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  blockquote: {
    backgroundColor: palette.surfaceMuted,
    borderLeftWidth: 3,
    borderLeftColor: palette.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hr: { backgroundColor: palette.border, height: 1, marginVertical: 8 },
});

const mdUserStyles = StyleSheet.create({
  body: { color: palette.inverse, fontSize: 15, lineHeight: 21 },
  paragraph: { marginTop: 0, marginBottom: 6 },
  heading1: { fontSize: 20, fontWeight: '800', color: palette.inverse, marginTop: 6, marginBottom: 4 },
  heading2: { fontSize: 18, fontWeight: '700', color: palette.inverse, marginTop: 6, marginBottom: 4 },
  heading3: { fontSize: 16, fontWeight: '700', color: palette.inverse, marginTop: 6, marginBottom: 4 },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  link: { color: '#9DDCFF' },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  code_inline: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    color: palette.inverse,
    paddingHorizontal: 4,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  code_block: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: palette.inverse,
    padding: 10,
    borderRadius: radius.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  fence: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: palette.inverse,
    padding: 10,
    borderRadius: radius.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  blockquote: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hr: { backgroundColor: 'rgba(255,255,255,0.3)', height: 1, marginVertical: 8 },
});
