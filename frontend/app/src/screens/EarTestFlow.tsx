import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HearingResultsChart } from '@/src/components/HearingResultsChart';
import { ActionButton, Atmosphere, Pill, SurfaceCard } from '@/src/components/primitives';
import { RAMPED_TONE_DURATION_MS, playRampedTone, prepareTonePlayer, stopTonePlayback } from '@/src/services/tonePlayer';
import { useAppState } from '@/src/state/AppProvider';
import type { HearingPoint, HearingSummary } from '@/src/types/app';
import { formatFrequency, formatRange } from '@/src/utils/format';
import {
  EAR_TEST_FREQUENCIES,
  TEST_EAR_ORDER,
  buildHearingProfile,
  createHearingPoint,
  describeEarSupport,
  getFrequencyVolumeProfile,
  getThresholdAtProgress,
  getVolumeLevelAtProgress,
} from '@/src/utils/hearing';

type EarTestStage = 'welcome' | 'guide' | 'testing' | 'review';

interface EarTestState {
  earIndex: number;
  frequencyIndex: number;
}

const ATTEMPT_DURATION_MS = RAMPED_TONE_DURATION_MS;
const VOLUME_METER_SEGMENTS = 8;

function createEarTestState(earIndex = 0): EarTestState {
  return {
    earIndex,
    frequencyIndex: 0,
  };
}

