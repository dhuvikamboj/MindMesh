import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ItemRow } from '@/components/items/ItemRow';
import { AppShell } from '@/components/layout/AppShell';
import { useAssistant } from '@/contexts/AssistantContext';
import { palette, radius, space } from '@/lib/theme';
import { KnowledgeItem } from '@/types/knowledge';

export function LibraryScreen() {
  const assistant = useAssistant();
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();

  const ranked = useMemo(() => rankItems(assistant.items, search), [assistant.items, search]);

  return (
    <AppShell title="Library" subtitle={`${assistant.items.length} note(s) total`} activeTab="library">
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={palette.textSubtle} style={styles.searchIcon} />
        <TextInput
          placeholder="Search notes, transcripts, summaries, topics"
          placeholderTextColor={palette.textSubtle}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
        />
        {query ? (
          <Ionicons
            name="close-circle"
            size={18}
            color={palette.textSubtle}
            onPress={() => setQuery('')}
            style={styles.clearIcon}
          />
        ) : null}
      </View>

      <View style={styles.resultList}>
        {ranked.map(({ item, reason }) => (
          <ItemRow
            key={item.id}
            item={item}
            note={reason}
            onDelete={(id) => assistant.deleteItem(id)}
          />
        ))}
        {ranked.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={28} color={palette.textSubtle} />
            <Text style={styles.emptyTitle}>{query ? 'No matches' : 'Library is empty'}</Text>
            <Text style={styles.emptyText}>
              {query
                ? 'Try a topic, person, filename, or phrase from a summary.'
                : 'Start a chat to capture your first note.'}
            </Text>
          </View>
        ) : null}
      </View>
    </AppShell>
  );
}

function rankItems(items: KnowledgeItem[], query: string) {
  const scoped = items;

  return scoped
    .map((item) => {
      const matches: string[] = [];
      let score = 0;

      if (!query) {
        score += item.status === 'ready' ? 2 : 1;
      } else {
        if (item.title.toLowerCase().includes(query)) {
          score += 5;
          matches.push('title match');
        }
        if (item.summary.toLowerCase().includes(query)) {
          score += 4;
          matches.push('summary match');
        }
        if (item.transcript?.toLowerCase().includes(query) || item.content?.toLowerCase().includes(query)) {
          score += 3;
          matches.push('content match');
        }
        if (item.tags.some((tag) => tag.toLowerCase().includes(query))) {
          score += 2;
          matches.push('tag match');
        }
        if (item.topics.some((topic) => topic.toLowerCase().includes(query))) {
          score += 2;
          matches.push('topic match');
        }
      }

      return {
        item,
        reason: matches[0] ?? (item.status === 'ready' ? 'ready item' : 'review item'),
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.item.createdAt.localeCompare(left.item.createdAt));
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.inverse,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: space.md,
    marginBottom: space.lg,
  },
  searchIcon: { marginRight: space.sm },
  clearIcon: { marginLeft: space.sm, padding: 4 },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: palette.text,
  },
  resultList: { gap: 10 },
  empty: {
    borderRadius: radius.xl,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: space.xl,
    gap: space.sm,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: palette.text },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: palette.textSubtle,
    textAlign: 'center',
  },
});
