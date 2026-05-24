import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';

import { ItemEditor } from '@/components/items/ItemEditor';
import { MetadataChips } from '@/components/items/MetadataChips';
import { SourcePreview } from '@/components/items/SourcePreview';
import { AppShell } from '@/components/layout/AppShell';
import { useAssistant } from '@/contexts/AssistantContext';
import { formatTimestamp } from '@/lib/knowledge';
import { palette, radius, space } from '@/lib/theme';
import { KnowledgeItem } from '@/types/knowledge';

export function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const assistant = useAssistant();

  const item = useMemo(
    () => assistant.items.find((candidate) => candidate.id === id),
    [assistant.items, id]
  );

  const linkedItems = useMemo(
    () =>
      (item?.links ?? [])
        .map((linkId) => assistant.items.find((i) => i.id === linkId))
        .filter((i): i is KnowledgeItem => !!i),
    [item?.links, assistant.items]
  );

  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    setContent(item?.content ?? '');
    setDescription(item?.description ?? '');
    setTranscript(item?.transcript ?? '');
  }, [item]);

  const handleDelete = () => {
    Alert.alert(
      'Delete note',
      `"${item?.title}" will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await assistant.deleteItem(id);
            router.back();
          },
        },
      ]
    );
  };

  if (!item) {
    return (
      <AppShell back title="Item" subtitle="Not found in the local library.">
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Missing item</Text>
          <Text style={styles.emptyText}>
            It may have been removed or the library has not loaded yet.
          </Text>
        </View>
      </AppShell>
    );
  }

  const deleteButton = (
    <Pressable onPress={handleDelete} hitSlop={8} style={styles.deleteButton}>
      <Ionicons name="trash-outline" size={18} color={palette.danger} />
    </Pressable>
  );

  return (
    <AppShell back title={item.title || 'Item'} subtitle="Edit, then enrich." rightAction={deleteButton}>
      {/* Meta row */}
      <View style={styles.card}>
        <View style={styles.metaRow}>
          <Metric label="Type" value={item.type} />
          <Metric label="Status" value={item.status.replace('-', ' ')} />
          <Metric label="Updated" value={formatTimestamp(item.updatedAt ?? item.createdAt)} />
          {typeof item.confidence === 'number' ? (
            <Metric label="Confidence" value={`${Math.round(item.confidence * 100)}%`} />
          ) : null}
        </View>

        <Text style={styles.itemTitle}>{item.title}</Text>
        {item.summary ? <Text style={styles.summary}>{item.summary}</Text> : null}
        <SourcePreview item={item} />
      </View>

      {/* Content (markdown) */}
      {item.content ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Content</Text>
          <Markdown style={mdStyles as any}>{item.content}</Markdown>
        </View>
      ) : null}

      {/* Edit */}
      <View style={styles.card}>
        <ItemEditor
          item={item}
          content={content}
          description={description}
          transcript={transcript}
          onChangeContent={setContent}
          onChangeDescription={setDescription}
          onChangeTranscript={setTranscript}
          onSave={() =>
            assistant.updateItem(item.id, {
              content: content || undefined,
              description: description || undefined,
              transcript: transcript || undefined,
              summary:
                item.summary || content.trim().replace(/\s+/g, ' ').slice(0, 220),
            })
          }
          onEnrich={async () => {
            assistant.updateItem(item.id, {
              content: content || undefined,
              description: description || undefined,
              transcript: transcript || undefined,
            });
            await assistant.enrichItem(item.id);
          }}
          isBusy={assistant.isEnrichingId === item.id}
        />
      </View>

      {/* Tags / topics / people / actions */}
      <View style={styles.card}>
        <MetadataChips label="Tags" values={item.tags} />
        <MetadataChips label="Topics" values={item.topics} />
        <MetadataChips label="People" values={item.people} emptyLabel="No people" />
        <MetadataChips
          label="Action items"
          values={item.actionItems ?? []}
          emptyLabel="No action items"
        />
      </View>

      {/* Linked items */}
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Linked notes</Text>
        {linkedItems.length ? (
          linkedItems.map((linked) => (
            <Pressable
              key={linked.id}
              style={styles.linkedRow}
              onPress={() => router.push(`/item/${linked.id}` as never)}>
              <Ionicons name="git-merge-outline" size={14} color={palette.accent} />
              <View style={styles.linkedBody}>
                <Text style={styles.linkedTitle}>{linked.title}</Text>
                <Text style={styles.linkedSummary} numberOfLines={1}>
                  {linked.summary || linked.type}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={palette.textSubtle} />
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyHint}>
            No links yet — ask MindMesh to connect related notes.
          </Text>
        )}
      </View>

      {/* Debug */}
      {item.debug ? <ModelDetails debug={item.debug} /> : null}
    </AppShell>
  );
}

function ModelDetails({ debug }: { debug: NonNullable<KnowledgeItem['debug']> }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable style={styles.debugHeader} onPress={() => setIsOpen((v) => !v)}>
        <Text style={styles.sectionLabel}>Model details</Text>
        <Text style={styles.debugToggle}>{isOpen ? 'Hide' : 'Show'}</Text>
      </Pressable>
      <Text style={styles.debugMeta}>Last enriched {formatTimestamp(debug.enrichedAt)}</Text>
      {isOpen ? (
        <View style={styles.debugBody}>
          <Text style={styles.debugSection}>Prompt sent</Text>
          <ScrollView style={styles.debugScroll} nestedScrollEnabled>
            <Text style={styles.debugMono}>{debug.prompt}</Text>
          </ScrollView>
          <Text style={styles.debugSection}>Raw response</Text>
          <ScrollView style={styles.debugScroll} nestedScrollEnabled>
            <Text style={styles.debugMono}>{debug.response}</Text>
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.lg,
    gap: space.md,
    marginBottom: space.md,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    minWidth: 96,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: palette.surfaceMuted,
    gap: 6,
  },
  metricLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    color: palette.textSubtle,
  },
  metricValue: { fontSize: 14, fontWeight: '700', color: palette.text },
  itemTitle: { fontSize: 26, fontWeight: '800', color: palette.text },
  summary: { fontSize: 15, lineHeight: 22, color: palette.textMuted },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    color: palette.textSubtle,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  linkedBody: { flex: 1 },
  linkedTitle: { fontSize: 14, fontWeight: '700', color: palette.text },
  linkedSummary: { fontSize: 12, color: palette.textSubtle, marginTop: 2 },
  emptyHint: { fontSize: 13, color: palette.textSubtle, lineHeight: 19 },
  emptyCard: {
    backgroundColor: palette.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.lg,
    gap: space.sm,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: palette.text },
  emptyText: { fontSize: 14, lineHeight: 21, color: palette.textMuted },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: palette.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  debugToggle: { fontSize: 13, fontWeight: '700', color: palette.accent },
  debugMeta: { fontSize: 13, color: palette.textSubtle },
  debugBody: { gap: space.sm },
  debugSection: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: palette.textSubtle,
  },
  debugScroll: {
    maxHeight: 180,
    borderRadius: radius.sm,
    backgroundColor: palette.surfaceMuted,
    padding: 10,
  },
  debugMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 17,
    color: palette.text,
  },
});

const mdStyles = StyleSheet.create({
  body: { color: palette.text, fontSize: 15, lineHeight: 22 },
  paragraph: { marginTop: 0, marginBottom: 6 },
  heading1: { fontSize: 20, fontWeight: '800', color: palette.text },
  heading2: { fontSize: 17, fontWeight: '700', color: palette.text },
  heading3: { fontSize: 15, fontWeight: '700', color: palette.text },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  link: { color: palette.accent },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginVertical: 2 },
  code_inline: {
    backgroundColor: palette.surfaceMuted,
    color: palette.text,
    paddingHorizontal: 4,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  fence: {
    backgroundColor: palette.surfaceMuted,
    padding: 10,
    borderRadius: radius.sm,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: palette.borderStrong,
    paddingHorizontal: 10,
    backgroundColor: palette.surfaceMuted,
  },
});
