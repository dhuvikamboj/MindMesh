import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ItemRow } from '@/components/items/ItemRow';
import { KnowledgeItem } from '@/types/knowledge';

export function ReviewQueue({ items }: { items: KnowledgeItem[] }) {
  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Inbox is clear</Text>
        <Text style={styles.emptyText}>
          New captures and low-confidence items will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item) => (
        <ItemRow key={item.id} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  empty: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#E4E7EC',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#667085',
  },
});
