import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, Atmosphere, Pill, SurfaceCard } from '@/src/components/primitives';
import { playRampedTone, prepareTonePlayer, stopTonePlayback } from '@/src/services/tonePlayer';
import { useAppState } from '@/src/state/AppProvider';
import type { HearingPoint } from '@/src/types/app';
import {
  ANCHOR_TEST_FREQUENCY,
  buildHearingProfile,
  createHearingPoint,
  describeEarSupport,
  getStartingThreshold,
  MAX_TEST_FREQUENCY,
  MIN_TEST_FREQUENCY,
  nextFrequencyCandidate,
  TEST_EAR_ORDER,
  TEST_SEARCH_ROUNDS,
} from '@/src/utils/hearing';

type EarTestStage = 'welcome' | 'guide' | 'testing' | 'review';
type SearchPhase = 'anchor' | 'low' | 'high';

interface EarSearchState {
  earIndex: number;
  highMax: number;
  highMin: number;
  highRounds: number;
  lowMax: number;
  lowMin: number;
  lowRounds: number;
  phase: SearchPhase;
}

const ATTEMPT_DURATION_MS = 2100;

function createEarSearchState(earIndex = 0): EarSearchState {
  return {
    earIndex,
    highMax: MAX_TEST_FREQUENCY,
    highMin: ANCHOR_TEST_FREQUENCY,
    highRounds: 0,
    lowMax: ANCHOR_TEST_FREQUENCY,
    lowMin: MIN_TEST_FREQUENCY,
    lowRounds: 0,
    phase: 'anchor',
  };
}

function phaseTitle(phase: SearchPhase): string {
  if (phase === 'low') {
    return 'Lower sounds';
  }

  if (phase === 'high') {
    return 'Higher sounds';
  }

  return 'Starting point';
}

