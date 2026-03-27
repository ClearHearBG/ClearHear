import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomBar } from '@/src/components/BottomBar';
import { ActionButton, AnimatedEntrance, Atmosphere, DetailRow, Pill, SurfaceCard } from '@/src/components/primitives';
import { useAppState } from '@/src/state/AppProvider';
import { formatRelative, formatTime } from '@/src/utils/format';

const TAB_ITEMS = [
  { key: 'home' as const, label: 'Home', icon: 'home' as const },
  { key: 'recaps' as const, label: 'Recaps', icon: 'file-text' as const },
  { key: 'ai' as const, label: 'AI', icon: 'message-square' as const },
  { key: 'settings' as const, label: 'Settings', icon: 'sliders' as const },
];

const QUICK_PROMPTS = ['What was important?', 'Any time mentioned?', 'Who was there?'];

export function MainPager() {
  const { theme } = useAppState();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  const handleSelect = (index: number) => {
    setActiveIndex(index);
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}> 
      <Atmosphere theme={theme} />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <Animated.ScrollView
          horizontal
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
            setActiveIndex(nextIndex);
          }}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: false,
          })}
          pagingEnabled
          ref={scrollRef}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.flex}>
          <View style={[styles.pagePane, { width }]}>
            <HomePage />
          </View>
          <View style={[styles.pagePane, { width }]}>
            <RecapsPage onOpenAI={() => handleSelect(2)} />
          </View>
          <View style={[styles.pagePane, { width }]}>
            <AIPage onOpenRecaps={() => handleSelect(1)} />
          </View>
          <View style={[styles.pagePane, { width }]}>
            <SettingsPage />
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
      <BottomBar activeIndex={activeIndex} onSelect={handleSelect} scrollX={scrollX} tabs={TAB_ITEMS} theme={theme} />
    </View>
  );
}

