import React from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabBar } from '@/components/layout/TabBar';
import { useAssistant } from '@/contexts/AssistantContext';
import { palette, radius, space } from '@/lib/theme';

type AppShellProps = {
  children: React.ReactNode;
  subtitle?: string;
  title: string;
  /** Show back arrow on the left of the header. */
  back?: boolean;
  /** Render extra controls on the right of the header. */
  rightAction?: React.ReactNode;
  /** Wrap children in a vertical ScrollView. Default true. */
  scroll?: boolean;
  /** When set, renders the bottom tab bar with this tab marked active. */
  activeTab?: 'chat' | 'map' | 'library';
};

export function AppShell({
  children,
  subtitle,
  title,
  back = false,
  rightAction,
  scroll = true,
  activeTab,
}: AppShellProps) {
  const router = useRouter();
  const assistant = useAssistant();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {back ? (
              <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
                <Ionicons name="chevron-back" size={22} color={palette.text} />
              </Pressable>
            ) : null}
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
          </View>

          {assistant.storageError ? (
            <Banner tone="danger" text={assistant.storageError} />
          ) : null}
          {assistant.error ? <Banner tone="danger" text={assistant.error} /> : null}
          {assistant.actionError ? <Banner tone="danger" text={assistant.actionError} /> : null}
          {assistant.statusMessage ? (
            <Banner tone="success" text={assistant.statusMessage} />
          ) : null}
        </View>

        {scroll ? (
          <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
        ) : (
          <View style={styles.flex}>{children}</View>
        )}
      </View>
      {activeTab ? <TabBar active={activeTab} /> : null}
    </SafeAreaView>
  );
}

function Banner({ text, tone }: { text: string; tone: 'danger' | 'success' }) {
  const bg = tone === 'danger' ? palette.dangerSoft : palette.successSoft;
  const color = tone === 'danger' ? palette.danger : palette.success;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={[styles.bannerText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.bg },
  container: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.xs },
  flex: { flex: 1 },
  header: { gap: space.sm, marginBottom: space.md },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 40,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  headerText: { flex: 1 },
  rightAction: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: palette.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 19,
    color: palette.textMuted,
  },
  banner: {
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  bannerText: { fontSize: 13, lineHeight: 18 },
  content: { paddingBottom: space.xl },
});
