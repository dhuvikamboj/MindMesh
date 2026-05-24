import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AssistantProvider } from '@/contexts/AssistantContext';
import { ShareIntentProvider } from '@/contexts/ShareIntentContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AssistantProvider>
          <ShareIntentProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="chat" />
            <Stack.Screen name="map" />
            <Stack.Screen name="library" />
            <Stack.Screen name="sessions" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="inbox" />
            <Stack.Screen name="item/[id]" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="models" />
          </Stack>
          </ShareIntentProvider>
        </AssistantProvider>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
