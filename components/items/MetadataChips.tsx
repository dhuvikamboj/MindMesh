import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function MetadataChips({
  emptyLabel = 'None',
  label,
  values,
}: {
  emptyLabel?: string;
  label: string;
  values: string[];
}) {
  const entries = values.length ? values : [emptyLabel];

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wrap}>
        {entries.map((value) => (
          <View key={value} style={styles.chip}>
            <Text style={styles.chipText}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#667085',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
});
