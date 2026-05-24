import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppShell } from '@/components/layout/AppShell';
import { ReviewQueue } from '@/components/review/ReviewQueue';
import { useAssistant } from '@/contexts/AssistantContext';

const FILTERS = ['All', 'New', 'Needs Review'] as const;

export function InboxScreen() {
  const assistant = useAssistant();
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const reviewItems = useMemo(() => {
    if (filter === 'New') {
      return assistant.reviewItems.filter((item) => item.status === 'queued');
    }
    if (filter === 'Needs Review') {
      return assistant.reviewItems.filter((item) => item.status === 'needs-review');
    }
    return assistant.reviewItems;
  }, [assistant.reviewItems, filter]);

  const handleImport = async () => {
    const item = await assistant.importCapture();
    if (item) {
      router.push(`/item/${item.id}`);
    }
  };

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      return;
    }

    const item = await assistant.createNote({ title, body });
    if (item) {
      setTitle('');
      setBody('');
      router.push(`/item/${item.id}`);
    }
  };

  return (
    <AppShell
      title="Inbox"
      subtitle="Capture quickly, review only what needs attention, and keep unresolved work in one place."
    >
      <View style={styles.section}>
        <Pressable style={styles.primaryButton} onPress={handleImport}>
          <Text style={styles.primaryText}>
            {assistant.isImporting ? 'Importing...' : 'Add capture'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick note</Text>
        <TextInput
          placeholder="Title"
          placeholderTextColor="#667085"
          style={styles.input}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          placeholder="Paste thoughts, transcript fragments, or context"
          placeholderTextColor="#667085"
          style={[styles.input, styles.area]}
          multiline
          value={body}
          onChangeText={setBody}
        />
        <Pressable style={styles.secondaryButton} onPress={handleCreate}>
          <Text style={styles.secondaryText}>Add note</Text>
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((value) => {
          const isActive = value === filter;
          return (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[styles.filterPill, isActive ? styles.filterPillActive : null]}>
              <Text style={[styles.filterLabel, isActive ? styles.filterLabelActive : null]}>
                {value}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ReviewQueue items={reviewItems} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  card: {
    gap: 10,
    backgroundColor: '#FFFDF8',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    padding: 18,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#101828',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F0EB',
  },
  secondaryText: {
    color: '#123524',
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#101828',
  },
  area: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  filterPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#DED7C8',
    backgroundColor: '#FFFDF8',
  },
  filterPillActive: {
    backgroundColor: '#123524',
    borderColor: '#123524',
  },
  filterLabel: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '700',
  },
  filterLabelActive: {
    color: '#FFFFFF',
  },
});