export function EarTestFlow() {
  const { completeEarTest, isSavingProfile, theme } = useAppState();
  const [stage, setStage] = useState<EarTestStage>('welcome');
  const [measurements, setMeasurements] = useState<HearingPoint[]>([]);
  const [searchState, setSearchState] = useState<EarSearchState>(() => createEarSearchState());
  const [isToneActive, setIsToneActive] = useState(false);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslate = useRef(new Animated.Value(20)).current;
  const playbackProgress = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.18)).current;
  const attemptResolved = useRef(false);
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const currentEar = TEST_EAR_ORDER[searchState.earIndex];
  const currentFrequency =
    searchState.phase === 'anchor'
      ? ANCHOR_TEST_FREQUENCY
      : searchState.phase === 'low'
        ? nextFrequencyCandidate(searchState.lowMin, searchState.lowMax)
        : nextFrequencyCandidate(searchState.highMin, searchState.highMax);
  const currentThreshold = getStartingThreshold(currentFrequency);
  const draftProfile = useMemo(
    () => (stage === 'review' ? buildHearingProfile(measurements) : null),
    [measurements, stage],
  );
  const attemptIndex =
    searchState.earIndex * (1 + TEST_SEARCH_ROUNDS * 2) +
    (searchState.phase === 'anchor'
      ? 0
      : searchState.phase === 'low'
        ? 1 + searchState.lowRounds
        : 1 + TEST_SEARCH_ROUNDS + searchState.highRounds);
  const totalAttempts = TEST_EAR_ORDER.length * (1 + TEST_SEARCH_ROUNDS * 2);
  const progressWidth = playbackProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  useEffect(() => {
    void prepareTonePlayer();
  }, []);

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

  const advanceToNextEar = useCallback(() => {
    if (searchState.earIndex >= TEST_EAR_ORDER.length - 1) {
      setStage('review');
      return;
    }

    setSearchState(createEarSearchState(searchState.earIndex + 1));
  }, [searchState.earIndex]);

  const finishAttempt = useCallback(
    (heard: boolean) => {
      const point = createHearingPoint({
        ear: currentEar,
        frequency: currentFrequency,
        heard,
        threshold: currentThreshold,
      });

      setMeasurements((current) => [...current, point]);

      if (searchState.phase === 'anchor') {
        if (!heard) {
          advanceToNextEar();
          return;
        }

        setSearchState((current) => ({
          ...current,
          phase: 'low',
        }));
        return;
      }

      if (searchState.phase === 'low') {
        const nextLowMin = heard ? searchState.lowMin : currentFrequency;
        const nextLowMax = heard ? currentFrequency : searchState.lowMax;
        const nextLowRounds = searchState.lowRounds + 1;

        if (nextLowRounds >= TEST_SEARCH_ROUNDS) {
          setSearchState((current) => ({
            ...current,
            lowMax: nextLowMax,
            lowMin: nextLowMin,
            lowRounds: nextLowRounds,
            phase: 'high',
          }));
          return;
        }

        setSearchState((current) => ({
          ...current,
          lowMax: nextLowMax,
          lowMin: nextLowMin,
          lowRounds: nextLowRounds,
        }));
        return;
      }

      const nextHighMin = heard ? currentFrequency : searchState.highMin;
      const nextHighMax = heard ? searchState.highMax : currentFrequency;
      const nextHighRounds = searchState.highRounds + 1;

      if (nextHighRounds >= TEST_SEARCH_ROUNDS) {
        advanceToNextEar();
        return;
      }

      setSearchState((current) => ({
        ...current,
        highMax: nextHighMax,
        highMin: nextHighMin,
        highRounds: nextHighRounds,
      }));
    },
    [advanceToNextEar, currentEar, currentFrequency, currentThreshold, searchState],
  );

  useEffect(() => {
    if (stage !== 'testing') {
      void stopTonePlayback();
      stopPulse();
      playbackProgress.setValue(0);
      setIsToneActive(false);
      return;
    }

    attemptResolved.current = false;
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
      threshold: currentThreshold,
    }).finally(() => {
      setIsToneActive(false);
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
      clearTimeout(timeout);
      void stopTonePlayback();
      stopPulse();
      playbackProgress.stopAnimation();
      playbackProgress.setValue(0);
      setIsToneActive(false);
    };
  }, [currentEar, currentFrequency, currentThreshold, finishAttempt, playbackProgress, stage, startPulse, stopPulse]);

  const handleHearTone = () => {
    if (stage !== 'testing' || attemptResolved.current) {
      return;
    }

    attemptResolved.current = true;
    void stopTonePlayback();
    stopPulse();
    finishAttempt(true);
  };

  const beginTest = () => {
    setMeasurements([]);
    setSearchState(createEarSearchState());
    setStage('testing');
  };

  const handleSaveProfile = async () => {
    if (!draftProfile) {
      return;
    }

    await completeEarTest(draftProfile);
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
                <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Tap when you hear the sound.</Text>
                <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>{phaseTitle(searchState.phase)}</Text>
              </View>

              <View style={styles.middleWrap}>
                <Pressable
                  onPress={handleHearTone}
                  style={({ pressed }) => [
                    styles.hearButton,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      opacity: pressed ? 0.92 : 1,
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
                  <View style={[styles.hearCore, { backgroundColor: theme.accent }]}> 
                    <MaterialCommunityIcons color="#FFFFFF" name="ear-hearing" size={42} />
                    <View style={styles.sideBadge}>
                      <Text style={[styles.sideBadgeText, { color: theme.accent, fontFamily: theme.fonts.bodyBold }]}>{currentEar === 'left' ? 'L' : 'R'}</Text>
                    </View>
                  </View>
                  <Text style={[styles.hearButtonText, { color: theme.text, fontFamily: theme.fonts.bodyBold }]}>Tap when you hear it</Text>
                </Pressable>
              </View>

              <View style={[styles.statusCard, { backgroundColor: theme.card, borderColor: theme.border }]}> 
                <View style={styles.rowBetween}>
                  <Text style={[styles.statusLabel, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>
                    {isToneActive ? 'Listening now' : 'Preparing next sound'}
                  </Text>
                  <Text style={[styles.statusStep, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>
                    {attemptIndex + 1}/{totalAttempts}
                  </Text>
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
              <ReviewItem summary={describeEarSupport(draftProfile.leftSummary)} title="Left ear" theme={theme} />
              <ReviewItem summary={describeEarSupport(draftProfile.rightSummary)} title="Right ear" theme={theme} />
            </SurfaceCard>

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
                  <View style={[styles.modalIcon, { backgroundColor: theme.accentSoft }]}> 
                    <MaterialCommunityIcons color={theme.accent} name="ear-hearing" size={28} />
                  </View>
                  <Text style={[styles.modalTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Ear test</Text>
                  <Text style={[styles.modalText, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>We will play short sounds in each ear to set up your hearing range.</Text>
                  <ActionButton label="Continue" onPress={() => setStage('guide')} theme={theme} />
                </>
              ) : null}

              {stage === 'guide' ? (
                <>
                  <Text style={[styles.modalTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Before you start</Text>
                  <View style={styles.instructionsList}>
                    <Instruction icon="headphones" text="Wear both earbuds or headphones." theme={theme} />
                    <Instruction icon="volume-2" text="When you hear a sound, tap the button." theme={theme} />
                    <Instruction icon="clock" text="If you hear nothing, wait and the test will move on." theme={theme} />
                  </View>
                  <View style={styles.modalActions}>
                    <ActionButton label="Back" onPress={() => setStage('welcome')} style={styles.flex} theme={theme} variant="ghost" />
                    <ActionButton label="Got it" onPress={beginTest} style={styles.flex} theme={theme} />
                  </View>
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
  summary: string;
  title: string;
  theme: ReturnType<typeof useAppState>['theme'];
}) {
  return (
    <View style={[styles.reviewItem, { backgroundColor: theme.elevated, borderColor: theme.border }]}> 
      <View style={[styles.reviewIcon, { backgroundColor: theme.card }]}> 
        <MaterialCommunityIcons color={theme.accent} name="ear-hearing" size={20} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.reviewTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{title}</Text>
        <Text style={[styles.reviewText, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>{summary}</Text>
      </View>
    </View>
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
    gap: 10,
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
  statusStep: {
    fontSize: 13,
    lineHeight: 18,
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
  modalActions: {
    flexDirection: 'row',
    gap: 10,
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
});
