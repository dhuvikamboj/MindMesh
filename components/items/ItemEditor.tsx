import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KnowledgeItem } from '@/types/knowledge';

export function ItemEditor({
  description,
  isBusy,
  item,
  onChangeContent,
  onChangeDescription,
  onChangeTranscript,
  onEnrich,
  onSave,
  transcript,
  content,
}: {
  content: string;
  description: string;
  isBusy: boolean;
  item: KnowledgeItem;
  onChangeContent: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onChangeTranscript: (value: string) => void;
  onEnrich: () => void;
  onSave: () => void;
  transcript: string;
}) {
  return (
    <View style={styles.container}>
      <TextInput
        placeholder={item.type === 'note' ? 'Local note body' : 'Editable source context'}
        placeholderTextColor="#667085"
        multiline
        style={[styles.input, styles.largeArea]}
        value={content}
        onChangeText={onChangeContent}
      />
      <TextInput
        placeholder="Scene notes or OCR text"
        placeholderTextColor="#667085"
        multiline
        style={[styles.input, styles.area]}
        value={description}
        onChangeText={onChangeDescription}
      />
      <TextInput
        placeholder="Transcript or spoken summary"
        placeholderTextColor="#667085"
        multiline
        style={[styles.input, styles.area]}
        value={transcript}
        onChangeText={onChangeTranscript}
      />
      <View style={styles.actions}>
        <Pressable style={styles.secondaryButton} onPress={onSave}>
          <Text style={styles.secondaryText}>Save edits</Text>
        </Pressable>
        <Pressable style={[styles.primaryButton, isBusy ? styles.disabled : null]} onPress={onEnrich} disabled={isBusy}>
          <Text style={styles.primaryText}>Enrich</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
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
    textAlignVertical: 'top',
  },
  largeArea: {
    minHeight: 140,
  },
  area: {
    minHeight: 100,
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    borderRadius: 18,
    minHeight: 50,
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
    borderRadius: 18,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F0EB',
  },
  secondaryText: {
    color: '#123524',
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
});
