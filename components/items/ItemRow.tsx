import React, { useRef } from 'react';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import { getItemAccent } from '@/lib/knowledge';
import { palette, radius, space } from '@/lib/theme';
import { KnowledgeItem } from '@/types/knowledge';

export function ItemRow({
  item,
  note,
  onDelete,
}: {
  item: KnowledgeItem;
  note?: string;
  onDelete?: (id: string) => void;
}) {
  const swipeRef = useRef<Swipeable>(null);

  const nextStep =
    item.status === 'ready'
      ? 'Open'
      : item.type === 'audio'
        ? 'Add transcript'
        : item.type === 'image'
          ? 'Add scene notes'
          : 'Review note';

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    return (
      <Pressable
        style={styles.deleteAction}
        onPress={() => {
          swipeRef.current?.close();
          onDelete?.(item.id);
        }}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash-outline" size={22} color={palette.inverse} />
        </Animated.View>
      </Pressable>
    );
  };

  const card = (
    <Link href={`/item/${item.id}`} asChild>
      <Pressable style={styles.card}>
        <View style={[styles.accent, { backgroundColor: getItemAccent(item.type) }]} />
        <View style={styles.body}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.type}>{item.type}</Text>
          </View>
          <Text style={styles.summary} numberOfLines={2}>{item.summary}</Text>
          <View style={styles.footer}>
            <Text style={styles.meta}>
              {item.status.replace('-', ' ')}
              {typeof item.confidence === 'number'
                ? ` · ${Math.round(item.confidence * 100)}%`
                : ''}
            </Text>
            <Text style={styles.meta}>{note ?? nextStep}</Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );

  if (!onDelete) return card;

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}>
      {card}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  accent: { width: 6 },
  body: { flex: 1, padding: space.md, gap: space.sm },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: palette.text },
  type: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: palette.textSubtle,
    fontWeight: '700',
  },
  summary: { fontSize: 13, lineHeight: 19, color: palette.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: palette.textSubtle },
  deleteAction: {
    width: 72,
    backgroundColor: palette.danger,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.sm,
  },
});
