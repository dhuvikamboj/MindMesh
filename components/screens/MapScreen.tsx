import React, { useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppShell } from '@/components/layout/AppShell';
import { MindMapCanvas } from '@/components/MindMapCanvas';
import { useAssistant } from '@/contexts/AssistantContext';
import { buildMindMap } from '@/lib/knowledge';

export function MapScreen() {
  const assistant = useAssistant();
  const defaultId = assistant.items[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(defaultId);

  const graph = useMemo(() => buildMindMap(assistant.items), [assistant.items]);

  const selected = assistant.items.find((item) => item.id === selectedId) ?? assistant.items[0];

  return (
    <AppShell title="Map" scroll={false} activeTab="map">
      <View style={styles.canvasFrame}>
        <MindMapCanvas
          edges={graph.edges}
          nodes={graph.nodes}
          selectedId={selected?.id}
          onSelect={setSelectedId}
        />
      </View>

      {selected ? (
        <View style={styles.focusCard}>
          <Text style={styles.focusLabel}>Focused item</Text>
          <Text style={styles.focusTitle}>{selected.title}</Text>
          <Text style={styles.focusSummary}>{selected.summary}</Text>
          <Link href={`/item/${selected.id}`} asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>Open item</Text>
            </Pressable>
          </Link>
        </View>
      ) : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  canvasFrame: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E4E7EC',
    marginBottom: 12,
  },
  focusCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E4E7EC',
    padding: 18,
    gap: 10,
  },
  focusLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    color: '#667085',
  },
  focusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#101828',
  },
  focusSummary: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475467',
  },
  button: {
    minHeight: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#101828',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