export function EarTestFlow() {
  const { canCancelEarTest, cancelEarTest, completeEarTest, isSavingProfile, theme } = useAppState();
  const [stage, setStage] = useState<EarTestStage>('welcome');
  const [measurements, setMeasurements] = useState<HearingPoint[]>([]);
  const [testState, setTestState] = useState<EarTestState>(() => createEarTestState());
  const [isToneActive, setIsToneActive] = useState(false);
  const [attemptProgressValue, setAttemptProgressValue] = useState(0);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslate = useRef(new Animated.Value(20)).current;
  const playbackProgress = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.18)).current;
  const attemptResolved = useRef(false);
  const attemptProgressRef = useRef(0);
  const activeAttemptKey = useRef(0);
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const currentEar = TEST_EAR_ORDER[testState.earIndex];
  const currentFrequency = EAR_TEST_FREQUENCIES[testState.frequencyIndex];
  const currentVolumeProfile = useMemo(() => getFrequencyVolumeProfile(currentFrequency), [currentFrequency]);
  const draftProfile = useMemo(
    () => (stage === 'review' ? buildHearingProfile(measurements) : null),
    [measurements, stage],
  );
  const attemptIndex = testState.earIndex * EAR_TEST_FREQUENCIES.length + testState.frequencyIndex;
  const totalAttempts = TEST_EAR_ORDER.length * EAR_TEST_FREQUENCIES.length;
  const progressWidth = playbackProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const volumeRingScale = playbackProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.84, 1.18],
  });
  const volumeRingOpacity = playbackProgress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.1, 0.18, 0.28],
  });
  const liveVolumeLevel = stage === 'testing' && isToneActive ? getVolumeLevelAtProgress(currentFrequency, attemptProgressValue) : 0;
  const volumeMeterFill = useMemo(
    () =>
      Array.from({ length: VOLUME_METER_SEGMENTS }, (_, index) =>
        Math.max(0, Math.min(1, attemptProgressValue * VOLUME_METER_SEGMENTS - index)),
      ),
    [attemptProgressValue],
  );

  useEffect(() => {
    void prepareTonePlayer();
  }, []);

  useEffect(() => {
    const listenerId = playbackProgress.addListener(({ value }) => {
      attemptProgressRef.current = value;
      setAttemptProgressValue(value);
    });

    return () => {
      playbackProgress.removeListener(listenerId);
    };
  }, [playbackProgress]);

  useEffect(() => {
    if (stage !== 'welcome' && stage !== 'guide') {
      return;
    }

    modalOpacity.setValue(0);
    modalTranslate.setValue(20);

    Animated.parallel([
      Animated.timing(modalOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(modalTranslate, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [modalOpacity, modalTranslate, stage]);

  const stopPulse = useCallback(() => {
    pulseLoop.current?.stop();
    pulseLoop.current = null;
    pulseScale.setValue(1);
    pulseOpacity.setValue(0.18);
  }, [pulseOpacity, pulseScale]);

  const startPulse = useCallback(() => {
    stopPulse();

    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.07,
            duration: 420,
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 520,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0.38,
            duration: 420,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.16,
            duration: 520,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    pulseLoop.current = animation;
    animation.start();
  }, [pulseOpacity, pulseScale, stopPulse]);

  const advanceToNextAttempt = useCallback(() => {
    if (testState.frequencyIndex >= EAR_TEST_FREQUENCIES.length - 1) {
      if (testState.earIndex >= TEST_EAR_ORDER.length - 1) {
        setStage('review');
        return;
      }

      setTestState(createEarTestState(testState.earIndex + 1));
      return;
    }

    setTestState((current) => ({
      ...current,
      frequencyIndex: current.frequencyIndex + 1,
    }));
  }, [testState.earIndex, testState.frequencyIndex]);

  const finishAttempt = useCallback(
    (heard: boolean) => {
      const threshold = heard
        ? getThresholdAtProgress(currentFrequency, attemptProgressRef.current)
        : currentVolumeProfile.endThreshold;

      const point = createHearingPoint({
        ear: currentEar,
        frequency: currentFrequency,
        heard,
        threshold,
      });

      setMeasurements((current) => [...current, point]);
      advanceToNextAttempt();
    },
    [advanceToNextAttempt, currentEar, currentFrequency, currentVolumeProfile.endThreshold],
  );

  useEffect(() => {
    if (stage !== 'testing') {
      activeAttemptKey.current += 1;
      void stopTonePlayback();
      stopPulse();
      attemptProgressRef.current = 0;
      setAttemptProgressValue(0);
      playbackProgress.setValue(0);
      setIsToneActive(false);
      return;
    }

    attemptResolved.current = false;
    const attemptKey = activeAttemptKey.current + 1;
    activeAttemptKey.current = attemptKey;
    attemptProgressRef.current = 0;
    setAttemptProgressValue(0);
    playbackProgress.setValue(0);
    startPulse();
    setIsToneActive(true);

    Animated.timing(playbackProgress, {
      toValue: 1,
      duration: ATTEMPT_DURATION_MS,
      useNativeDriver: false,
    }).start();

    void playRampedTone({
      ear: currentEar,
      frequency: currentFrequency,
    }).finally(() => {
      if (activeAttemptKey.current === attemptKey) {
        setIsToneActive(false);
      }
    });

    const timeout = setTimeout(() => {
      if (!attemptResolved.current) {
        attemptResolved.current = true;
        void stopTonePlayback();
        stopPulse();
        finishAttempt(false);
      }
    }, ATTEMPT_DURATION_MS);

    return () => {
      activeAttemptKey.current += 1;
      clearTimeout(timeout);
      void stopTonePlayback();
      stopPulse();
      playbackProgress.stopAnimation();
      attemptProgressRef.current = 0;
      setAttemptProgressValue(0);
      playbackProgress.setValue(0);
      setIsToneActive(false);
    };
  }, [currentEar, currentFrequency, finishAttempt, playbackProgress, stage, startPulse, stopPulse]);

  const handleHearTone = () => {
    if (stage !== 'testing' || attemptResolved.current) {
      return;
    }

    attemptResolved.current = true;
    setIsToneActive(false);
    void stopTonePlayback();
    stopPulse();
    finishAttempt(true);
  };

  const beginTest = () => {
    setMeasurements([]);
    setTestState(createEarTestState());
    attemptProgressRef.current = 0;
    setAttemptProgressValue(0);
    setStage('testing');
  };

  const handleSaveProfile = async () => {
    if (!draftProfile) {
      return;
    }

    await completeEarTest(draftProfile);
  };

  const handleCancelRetake = () => {
    void stopTonePlayback();
    cancelEarTest();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Atmosphere theme={theme} />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        {(stage === 'welcome' || stage === 'guide') && <EarTestBackdrop theme={theme} />}

        {stage === 'testing' ? (
          <View style={styles.screen}>
            <Animated.View style={styles.contentWrap}>
              <View style={styles.headerBlock}>
                <View style={styles.earTabs}>
                  <EarTab active={currentEar === 'left'} label="Left" theme={theme} />
                  <EarTab active={currentEar === 'right'} label="Right" theme={theme} />
                </View>
                <Pill accent label={formatFrequency(currentFrequency)} theme={theme} />
                <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Tap as soon as you hear it.</Text>
                <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>The tone starts soft and rises while we test each fixed frequency.</Text>
              </View>

              <View style={styles.middleWrap}>
                <Pressable
                  disabled={!isToneActive}
                  onPress={handleHearTone}
                  style={({ pressed }) => [
                    styles.hearButton,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      opacity: !isToneActive ? 0.72 : pressed ? 0.92 : 1,
                    },
                  ]}>
                  <Animated.View
                    style={[
                      styles.pulseHalo,
                      {
                        backgroundColor: theme.accentSoft,
                        opacity: pulseOpacity,
                        transform: [{ scale: pulseScale }],
                      },
                    ]}
                  />
                  <Animated.View
                    style={[
                      styles.volumeRing,
                      {
                        borderColor: theme.accent,
                        opacity: volumeRingOpacity,
                        transform: [{ scale: volumeRingScale }],
                      },
                    ]}
                  />
                  <View style={[styles.hearCore, { backgroundColor: theme.accent }]}>
                    <MaterialCommunityIcons color="#FFFFFF" name="ear-hearing" size={42} />
                    <View style={styles.sideBadge}>
                      <Text style={[styles.sideBadgeText, { color: theme.accent, fontFamily: theme.fonts.bodyBold }]}>{currentEar === 'left' ? 'L' : 'R'}</Text>
                    </View>
                  </View>
                  <Text style={[styles.hearButtonText, { color: theme.text, fontFamily: theme.fonts.bodyBold }]}>Tap when audible</Text>
                </Pressable>
              </View>

              <View style={[styles.statusCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.rowBetween}>
                  <View style={styles.flex}>
                    <Text style={[styles.statusLabel, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>
                      {isToneActive ? 'Volume rising' : 'Preparing next sound'}
                    </Text>
                    <Text style={[styles.statusMeta, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>
                      {formatFrequency(currentFrequency)} - {isToneActive ? `step ${liveVolumeLevel}/${currentVolumeProfile.steps}` : 'starting over'}
                    </Text>
                  </View>
                  <Text style={[styles.statusStep, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>
                    {attemptIndex + 1}/{totalAttempts}
                  </Text>
                </View>

                <View style={styles.volumeMeterRow}>
                  {volumeMeterFill.map((fillAmount, index) => {
                    const barHeight = 20 + index * 5;

                    return (
                      <View
                        key={`meter-${index}`}
                        style={[
                          styles.volumeMeterSlot,
                          {
                            backgroundColor: theme.progressTrack,
                            borderColor: theme.border,
                            height: barHeight,
                          },
                        ]}>
                        <View
                          style={[
                            styles.volumeMeterFill,
                            {
                              backgroundColor: theme.accent,
                              height: `${Math.max(fillAmount, 0.08) * 100}%`,
                              opacity: fillAmount > 0 ? 1 : 0.18,
                            },
                          ]}
                        />
                      </View>
                    );
                  })}
                </View>

                <View style={styles.rowBetween}>
                  <Text style={[styles.statusHint, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Lower tones ramp harder, higher tones rise in finer steps.</Text>
                  <Text style={[styles.statusHint, styles.statusHintCount, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{totalAttempts} total</Text>
                </View>

                <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}>
                  <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: theme.accent }]} />
                </View>
              </View>
            </Animated.View>
          </View>
        ) : null}

        {stage === 'review' && draftProfile ? (
          <ScrollView contentContainerStyle={styles.reviewScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.headerBlock}>
              <Pill accent label="Ready" theme={theme} />
              <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Your profile is ready.</Text>
            </View>

            <SurfaceCard style={styles.reviewCard} theme={theme}>
              <ReviewItem summary={draftProfile.leftSummary} title="Left ear" theme={theme} />
              <ReviewItem summary={draftProfile.rightSummary} title="Right ear" theme={theme} />
            </SurfaceCard>

            <HearingResultsChart points={draftProfile.points} theme={theme} />

            <ActionButton
              disabled={isSavingProfile}
              label={isSavingProfile ? 'Saving...' : 'Continue'}
              onPress={() => {
                void handleSaveProfile();
              }}
              theme={theme}
            />
          </ScrollView>
        ) : null}
      </SafeAreaView>

      <Modal animationType="none" presentationStyle="overFullScreen" transparent visible={stage === 'welcome' || stage === 'guide'}>
        <View style={[styles.modalRoot, { backgroundColor: theme.overlay }]}>
          <Animated.View style={[styles.modalWrap, { opacity: modalOpacity, transform: [{ translateY: modalTranslate }] }]}> 
            <SurfaceCard style={styles.modalCard} theme={theme}>
              {stage === 'welcome' ? (
                <>
                  <View style={styles.modalTopRow}>
                    {canCancelEarTest ? <CircleBackButton onPress={handleCancelRetake} theme={theme} /> : <View style={styles.backButtonSpacer} />}
                  </View>
                  <View style={[styles.modalIcon, { backgroundColor: theme.accentSoft }]}> 
                    <MaterialCommunityIcons color={theme.accent} name="ear-hearing" size={28} />
                  </View>
                  <Text style={[styles.modalTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Ear test</Text>
                  <Text style={[styles.modalText, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>We will run through a fixed set of tones in each ear and save when you first hear each one.</Text>
                  <ActionButton label="Continue" onPress={() => setStage('guide')} theme={theme} />
                </>
              ) : null}

              {stage === 'guide' ? (
                <>
                  <View style={styles.modalTopRow}>
                    <CircleBackButton onPress={() => setStage('welcome')} theme={theme} />
                  </View>
                  <Text style={[styles.modalTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Before you start</Text>
                  <View style={styles.instructionsList}>
                    <Instruction icon="headphones" text="Wear both earbuds or headphones." theme={theme} />
                    <Instruction icon="volume-2" text="Each tone starts soft and rises. Tap as soon as you hear it." theme={theme} />
                    <Instruction icon="clock" text="If you hear nothing, wait and the test will move on." theme={theme} />
                  </View>
                  <ActionButton label="Got it" onPress={beginTest} theme={theme} />
                </>
              ) : null}
            </SurfaceCard>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

function EarTestBackdrop({ theme }: { theme: ReturnType<typeof useAppState>['theme'] }) {
  return (
    <View style={styles.screen}>
      <View style={styles.middleWrap}>
        <View style={[styles.previewCircle, { backgroundColor: theme.card, borderColor: theme.border }]}> 
          <MaterialCommunityIcons color={theme.accent} name="ear-hearing" size={36} />
        </View>
      </View>
    </View>
  );
}

function EarTab({
  active,
  label,
  theme,
}: {
  active: boolean;
  label: string;
  theme: ReturnType<typeof useAppState>['theme'];
}) {
  return (
    <View
      style={[
        styles.earTab,
        {
          backgroundColor: active ? theme.accentSoft : theme.card,
          borderColor: active ? 'transparent' : theme.border,
        },
      ]}>
      <Text
        style={[
          styles.earTabText,
          {
            color: active ? theme.accent : theme.textMuted,
            fontFamily: active ? theme.fonts.bodyBold : theme.fonts.bodyMedium,
          },
        ]}>
        {label}
      </Text>
    </View>
  );
}

function Instruction({
  icon,
  text,
  theme,
}: {
  icon: keyof typeof Feather.glyphMap;
  text: string;
  theme: ReturnType<typeof useAppState>['theme'];
}) {
  return (
    <View style={[styles.instructionRow, { backgroundColor: theme.elevated, borderColor: theme.border }]}> 
      <View style={[styles.instructionIcon, { backgroundColor: theme.card }]}> 
        <Feather color={theme.accent} name={icon} size={16} />
      </View>
      <Text style={[styles.instructionText, { color: theme.text, fontFamily: theme.fonts.bodyMedium }]}>{text}</Text>
    </View>
  );
}

function ReviewItem({
  summary,
  title,
  theme,
}: {
  summary: HearingSummary;
  title: string;
  theme: ReturnType<typeof useAppState>['theme'];
}) {
  const supportText = describeEarSupport(summary);

  return (
    <View style={[styles.reviewItem, { backgroundColor: theme.elevated, borderColor: theme.border }]}> 
      <View style={[styles.reviewIcon, { backgroundColor: theme.card }]}> 
        <MaterialCommunityIcons color={theme.accent} name="ear-hearing" size={20} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.reviewTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{title}</Text>
        <Text style={[styles.reviewText, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>{supportText}</Text>
        <View style={styles.reviewMetricsRow}>
          <View style={[styles.reviewMetric, { backgroundColor: theme.card, borderColor: theme.border }]}> 
            <Text style={[styles.reviewMetricLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>Range</Text>
            <Text style={[styles.reviewMetricValue, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{formatRange(summary.lowRangeHz, summary.highRangeHz)}</Text>
          </View>
          <View style={[styles.reviewMetric, { backgroundColor: theme.card, borderColor: theme.border }]}> 
            <Text style={[styles.reviewMetricLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>Avg loss</Text>
            <Text style={[styles.reviewMetricValue, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{summary.averageLossDb} dB</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function CircleBackButton({
  onPress,
  theme,
}: {
  onPress: () => void;
  theme: ReturnType<typeof useAppState>['theme'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.circleBackButton,
        {
          backgroundColor: theme.elevated,
          borderColor: theme.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}>
      <Feather color={theme.text} name="arrow-left" size={18} />
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
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  reviewScroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 18,
  },
  contentWrap: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 20,
  },
  flex: {
    flex: 1,
  },
  headerBlock: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 32,
    lineHeight: 36,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  earTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  earTab: {
    minWidth: 82,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  earTabText: {
    fontSize: 13,
    lineHeight: 16,
  },
  middleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hearButton: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    overflow: 'hidden',
  },
  pulseHalo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
  },
  volumeRing: {
    position: 'absolute',
    width: 238,
    height: 238,
    borderRadius: 999,
    borderWidth: 3,
  },
  hearCore: {
    width: 150,
    height: 150,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBadge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBadgeText: {
    fontSize: 13,
    lineHeight: 16,
  },
  hearButtonText: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  statusCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  statusLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  statusMeta: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  statusStep: {
    fontSize: 13,
    lineHeight: 18,
  },
  volumeMeterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  volumeMeterSlot: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  volumeMeterFill: {
    width: '100%',
    borderRadius: 999,
  },
  statusHint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  statusHintCount: {
    textAlign: 'right',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalWrap: {
    width: '100%',
  },
  modalCard: {
    gap: 18,
  },
  modalTopRow: {
    minHeight: 40,
    alignSelf: 'stretch',
  },
  backButtonSpacer: {
    width: 40,
    height: 40,
  },
  circleBackButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 28,
    lineHeight: 32,
  },
  modalText: {
    fontSize: 15,
    lineHeight: 22,
  },
  instructionsList: {
    gap: 10,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  instructionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  previewCircle: {
    width: 160,
    height: 160,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewCard: {
    gap: 12,
  },
  reviewItem: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  reviewText: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 20,
  },
  reviewMetricsRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reviewMetric: {
    minWidth: 112,
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  reviewMetricLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  reviewMetricValue: {
    fontSize: 13,
    lineHeight: 18,
  },
});
