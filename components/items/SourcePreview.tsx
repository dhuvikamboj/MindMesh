import React from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { KnowledgeItem } from '@/types/knowledge';

export function SourcePreview({ item }: { item: KnowledgeItem }) {
  if (item.type === 'image' && item.sourceUri) {
    return <Image source={{ uri: item.sourceUri }} style={styles.image} />;
  }

  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>{item.fileName ?? item.title}</Text>
      <Text style={styles.placeholderText}>
        {item.type === 'audio'
          ? 'Audio file stored locally. Add or edit a transcript below.'
          : item.type === 'note'
            ? 'Text note stored locally. Edit the source context below.'
            : 'Preview unavailable.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 240,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  placeholder: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#F5F7FA',
    gap: 8,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
  },
  placeholderText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475467',
  },
});
