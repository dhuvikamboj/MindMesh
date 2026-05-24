import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type ChatMessageProps = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export const ChatMessage = ({ role, content }: ChatMessageProps) => {
  if (role === 'system') return null; // Don't render system prompts

  const isUser = role === 'user';

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
        {content}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    marginVertical: 4,
    maxWidth: '85%',
    borderRadius: 16,
  },
  userContainer: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF', // iOS blue
    borderBottomRightRadius: 4,
  },
  assistantContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA', // iOS light gray
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#FFF',
  },
  assistantText: {
    color: '#000',
  },
});
