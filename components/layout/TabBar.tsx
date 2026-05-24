import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius, space } from '@/lib/theme';

type TabId = 'chat' | 'map' | 'library';

const TABS: { id: TabId; href: string; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: 'chat', href: '/chat', icon: 'chatbubbles-outline', label: 'Chat' },
  { id: 'map', href: '/map', icon: 'git-network-outline', label: 'Map' },
  { id: 'library', href: '/library', icon: 'library-outline', label: 'Library' },
];

export function TabBar({ active }: { active: TabId }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const isActive = active === tab.id || pathname.startsWith(`/${tab.id}`);
          const color = isActive ? palette.accent : palette.textSubtle;
          return (
            <Pressable
              key={tab.id}
              style={styles.tab}
              onPress={() => {
                if (!isActive) {
                  router.replace(tab.href as never);
                }
              }}>
              <View style={[styles.iconBubble, isActive ? styles.iconBubbleActive : null]}>
                <Ionicons name={tab.icon} size={20} color={color} />
              </View>
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.border },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: space.md,
  },
  tab: { alignItems: 'center', gap: 2, paddingVertical: 4, flex: 1 },
  iconBubble: {
    width: 40,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleActive: { backgroundColor: palette.accentOn },
  label: { fontSize: 11, fontWeight: '700' },
});