function HomePage() {
  const { hearingSupportStatus, preferences, theme, toggleDeviceEnabled } = useAppState();
  const isRequested = preferences.isDeviceEnabled;
  const isRunning = hearingSupportStatus.stage === 'running';
  const statusTitle = !isRequested
    ? 'Off'
    : hearingSupportStatus.stage === 'running'
      ? 'On'
      : hearingSupportStatus.stage === 'starting'
        ? 'Starting'
        : 'Check route';
  const statusDescription = !isRequested
    ? 'Hearing support is paused. Tap the circle to turn it on.'
    : hearingSupportStatus.stage === 'running'
      ? `Live amplification is running through ${hearingSupportStatus.selectedInput?.name ?? 'your headset'}.`
      : hearingSupportStatus.lastError ?? 'Connect headphones or earbuds with a microphone to start live support.';
  const routePill = isRunning ? 'Live' : hearingSupportStatus.stage === 'starting' ? 'Starting' : isRequested ? 'Needs route' : 'Paused';
  const captureValue = !isRequested
    ? 'Off'
    : hearingSupportStatus.inputMode === 'stereo'
      ? 'Stereo microphone pair'
      : 'Shared headset mic';
  const outputValue = !isRequested
    ? 'Inactive'
    : hearingSupportStatus.selectedOutput?.name ?? 'Communication route';
  const sampleRateValue = hearingSupportStatus.sampleRate ? `${(hearingSupportStatus.sampleRate / 1000).toFixed(1)} kHz` : 'Pending';
  const routeNote = !isRequested
    ? 'When enabled, ClearHear prefers stereo headset microphones and falls back to a shared headset mic when that is all the device exposes.'
    : hearingSupportStatus.stage === 'running'
      ? hearingSupportStatus.inputMode === 'stereo'
        ? 'Stereo capture is active, so left and right ear amplification can be applied independently.'
        : 'Your headset exposes one shared microphone, so ClearHear captures that input once and applies separate left and right playback boosts.'
      : hearingSupportStatus.lastError ?? 'Connect a headset microphone and turn support back on to resume live amplification.';

  return (
    <View style={[styles.pageContent, styles.homePageContent]}>
      <AnimatedEntrance>
        <View style={styles.centeredHeader}>
          <Text style={[styles.pageTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Listening</Text>
          <Text style={[styles.pageSubtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Turn hearing support on when you need it.</Text>
        </View>
      </AnimatedEntrance>

      <AnimatedEntrance delay={60} style={styles.homeCenterWrap}>
        <View style={styles.homeCenter}>
          <Pressable
            accessibilityLabel={isRequested ? 'Turn hearing support off' : 'Turn hearing support on'}
            accessibilityRole="button"
            onPress={() => {
              void toggleDeviceEnabled();
            }}
            style={({ pressed }) => [styles.statusButton, { opacity: pressed ? 0.9 : 1 }]}> 
            <View style={[styles.statusHalo, { backgroundColor: isRequested ? theme.accentSoft : theme.elevated }]}> 
              <View style={[styles.statusCore, { backgroundColor: isRunning ? theme.accent : isRequested ? theme.secondary : theme.textMuted }]}> 
                <MaterialCommunityIcons color="#FFFFFF" name={isRequested ? 'power' : 'power-off'} size={38} />
              </View>
            </View>
          </Pressable>
          <Text style={[styles.statusText, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>{statusTitle}</Text>
          <Text style={[styles.statusSubtext, { color: theme.textMuted, fontFamily: theme.fonts.body }]}> 
            {statusDescription}
          </Text>
        </View>
      </AnimatedEntrance>

      <AnimatedEntrance delay={120}>
        <SurfaceCard style={styles.liveSupportCard} theme={theme}>
          <View style={styles.liveSupportHeader}>
            <Pill accent={isRequested} label={routePill} theme={theme} />
            <Text style={[styles.liveSupportTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>Headset route</Text>
          </View>

          <View style={styles.liveSupportDetails}>
            <DetailRow label="Input" theme={theme} value={hearingSupportStatus.selectedInput?.name ?? 'No headset mic'} />
            <DetailRow label="Capture" theme={theme} value={captureValue} />
            <DetailRow label="Output" theme={theme} value={outputValue} />
            <DetailRow label="Sample rate" theme={theme} value={sampleRateValue} />
          </View>

          <Text style={[styles.liveSupportNote, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>{routeNote}</Text>
        </SurfaceCard>
      </AnimatedEntrance>
    </View>
  );
}

function RecapsPage({ onOpenAI }: { onOpenAI: () => void }) {
  const { clearConversationData, isTranscribing, theme, transcripts, transcribeLastFiveMinutes } = useAppState();

  const confirmClear = () => {
    Alert.alert('Clear recaps?', 'This removes all saved recaps.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void clearConversationData();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <AnimatedEntrance>
        <View style={styles.headerBlock}>
          <Text style={[styles.pageTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Recaps</Text>
          <Text style={[styles.pageSubtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Save short conversation summaries to revisit later.</Text>
        </View>
      </AnimatedEntrance>

      <AnimatedEntrance delay={60}>
        <ActionButton
          disabled={isTranscribing}
          label={isTranscribing ? 'Saving...' : 'Save recent conversation'}
          onPress={() => {
            void transcribeLastFiveMinutes();
          }}
          theme={theme}
        />
      </AnimatedEntrance>

      {transcripts.length === 0 ? (
        <AnimatedEntrance delay={120}>
          <SurfaceCard style={styles.emptyCard} theme={theme}>
            <Feather color={theme.textMuted} name="file-text" size={26} />
            <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>No recaps yet</Text>
          </SurfaceCard>
        </AnimatedEntrance>
      ) : (
        <AnimatedEntrance delay={120}>
          <View style={styles.listWrap}>
            {transcripts.map((transcript) => (
              <SurfaceCard key={transcript.id} style={styles.recapCard} theme={theme}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.recapTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{transcript.title}</Text>
                  <Pill label={formatRelative(transcript.createdAt)} theme={theme} />
                </View>
                <Text style={[styles.recapBody, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>{transcript.text}</Text>
              </SurfaceCard>
            ))}
          </View>
        </AnimatedEntrance>
      )}

      {transcripts.length > 0 ? (
        <AnimatedEntrance delay={180}>
          <View style={styles.recapsActions}>
            <ActionButton label="Ask AI" onPress={onOpenAI} style={styles.flex} theme={theme} variant="secondary" />
            <ActionButton label="Clear all" onPress={confirmClear} style={styles.flex} theme={theme} variant="ghost" />
          </View>
        </AnimatedEntrance>
      ) : null}
    </ScrollView>
  );
}

function AIPage({ onOpenRecaps }: { onOpenRecaps: () => void }) {
  const { assistantMessages, askAssistant, isAskingAssistant, theme, transcripts } = useAppState();
  const [question, setQuestion] = useState('');
  const visibleMessages = assistantMessages.slice(-6);

  const sendQuestion = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    setQuestion('');
    await askAssistant(trimmed);
  };

  return (
    <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <AnimatedEntrance>
        <View style={styles.headerBlock}>
          <Text style={[styles.pageTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>AI</Text>
          <Text style={[styles.pageSubtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Ask about what you saved.</Text>
        </View>
      </AnimatedEntrance>

      {transcripts.length === 0 ? (
        <AnimatedEntrance delay={60}>
          <SurfaceCard style={styles.emptyCard} theme={theme}>
            <Feather color={theme.textMuted} name="message-square" size={26} />
            <Text style={[styles.emptyTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>No recaps available</Text>
            <ActionButton label="Open recaps" onPress={onOpenRecaps} theme={theme} variant="secondary" />
          </SurfaceCard>
        </AnimatedEntrance>
      ) : (
        <>
          <AnimatedEntrance delay={60}>
            <View style={styles.promptRow}>
              {QUICK_PROMPTS.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => {
                    void sendQuestion(prompt);
                  }}
                  style={({ pressed }) => [
                    styles.promptChip,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      opacity: pressed ? 0.86 : 1,
                    },
                  ]}>
                  <Text style={[styles.promptText, { color: theme.text, fontFamily: theme.fonts.bodyMedium }]}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={120}>
            <View style={styles.chatWrap}>
              {visibleMessages.map((message) => {
                const isUser = message.role === 'user';

                return (
                  <View key={message.id} style={[styles.messageWrap, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}>
                    <View
                      style={[
                        styles.messageBubble,
                        {
                          backgroundColor: isUser ? theme.userBubble : theme.card,
                          borderColor: isUser ? 'transparent' : theme.border,
                        },
                      ]}>
                      <Text style={[styles.messageText, { color: isUser ? '#FFFFFF' : theme.text, fontFamily: theme.fonts.body }]}>{message.text}</Text>
                      <Text style={[styles.messageMeta, { color: isUser ? 'rgba(255,255,255,0.74)' : theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{formatTime(message.createdAt)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={180}>
            <View style={[styles.askBox, { backgroundColor: theme.card, borderColor: theme.border }]}> 
              <TextInput
                multiline
                onChangeText={setQuestion}
                placeholder="Ask about your recaps"
                placeholderTextColor={theme.textMuted}
                style={[styles.askInput, { color: theme.text, fontFamily: theme.fonts.bodyMedium }]}
                value={question}
              />
              <Pressable
                onPress={() => {
                  void sendQuestion(question);
                }}
                style={({ pressed }) => [styles.askButton, { backgroundColor: theme.accent, opacity: pressed || isAskingAssistant ? 0.82 : 1 }]}>
                <Feather color="#FFFFFF" name="arrow-up-right" size={18} />
              </Pressable>
            </View>
            {isAskingAssistant ? <Text style={[styles.statusNote, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Thinking...</Text> : null}
          </AnimatedEntrance>
        </>
      )}
    </ScrollView>
  );
}

function SettingsPage() {
  const { logout, preferences, retakeEarTest, setThemeMode, theme } = useAppState();

  const confirmLogout = () => {
    Alert.alert('Sign out?', 'You will need to sign in again next time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
      <AnimatedEntrance>
        <View style={styles.headerBlock}>
          <Text style={[styles.pageTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Settings</Text>
        </View>
      </AnimatedEntrance>

      <AnimatedEntrance delay={60}>
        <SurfaceCard style={styles.settingsCard} theme={theme}>
          <Text style={[styles.settingsTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>Theme</Text>
          <View style={[styles.themeSwitch, { backgroundColor: theme.elevated }]}> 
            <ThemeButton active={preferences.themeMode === 'light'} label="Light" onPress={() => void setThemeMode('light')} theme={theme} />
            <ThemeButton active={preferences.themeMode === 'dark'} label="Dark" onPress={() => void setThemeMode('dark')} theme={theme} />
          </View>
        </SurfaceCard>
      </AnimatedEntrance>

      <AnimatedEntrance delay={120}>
        <SurfaceCard style={styles.settingsCard} theme={theme}>
          <SettingsRow label="Retake ear test" onPress={retakeEarTest} theme={theme} />
          <SettingsRow danger label="Sign out" onPress={confirmLogout} theme={theme} />
        </SurfaceCard>
      </AnimatedEntrance>
    </ScrollView>
  );
}

function ThemeButton({
  active,
  label,
  onPress,
  theme,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useAppState>['theme'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.themeButton,
        {
          backgroundColor: active ? theme.card : 'transparent',
          borderColor: active ? theme.border : 'transparent',
          opacity: pressed ? 0.86 : 1,
        },
      ]}>
      <Text
        style={[
          styles.themeButtonText,
          {
            color: active ? theme.text : theme.textMuted,
            fontFamily: active ? theme.fonts.bodySemiBold : theme.fonts.bodyMedium,
          },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SettingsRow({
  label,
  onPress,
  theme,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  theme: ReturnType<typeof useAppState>['theme'];
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingsRow,
        {
          backgroundColor: theme.elevated,
          borderColor: theme.border,
          opacity: pressed ? 0.86 : 1,
        },
      ]}>
      <Text style={[styles.settingsRowText, { color: danger ? theme.danger : theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{label}</Text>
      <Feather color={theme.textMuted} name="chevron-right" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  pagePane: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  pageContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 136,
    gap: 16,
  },
  headerBlock: {
    gap: 6,
  },
  centeredHeader: {
    alignItems: 'center',
    gap: 8,
  },
  homePageContent: {
    flex: 1,
  },
  homeCenterWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 32,
    lineHeight: 36,
  },
  pageSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  homeCenter: {
    alignItems: 'center',
    gap: 16,
    paddingBottom: 12,
  },
  liveSupportCard: {
    gap: 14,
  },
  liveSupportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  liveSupportTitle: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15,
    lineHeight: 20,
  },
  liveSupportDetails: {
    gap: 10,
  },
  liveSupportNote: {
    fontSize: 13,
    lineHeight: 20,
  },
  statusButton: {
    borderRadius: 999,
  },
  statusHalo: {
    width: 180,
    height: 180,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCore: {
    width: 112,
    height: 112,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 42,
    lineHeight: 46,
  },
  statusSubtext: {
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 260,
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    lineHeight: 22,
  },
  listWrap: {
    gap: 12,
  },
  recapCard: {
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  recapTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
  },
  recapBody: {
    fontSize: 14,
    lineHeight: 22,
  },
  recapsActions: {
    flexDirection: 'row',
    gap: 10,
  },
  promptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  promptChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  promptText: {
    fontSize: 12,
    lineHeight: 16,
  },
  chatWrap: {
    gap: 10,
  },
  messageWrap: {
    width: '100%',
  },
  messageBubble: {
    maxWidth: '88%',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 22,
  },
  messageMeta: {
    fontSize: 11,
    lineHeight: 14,
  },
  askBox: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  askInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 110,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
  },
  askButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusNote: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  settingsCard: {
    gap: 14,
  },
  settingsTitle: {
    fontSize: 16,
    lineHeight: 20,
  },
  themeSwitch: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 18,
  },
  themeButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeButtonText: {
    fontSize: 14,
    lineHeight: 18,
  },
  settingsRow: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingsRowText: {
    fontSize: 15,
    lineHeight: 20,
  },
});
