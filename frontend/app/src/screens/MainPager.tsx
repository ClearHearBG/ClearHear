import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { TuningSlider } from '@/src/components/TuningSlider';
import { ActionButton, AnimatedEntrance, Atmosphere, Pill, SurfaceCard } from '@/src/components/primitives';
import type { AudioDeviceSummary } from '@/modules/ble-audio';
import { useAppState } from '@/src/state/AppProvider';
import { DEFAULT_HEARING_CALIBRATION, normalizeHearingCalibration } from '@/src/utils/hearing';
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
  const {
    audioBufferStatus,
    hearingSupportStatus,
    isHearingSupportBusy,
    preferences,
    setAmplificationEnabled,
    setFrequencyMappingEnabled,
    setNoiseFilteringEnabled,
    theme,
    toggleDeviceEnabled,
  } = useAppState();
  const isRequested = preferences.isDeviceEnabled;
  const isRunning = hearingSupportStatus.stage === 'running';
  const isStarting = hearingSupportStatus.stage === 'starting';
  const isStopping = isHearingSupportBusy && !isRequested && !isRunning && !isStarting;
  const canRetry = isRequested && !isRunning && !isStarting && !isHearingSupportBusy;
  const statusTitle = isRunning ? 'On' : isStarting ? 'Starting' : isStopping ? 'Stopping' : canRetry ? 'Retry' : 'Off';
  const directionalityWarning = getDirectionalityWarning(hearingSupportStatus);
  const statusDescription = isRunning
    ? `Live audio processing is running through ${hearingSupportStatus.selectedOutput?.name ?? 'your headphones'}.`
    : isStarting
      ? 'Opening the live audio route.'
      : isStopping
        ? 'Turning live audio processing off.'
        : canRetry
          ? hearingSupportStatus.lastError ?? 'Audio processing did not start. Tap the circle to try again.'
          : '';
  const powerIcon = canRetry ? 'refresh' : isRequested ? 'power' : 'power-off';
  const powerColor = isRunning ? theme.accent : isStarting ? theme.secondary : canRetry ? theme.danger : theme.textMuted;
  const togglesEnabled = isRequested;
  const activeDirectionalityWarning = isRequested ? directionalityWarning : null;
  const bufferedSeconds = Math.min(
    Math.round(audioBufferStatus.bufferedSeconds),
    Math.round(audioBufferStatus.maxBufferSeconds),
  );
  const micStatusText = isRequested
    ? audioBufferStatus.hasRecentInput
      ? `Mic input detected. Buffer: ${bufferedSeconds}s / ${Math.round(audioBufferStatus.maxBufferSeconds)}s.`
      : `Listening is on, but no strong mic input was detected yet. Buffer: ${bufferedSeconds}s / ${Math.round(audioBufferStatus.maxBufferSeconds)}s.`
    : 'Turn listening on to start filling the local audio buffer.';

  return (
    <View style={[styles.pageContent, styles.homePageContent]}>
      <AnimatedEntrance>
        <View style={styles.centeredHeader}>
          <Text style={[styles.pageTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Listening</Text>
          <Text style={[styles.pageSubtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>
            {isRunning || isStarting
              ? `Running through ${hearingSupportStatus.selectedOutput?.name ?? 'your headphones'}.`
              : 'Turn audio processing on when you need it.'}
          </Text>
        </View>
      </AnimatedEntrance>

      <AnimatedEntrance delay={60} style={styles.homeCenterWrap}>
        <View style={styles.homeCenter}>
          <Pressable
            accessibilityLabel={isRunning || isStarting ? 'Turn audio processing off' : canRetry ? 'Retry audio processing' : 'Turn audio processing on'}
            accessibilityRole="button"
            disabled={isHearingSupportBusy}
            onPress={() => {
              void toggleDeviceEnabled();
            }}
            style={({ pressed }) => [styles.statusButton, { opacity: isHearingSupportBusy ? 0.7 : pressed ? 0.9 : 1 }]}>
              <View style={[styles.statusHalo, { backgroundColor: isRequested ? theme.accentSoft : theme.elevated }]}>
                <View style={[styles.statusCore, { backgroundColor: powerColor }]}>
                  <MaterialCommunityIcons color="#FFFFFF" name={powerIcon} size={38} />
                </View>
              </View>
          </Pressable>
          <Text style={[styles.statusText, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>{statusTitle}</Text>
          {statusDescription ? (
            <Text style={[styles.statusSubtext, { color: theme.textMuted, fontFamily: theme.fonts.body }]}> 
              {statusDescription}
            </Text>
          ) : null}

          <View style={styles.homeToggles}>
            <HomeModeToggle
              disabled={isHearingSupportBusy || !togglesEnabled}
              label="Sound amplification"
              onToggle={() => {
                void setAmplificationEnabled(!preferences.isAmplificationEnabled);
              }}
              theme={theme}
              value={preferences.isAmplificationEnabled}
              visuallyMuted={!togglesEnabled}
            />
            <HomeModeToggle
              disabled={isHearingSupportBusy || !togglesEnabled}
              label="Frequency band mapping"
              onToggle={() => {
                void setFrequencyMappingEnabled(!preferences.isFrequencyMappingEnabled);
              }}
              theme={theme}
              value={preferences.isFrequencyMappingEnabled}
              visuallyMuted={!togglesEnabled}
            />
            <HomeModeToggle
              disabled={isHearingSupportBusy || !togglesEnabled}
              label="Noise filtering"
              onToggle={() => {
                void setNoiseFilteringEnabled(!preferences.isNoiseFilteringEnabled);
              }}
              theme={theme}
              value={preferences.isNoiseFilteringEnabled}
              visuallyMuted={!togglesEnabled}
            />
          </View>
          {activeDirectionalityWarning ? (
            <SurfaceCard style={styles.warningCard} theme={theme}>
              <View style={styles.warningHeader}>
                <Feather color="#C58A12" name="alert-triangle" size={18} />
                <Text style={[styles.warningTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{activeDirectionalityWarning.title}</Text>
              </View>
              <Text style={[styles.warningText, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>{activeDirectionalityWarning.description}</Text>
            </SurfaceCard>
          ) : null}
          <Text style={[styles.micStatusText, { color: audioBufferStatus.hasRecentInput ? theme.accent : theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>
            {micStatusText}
          </Text>
        </View>
      </AnimatedEntrance>
    </View>
  );
}

function HomeModeToggle({
  disabled,
  label,
  onToggle,
  theme,
  value,
  visuallyMuted = false,
}: {
  disabled: boolean;
  label: string;
  onToggle: () => void;
  theme: ReturnType<typeof useAppState>['theme'];
  value: boolean;
  visuallyMuted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.homeToggleCard,
        {
          backgroundColor: theme.card,
          borderColor: visuallyMuted ? theme.border : value ? theme.accent : theme.border,
          opacity: disabled ? 0.46 : pressed ? 0.9 : 1,
        },
      ]}>
      <View style={styles.homeToggleBody}>
        <Text
          style={[
            styles.homeToggleLabel,
            {
              color: visuallyMuted ? theme.textMuted : theme.text,
              fontFamily: theme.fonts.bodySemiBold,
            },
          ]}>
          {label}
        </Text>
      </View>
      <View
        style={[
          styles.homeToggleTrack,
          {
            backgroundColor: visuallyMuted ? theme.elevated : value ? theme.accentSoft : theme.elevated,
            borderColor: visuallyMuted ? theme.border : value ? theme.accent : theme.border,
          },
        ]}>
        <View
          style={[
            styles.homeToggleThumb,
            {
              backgroundColor: visuallyMuted ? theme.tabIconMuted : value ? theme.accent : theme.textMuted,
              alignSelf: value ? 'flex-end' : 'flex-start',
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

function getDirectionalityWarning(hearingSupportStatus: ReturnType<typeof useAppState>['hearingSupportStatus']) {
  const output = hearingSupportStatus.selectedOutput;

  if (!output || !hearingSupportStatus.usingSharedInput) {
    return null;
  }

  if (output.isBluetooth) {
    return {
      title: 'Single Bluetooth microphone',
      description: 'These Bluetooth earphones are only exposing one microphone, so directionality is reduced.',
    };
  }

  return {
    title: 'Single microphone mode',
    description: 'Non-Bluetooth earphones fall back to one microphone, so directionality is reduced. Two-microphone directional mode is only available on supported Bluetooth earphones.',
  };
}

function RecapsPage({ onOpenAI }: { onOpenAI: () => void }) {
  const { clearConversationData, deleteTranscript, isTranscribing, theme, transcripts, transcribeLastFiveMinutes } = useAppState();

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

  const confirmDeleteTranscript = (id: string) => {
    Alert.alert('Delete recap?', 'This removes this recap from your saved history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteTranscript(id);
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
          label={isTranscribing ? 'Creating recap...' : 'Create recap from last 15 seconds'}
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
                  <View style={styles.recapMetaWrap}>
                    <Pill label={formatRelative(transcript.createdAt)} theme={theme} />
                    <Pressable
                      onPress={() => confirmDeleteTranscript(transcript.id)}
                      style={({ pressed }) => [
                        styles.recapDeleteButton,
                        {
                          backgroundColor: theme.elevated,
                          borderColor: theme.border,
                          opacity: pressed ? 0.82 : 1,
                        },
                      ]}>
                      <Feather color={theme.danger} name="trash-2" size={16} />
                    </Pressable>
                  </View>
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
  const {
    clearLocalEarTestData,
    hearingProfile,
    hearingSupportStatus,
    isHearingSupportBusy,
    logout,
    preferences,
    retakeEarTest,
    setPreferredInputDevice,
    setPreferredOutputDevice,
    setThemeMode,
    theme,
    updateHearingCalibration,
  } = useAppState();
  const [expandedSelector, setExpandedSelector] = useState<'input' | 'output' | null>(null);
  const calibration = hearingProfile?.calibration;
  const [settingsCalibration, setSettingsCalibration] = useState(() =>
    normalizeHearingCalibration(hearingProfile?.calibration ?? DEFAULT_HEARING_CALIBRATION),
  );

  useEffect(() => {
    setSettingsCalibration(normalizeHearingCalibration(hearingProfile?.calibration ?? DEFAULT_HEARING_CALIBRATION));
  }, [hearingProfile?.calibration]);

  useEffect(() => {
    if (!calibration) {
      return;
    }

    if (
      calibration.baseGainDb === settingsCalibration.baseGainDb &&
      calibration.boostMultiplier === settingsCalibration.boostMultiplier
    ) {
      return;
    }

    const timeout = setTimeout(() => {
      void updateHearingCalibration(settingsCalibration);
    }, 180);

    return () => {
      clearTimeout(timeout);
    };
  }, [calibration, settingsCalibration, updateHearingCalibration]);

  const inputOptions = useMemo(
    () => [
      {
        id: null,
        label: 'Automatic',
        description: 'Prioritize headset microphones first and keep phone microphones last.',
      },
      ...(hearingSupportStatus.availableInputs ?? []).map((device) => ({
        id: device.id,
        label: device.name,
        description: describeDevice(device),
      })),
    ],
    [hearingSupportStatus.availableInputs],
  );

  const outputOptions = useMemo(
    () => [
      {
        id: null,
        label: 'Automatic',
        description: 'Pick the fastest safe headphone route that is connected right now.',
      },
      ...(hearingSupportStatus.availableOutputs ?? []).map((device) => ({
        id: device.id,
        label: device.name,
        description: describeDevice(device),
      })),
    ],
    [hearingSupportStatus.availableOutputs],
  );

  const selectedInputLabel =
    inputOptions.find((option) => option.id === preferences.preferredInputId)?.label ?? 'Automatic';
  const selectedOutputLabel =
    outputOptions.find((option) => option.id === preferences.preferredOutputId)?.label ?? 'Automatic';

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

  const confirmClearLocalEarTestData = () => {
    Alert.alert('Clear local ear test data?', 'This removes all saved ear test data from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          clearLocalEarTestData();
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
          <Text style={[styles.settingsTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>Sound tuning</Text>
          <TuningSlider
            helper="Raises all outside sound before your hearing-loss shaping. Increase this if your earbuds block too much of the room."
            label="Base lift"
            max={18}
            min={0}
            onChange={(value) => setSettingsCalibration((current) => ({ ...current, baseGainDb: value }))}
            step={0.5}
            theme={theme}
            value={settingsCalibration.baseGainDb}
            valueFormatter={(value) => `+${value.toFixed(1)} dB`}
          />
          <TuningSlider
            helper="Scales how strongly your hearing profile boosts each side. Increase this if speech still feels too soft."
            label="Profile strength"
            max={2.2}
            min={0.5}
            onChange={(value) => setSettingsCalibration((current) => ({ ...current, boostMultiplier: value }))}
            step={0.05}
            theme={theme}
            value={settingsCalibration.boostMultiplier}
            valueFormatter={(value) => `${value.toFixed(2)}x`}
          />
        </SurfaceCard>
      </AnimatedEntrance>

      <AnimatedEntrance delay={180}>
        <SurfaceCard style={styles.settingsCard} theme={theme}>
          <Text style={[styles.settingsTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>Audio route</Text>
          <DeviceSelector
            disabled={isHearingSupportBusy}
            expanded={expandedSelector === 'input'}
            label="Input"
            onSelect={(deviceId) => {
              setExpandedSelector(null);
              void setPreferredInputDevice(deviceId);
            }}
            onToggle={() => setExpandedSelector((current) => (current === 'input' ? null : 'input'))}
            options={inputOptions}
            selectedId={preferences.preferredInputId}
            selectedLabel={selectedInputLabel}
            theme={theme}
          />
          <DeviceSelector
            disabled={isHearingSupportBusy}
            expanded={expandedSelector === 'output'}
            label="Output"
            onSelect={(deviceId) => {
              setExpandedSelector(null);
              void setPreferredOutputDevice(deviceId);
            }}
            onToggle={() => setExpandedSelector((current) => (current === 'output' ? null : 'output'))}
            options={outputOptions}
            selectedId={preferences.preferredOutputId}
            selectedLabel={selectedOutputLabel}
            theme={theme}
          />
          <Text style={[styles.settingsHint, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Automatic keeps phone microphones as the fallback path and prefers the fastest connected headset route first.</Text>
        </SurfaceCard>
      </AnimatedEntrance>

      <AnimatedEntrance delay={240}>
        <SurfaceCard style={styles.settingsCard} theme={theme}>
          <SettingsRow label="Retake ear test" onPress={retakeEarTest} theme={theme} />
          <SettingsRow danger label="Clear local ear test data" onPress={confirmClearLocalEarTestData} theme={theme} />
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

function DeviceSelector({
  disabled,
  expanded,
  label,
  onSelect,
  onToggle,
  options,
  selectedId,
  selectedLabel,
  theme,
}: {
  disabled: boolean;
  expanded: boolean;
  label: string;
  onSelect: (deviceId: number | null) => void;
  onToggle: () => void;
  options: { id: number | null; label: string; description: string }[];
  selectedId: number | null;
  selectedLabel: string;
  theme: ReturnType<typeof useAppState>['theme'];
}) {
  return (
    <View style={styles.selectorGroup}>
      <Text style={[styles.selectorLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{label}</Text>
      <Pressable
        disabled={disabled}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.selectorTrigger,
          {
            backgroundColor: theme.elevated,
            borderColor: theme.border,
            opacity: disabled ? 0.55 : pressed ? 0.86 : 1,
          },
        ]}>
        <Text style={[styles.selectorValue, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{selectedLabel}</Text>
        <Feather color={theme.textMuted} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>

      {expanded ? (
        <View
          style={[styles.selectorOptions, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          {options.map((option) => {
            const active = option.id === selectedId;

            return (
              <Pressable
                key={`${label}-${option.id ?? 'auto'}`}
                onPress={() => onSelect(option.id)}
                style={({ pressed }) => [
                  styles.selectorOption,
                  {
                    backgroundColor: active ? theme.accentSoft : 'transparent',
                    opacity: pressed ? 0.84 : 1,
                  },
                ]}>
                <View style={styles.selectorOptionBody}>
                  <Text
                    style={[
                      styles.selectorOptionTitle,
                      {
                        color: active ? theme.accent : theme.text,
                        fontFamily: active ? theme.fonts.bodySemiBold : theme.fonts.bodyMedium,
                      },
                    ]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.selectorOptionMeta, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>{option.description}</Text>
                </View>
                {active ? <Feather color={theme.accent} name="check" size={16} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function describeDevice(device: AudioDeviceSummary): string {
  const captureLabel = device.channelCounts.some((count) => count >= 2) ? '2-channel' : 'shared input';
  const sampleRate = device.sampleRates[0];
  return sampleRate ? `${device.typeLabel} - ${captureLabel} - ${(sampleRate / 1000).toFixed(1)} kHz` : `${device.typeLabel} - ${captureLabel}`;
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
  homeToggles: {
    width: '100%',
    maxWidth: 360,
    gap: 10,
  },
  homeToggleCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  homeToggleBody: {
    flex: 1,
    gap: 4,
  },
  homeToggleLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  homeToggleTrack: {
    width: 54,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
    justifyContent: 'center',
  },
  homeToggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 999,
  },
  warningCard: {
    width: '100%',
    maxWidth: 340,
    gap: 8,
    padding: 16,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 19,
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
  micStatusText: {
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280,
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
  recapMetaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recapDeleteButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  settingsHint: {
    fontSize: 13,
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
  selectorGroup: {
    gap: 8,
  },
  selectorLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  selectorTrigger: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectorValue: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  selectorOptions: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  selectorOption: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectorOptionBody: {
    flex: 1,
    gap: 2,
  },
  selectorOptionTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  selectorOptionMeta: {
    fontSize: 12,
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
