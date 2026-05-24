import React, { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAssistant } from '@/contexts/AssistantContext';
import { formatTimestamp } from '@/lib/knowledge';
import { ChatSession } from '@/types/agent';

export function SessionsScreen() {
  const assistant = useAssistant();
  const router = useRouter();

  const sessions = useMemo(
    () =>
      [...assistant.sessions].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      ),
    [assistant.sessions]
  );

  const openSession = useCallback(
    (id: string) => {
      assistant.selectSession(id);
      router.push('/chat');
    },
    [assistant, router]
  );

  const startNew = useCallback(() => {
    assistant.newSession();
    router.push('/chat');
  }, [assistant, router]);

  const renderItem = useCallback(
    ({ item }: { item: ChatSession }) => {
      const isCurrent = item.id === assistant.currentSessionId;
      const messageCount = item.turns.filter((turn) => turn.role !== 'tool').length;
      return (
        <Pressable
          style={[styles.row, isCurrent ? styles.rowCurrent : null]}
          onPress={() => openSession(item.id)}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {item.title || 'New chat'}
            </Text>
            <Text style={styles.rowMeta}>
              {messageCount} message{messageCount === 1 ? '' : 's'} · {formatTimestamp(item.updatedAt)}
            </Text>
          </View>
          <Pressable
            hitSlop={8}
            style={styles.deleteButton}
            onPress={() => assistant.deleteSession(item.id)}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </Pressable>
      );
    },
    [assistant, openSession]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Chat history</Text>
        <Pressable style={styles.newButton} onPress={startNew}>
          <Text style={styles.newButtonText}>New chat</Text>
        </Pressable>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>No chats yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F3F0E8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  back: {
    fontSize: 15,
    fontWeight: '700',
    color: '#667085',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#101828',
  },
  newButton: {
    borderRadius: 999,
    backgroundColor: '#101828',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFDF8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    padding: 14,
  },
  rowCurrent: {
    borderColor: '#123524',
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#101828',
  },
  rowMeta: {
    fontSize: 12,
    color: '#667085',
  },
  deleteButton: {
    borderRadius: 999,
    backgroundColor: '#FEE4E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B42318',
  },
  empty: {
    color: '#667085',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 40,
  },
});
