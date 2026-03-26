import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useTheme } from '../../context/ThemeContext';
import { useAudio } from '../../context/AudioContext';
import { Colors } from '../../constants/colors';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  'Summarize the recent conversation',
  'What was discussed about the meeting?',
  'What time was mentioned?',
  'Who was the conversation about?',
];

const AI_RESPONSES: Record<string, string> = {
  default:
    "I've analyzed the transcript buffer. Based on the recent audio captured, I can help you understand what was said. Please ask me a specific question about the conversation.",
  summarize:
    'Based on the 5-minute audio buffer, the conversation covered: a greeting about the weather, plans for a park visit in the afternoon, a rescheduled meeting on Thursday at 2 PM, and a reminder to bring headphones and project files.',
  meeting:
    'The meeting was rescheduled to Thursday at 2 PM. This was mentioned approximately 2 minutes ago in the conversation. The speaker seemed to be notifying someone about a calendar change.',
  time:
    "Several time references were captured: 'this afternoon' for a park visit, and 'Thursday at two PM' for a rescheduled meeting.",
  who:
    "The transcript captured references to a second person (informal 'you'). The speaker discussed weather, park plans, and work-related information suggesting a colleague or friend relationship.",
};

function getAIResponse(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('summar') || q.includes('recent')) return AI_RESPONSES.summarize;
  if (q.includes('meet')) return AI_RESPONSES.meeting;
  if (q.includes('time') || q.includes('when')) return AI_RESPONSES.time;
  if (q.includes('who') || q.includes('person')) return AI_RESPONSES.who;
  return AI_RESPONSES.default;
}

function MessageBubble({ message, isDark }: { message: Message; isDark: boolean }) {
  const anim = useRef(new Animated.Value(0)).current;
  const isUser = message.role === 'user';

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      tension: 80,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.messageBubble,
        isUser ? styles.userBubble : styles.aiBubble,
        {
          backgroundColor: isUser
            ? Colors.teal
            : isDark
              ? Colors.cardBgDark
              : Colors.cardBg,
          opacity: anim,
          transform: [
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
      ]}
    >
      {!isUser && (
        <View style={styles.aiHeader}>
          <View style={[styles.aiIcon, { backgroundColor: Colors.green + '30' }]}>
            <Text style={{ fontSize: 12 }}>🤖</Text>
          </View>
          <Text style={[styles.aiName, { color: Colors.teal }]}>ClearHear AI</Text>
        </View>
      )}
      <Text
        style={[
          styles.messageText,
          { color: isUser ? Colors.white : isDark ? Colors.textDark : Colors.text },
        ]}
      >
        {message.text}
      </Text>
      <Text
        style={[
          styles.messageTime,
          {
            color: isUser
              ? Colors.white + '80'
              : isDark
                ? Colors.textSecondaryDark
                : Colors.textSecondary,
          },
        ]}
      >
        {message.timestamp.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </Animated.View>
  );
}

function TypingIndicator({ isDark }: { isDark: boolean }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
        ])
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View
      style={[
        styles.typingBubble,
        { backgroundColor: isDark ? Colors.cardBgDark : Colors.cardBg },
      ]}
    >
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            {
              backgroundColor: Colors.teal,
              transform: [
                {
                  translateY: dot.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -6],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function AIScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { transcripts } = useAudio();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      text: `Hi! I'm your ClearHear AI assistant. I have access to the last 5 minutes of audio buffer (${transcripts.length} transcript entries). Ask me anything about the recorded conversation!`,
      timestamp: new Date(),
    },
  ]);

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const bg = isDark ? Colors.backgroundDark : Colors.background;
  const inputBg = isDark ? Colors.cardBgDark : Colors.cardBg;
  const textColor = isDark ? Colors.textDark : Colors.text;
  const secondaryText = isDark ? Colors.textSecondaryDark : Colors.textSecondary;
  const borderColor = isDark ? Colors.borderDark : Colors.border;

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: getAIResponse(text),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1500 + Math.random() * 1000);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);

    return () => clearTimeout(timeout);
  }, [messages, isTyping]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.replace('/HomeScreen')}
            style={styles.backBtn}
          >
            <Text style={[styles.backIcon, { color: textColor }]}>←</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.title, { color: textColor }]}>AI Assistant</Text>
            <View style={styles.statusRow}>
              <View style={styles.onlineDot} />
              <Text style={[styles.statusText, { color: Colors.green }]}>
                {transcripts.length} entries in buffer
              </Text>
            </View>
          </View>

          <View style={[styles.aiAvatar, { backgroundColor: Colors.teal + '20' }]}>
            <Text style={{ fontSize: 20 }}>🤖</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isDark={isDark} />
          ))}
          {isTyping && <TypingIndicator isDark={isDark} />}
        </ScrollView>

        {messages.length < 3 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.suggestionsScroll}
            contentContainerStyle={styles.suggestions}
          >
            {SUGGESTED_QUESTIONS.map((q) => (
              <TouchableOpacity
                key={q}
                onPress={() => sendMessage(q)}
                style={[styles.suggestionChip, { backgroundColor: inputBg, borderColor }]}
              >
                <Text style={[styles.suggestionText, { color: textColor }]}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={[styles.inputBar, { backgroundColor: inputBg, borderColor }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about the conversation..."
            placeholderTextColor={secondaryText}
            style={[styles.textInput, { color: textColor }]}
            multiline
            maxLength={300}
            onSubmitEditing={() => sendMessage(input)}
          />
          <TouchableOpacity
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  input.trim() && !isTyping ? Colors.teal : Colors.border,
              },
            ]}
          >
            <Text style={{ fontSize: 18, color: Colors.white }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center' },
  backIcon: { fontSize: 22, fontWeight: '600' },
  headerCenter: { flex: 1, marginHorizontal: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.green,
  },
  statusText: { fontSize: 11, fontWeight: '600' },
  aiAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    padding: 14,
  },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  aiIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiName: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  messageTime: { fontSize: 10, marginTop: 6, alignSelf: 'flex-end' },
  typingBubble: {
    alignSelf: 'flex-start',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    padding: 14,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    height: 44,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
  suggestionsScroll: { maxHeight: 56 },
  suggestions: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  suggestionChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  suggestionText: { fontSize: 12, fontWeight: '500' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 24,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  textInput: { flex: 1, fontSize: 15, maxHeight: 100, paddingVertical: 6 },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});