import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HearingResultsChart } from '@/src/components/HearingResultsChart';
import { TuningSlider } from '@/src/components/TuningSlider';
import { ActionButton, Atmosphere, Pill, SurfaceCard } from '@/src/components/primitives';
import {
  BOUNDARY_SWEEP_DURATION_MS,
  RAMPED_TONE_DURATION_MS,
  playBoundarySweep,
  playRampedTone,
  prepareTonePlayer,
  stopTonePlayback,
} from '@/src/services/tonePlayer';
import { useAppState } from '@/src/state/AppProvider';
import type { HearingCalibration, HearingPoint, HearingRange, HearingRangeByEar, HearingSummary } from '@/src/types/app';
import { formatFrequency, formatRange } from '@/src/utils/format';
import {
  DEFAULT_HEARING_CALIBRATION,
  DEFAULT_HEARING_RANGE_BY_EAR,
  EAR_TEST_FREQUENCIES,
  SOURCE_MAX_FREQUENCY,
  SOURCE_MIN_FREQUENCY,
  TEST_EAR_ORDER,
  buildHearingProfile,
  createHearingPoint,
  describeEarSupport,
  getBoundarySweepFrequencyAtProgress,
  getFrequencyVolumeProfile,
  getThresholdAtProgress,
  getVolumeLevelAtProgress,
  normalizeHearingCalibration,
  type HearingBoundaryDirection,
} from '@/src/utils/hearing';

type EarTestStage = 'welcome' | 'guide' | 'testing' | 'rangeGuide' | 'rangeTesting' | 'calibration' | 'review';

interface EarTestState {
  earIndex: number;
  frequencyIndex: number;
}

interface RangeTestState {
  earIndex: number;
  directionIndex: number;
}

const ATTEMPT_DURATION_MS = RAMPED_TONE_DURATION_MS;
const RANGE_ATTEMPT_DURATION_MS = BOUNDARY_SWEEP_DURATION_MS;
const VOLUME_METER_SEGMENTS = 8;
const RANGE_TEST_DIRECTIONS: HearingBoundaryDirection[] = ['low', 'high'];

function createEarTestState(earIndex = 0): EarTestState {
  return {
    earIndex,
    frequencyIndex: 0,
  };
}

function createRangeTestState(earIndex = 0): RangeTestState {
  return {
    earIndex,
    directionIndex: 0,
  };
}

function createEmptyDetectedRange(): HearingRangeByEar {
  return {
    left: { ...DEFAULT_HEARING_RANGE_BY_EAR.left },
    right: { ...DEFAULT_HEARING_RANGE_BY_EAR.right },
  };
}

export function EarTestFlow() {
  const {
    canCancelEarTest,
    cancelEarTest,
    completeEarTest,
    hearingProfile,
    hearingSupportStatus,
    isHearingSupportBusy,
    isSavingProfile,
    previewHearingSupport,
    stopPreviewHearingSupport,
    theme,
  } = useAppState();
  const [stage, setStage] = useState<EarTestStage>('welcome');
  const [measurements, setMeasurements] = useState<HearingPoint[]>([]);
  const [testState, setTestState] = useState<EarTestState>(() => createEarTestState());
  const [rangeState, setRangeState] = useState<RangeTestState>(() => createRangeTestState());
  const [detectedRange, setDetectedRange] = useState<HearingRangeByEar>(() => createEmptyDetectedRange());
  const [isToneActive, setIsToneActive] = useState(false);
  const [attemptProgressValue, setAttemptProgressValue] = useState(0);
  const [calibration, setCalibration] = useState<HearingCalibration>(() => normalizeHearingCalibration(hearingProfile?.calibration ?? DEFAULT_HEARING_CALIBRATION));
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalTranslate = useRef(new Animated.Value(20)).current;
  const playbackProgress = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.18)).current;
  const attemptResolved = useRef(false);
  const attemptProgressRef = useRef(0);
  const activeAttemptKey = useRef(0);
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  const currentTestEar = TEST_EAR_ORDER[testState.earIndex];
  const currentRangeEar = TEST_EAR_ORDER[rangeState.earIndex];
  const currentRangeDirection = RANGE_TEST_DIRECTIONS[rangeState.directionIndex];
  const currentFrequency = EAR_TEST_FREQUENCIES[testState.frequencyIndex];
  const currentRangeFrequency = useMemo(
    () => getBoundarySweepFrequencyAtProgress(currentRangeDirection, attemptProgressValue),
    [attemptProgressValue, currentRangeDirection],
  );
  const currentVolumeProfile = useMemo(() => getFrequencyVolumeProfile(currentFrequency), [currentFrequency]);
  const draftProfile = useMemo(
    () => (stage === 'calibration' || stage === 'review' ? buildHearingProfile(measurements, calibration, detectedRange) : null),
    [calibration, detectedRange, measurements, stage],
  );
  const attemptIndex = testState.earIndex * EAR_TEST_FREQUENCIES.length + testState.frequencyIndex;
  const totalAttempts = TEST_EAR_ORDER.length * EAR_TEST_FREQUENCIES.length;
  const rangeAttemptIndex = rangeState.earIndex * RANGE_TEST_DIRECTIONS.length + rangeState.directionIndex;
  const totalRangeAttempts = TEST_EAR_ORDER.length * RANGE_TEST_DIRECTIONS.length;
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
  const rangeSweepLabel = currentRangeDirection === 'low' ? 'Low boundary' : 'High boundary';
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
    setCalibration(normalizeHearingCalibration(hearingProfile?.calibration ?? DEFAULT_HEARING_CALIBRATION));
  }, [hearingProfile]);

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
    if (stage !== 'welcome' && stage !== 'guide' && stage !== 'rangeGuide') {
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
        setRangeState(createRangeTestState());
        setStage('rangeGuide');
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
        ear: currentTestEar,
        frequency: currentFrequency,
        heard,
        threshold,
      });

      setMeasurements((current) => [...current, point]);
      advanceToNextAttempt();
    },
    [advanceToNextAttempt, currentFrequency, currentTestEar, currentVolumeProfile.endThreshold],
  );

  const getFallbackRangeBoundary = useCallback(
    (ear: 'left' | 'right', direction: HearingBoundaryDirection) => {
      const heardPoints = measurements
        .filter((point) => point.ear === ear && point.heard)
        .sort((first, second) => first.frequency - second.frequency);

      if (direction === 'low') {
        return heardPoints[0]?.frequency ?? hearingProfile?.hearingRange?.[ear].minFrequency ?? SOURCE_MIN_FREQUENCY;
      }

      return heardPoints[heardPoints.length - 1]?.frequency ?? hearingProfile?.hearingRange?.[ear].maxFrequency ?? SOURCE_MAX_FREQUENCY;
    },
    [hearingProfile?.hearingRange, measurements],
  );

  const advanceToNextRangeAttempt = useCallback(() => {
    if (rangeState.directionIndex >= RANGE_TEST_DIRECTIONS.length - 1) {
      if (rangeState.earIndex >= TEST_EAR_ORDER.length - 1) {
        setStage('calibration');
        return;
      }

      setRangeState(createRangeTestState(rangeState.earIndex + 1));
      return;
    }

    setRangeState((current) => ({
      ...current,
      directionIndex: current.directionIndex + 1,
    }));
  }, [rangeState.directionIndex, rangeState.earIndex]);

  const finishRangeAttempt = useCallback(
    (detectedFrequency: number | null) => {
      const nextFrequency = detectedFrequency ?? getFallbackRangeBoundary(currentRangeEar, currentRangeDirection);

      setDetectedRange((current) => {
        return {
          ...current,
          [currentRangeEar]: {
            ...current[currentRangeEar],
            minFrequency: currentRangeDirection === 'low' ? nextFrequency : current[currentRangeEar].minFrequency,
            maxFrequency: currentRangeDirection === 'high' ? nextFrequency : current[currentRangeEar].maxFrequency,
          },
        } satisfies HearingRangeByEar;
      });

      advanceToNextRangeAttempt();
    },
    [advanceToNextRangeAttempt, currentRangeDirection, currentRangeEar, getFallbackRangeBoundary],
  );

  useEffect(() => {
    if (stage !== 'testing') {
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
      ear: currentTestEar,
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
  }, [currentFrequency, currentTestEar, finishAttempt, playbackProgress, stage, startPulse, stopPulse]);

  useEffect(() => {
    if (stage !== 'rangeTesting') {
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
      duration: RANGE_ATTEMPT_DURATION_MS,
      useNativeDriver: false,
    }).start();

    void playBoundarySweep({
      direction: currentRangeDirection,
      ear: currentRangeEar,
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
        finishRangeAttempt(null);
      }
    }, RANGE_ATTEMPT_DURATION_MS);

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
  }, [currentRangeDirection, currentRangeEar, finishRangeAttempt, playbackProgress, stage, startPulse, stopPulse]);

  const handleHearTone = () => {
    if ((stage !== 'testing' && stage !== 'rangeTesting') || attemptResolved.current) {
      return;
    }

    attemptResolved.current = true;
    setIsToneActive(false);
    void stopTonePlayback();
    stopPulse();

    if (stage === 'testing') {
      finishAttempt(true);
      return;
    }

    finishRangeAttempt(getBoundarySweepFrequencyAtProgress(currentRangeDirection, attemptProgressRef.current));
  };

  const beginTest = () => {
    setMeasurements([]);
    setTestState(createEarTestState());
    setRangeState(createRangeTestState());
    setCalibration(normalizeHearingCalibration(hearingProfile?.calibration ?? DEFAULT_HEARING_CALIBRATION));
    setDetectedRange(createEmptyDetectedRange());
    attemptProgressRef.current = 0;
    setAttemptProgressValue(0);
    setStage('testing');
  };

  const beginRangeTest = () => {
    setRangeState(createRangeTestState());
    attemptProgressRef.current = 0;
    setAttemptProgressValue(0);
    setStage('rangeTesting');
  };

  useEffect(() => {
    if (stage !== 'calibration' || !draftProfile) {
      void stopPreviewHearingSupport();
      return;
    }

    const timeout = setTimeout(() => {
      void previewHearingSupport(draftProfile);
    }, 180);

    return () => {
      clearTimeout(timeout);
    };
  }, [draftProfile, previewHearingSupport, stage, stopPreviewHearingSupport]);

  const handleCalibrationContinue = async () => {
    await stopPreviewHearingSupport();
    setStage('review');
  };

  const handleSaveProfile = async () => {
    if (!draftProfile) {
      return;
    }

    await stopPreviewHearingSupport();
    await completeEarTest(draftProfile);
  };

  const handleCancelRetake = () => {
    void stopTonePlayback();
    void stopPreviewHearingSupport();
    cancelEarTest();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Atmosphere theme={theme} />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        {(stage === 'welcome' || stage === 'guide' || stage === 'rangeGuide') && <EarTestBackdrop theme={theme} />}

        {stage === 'testing' ? (
          <View style={styles.screen}>
            <Animated.View style={styles.contentWrap}>
              <View style={styles.headerBlock}>
                <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Tap as soon as you hear a sound.</Text>
                <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>We use this to build your sound amplification profile.</Text>
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
                      <Text style={[styles.sideBadgeText, { color: theme.accent, fontFamily: theme.fonts.bodyBold }]}>{currentTestEar === 'left' ? 'L' : 'R'}</Text>
                    </View>
                  </View>
                </Pressable>
              </View>

              <View style={[styles.statusCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.rowBetween}>
                  <View style={styles.flex}>
                    <Text style={[styles.statusLabel, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>Tone test</Text>
                    <Text style={[styles.statusMeta, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}> 
                      {formatFrequency(currentFrequency)} - step {liveVolumeLevel}/{currentVolumeProfile.steps}
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

                <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}>
                  <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: theme.accent }]} />
                </View>
              </View>
            </Animated.View>
          </View>
        ) : null}

        {stage === 'rangeTesting' ? (
          <View style={styles.screen}>
            <Animated.View style={styles.contentWrap}>
              <View style={styles.headerBlock}>
                <Pill accent label={rangeSweepLabel} theme={theme} />
                <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Tap when the sweep becomes audible.</Text>
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
                      <Text style={[styles.sideBadgeText, { color: theme.accent, fontFamily: theme.fonts.bodyBold }]}>{currentRangeEar === 'left' ? 'L' : 'R'}</Text>
                    </View>
                  </View>
                </Pressable>
              </View>

              <View style={[styles.statusCard, { backgroundColor: theme.card, borderColor: theme.border }]}> 
                <View style={styles.rowBetween}>
                  <View style={styles.flex}>
                    <Text style={[styles.statusLabel, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>Range sweep</Text>
                    <Text style={[styles.statusMeta, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}> 
                      {formatFrequency(currentRangeFrequency)}
                    </Text>
                  </View>
                  <Text style={[styles.statusStep, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}> 
                    {rangeAttemptIndex + 1}/{totalRangeAttempts}
                  </Text>
                </View>

                <View style={styles.rangeSummaryRow}>
                  <RangeSummaryChip
                    label="Low"
                    theme={theme}
                    value={detectedRange[currentRangeEar].minFrequency ? formatFrequency(detectedRange[currentRangeEar].minFrequency) : 'Pending'}
                  />
                  <RangeSummaryChip
                    label="High"
                    theme={theme}
                    value={detectedRange[currentRangeEar].maxFrequency ? formatFrequency(detectedRange[currentRangeEar].maxFrequency) : 'Pending'}
                  />
                </View>

                <View style={[styles.progressTrack, { backgroundColor: theme.progressTrack }]}> 
                  <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: theme.accent }]} />
                </View>
              </View>
            </Animated.View>
          </View>
        ) : null}

        {stage === 'calibration' && draftProfile ? (
          <ScrollView contentContainerStyle={styles.reviewScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.headerBlock}>
              <Pill accent label="Live tuning" theme={theme} />
              <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Tune the room sound.</Text>
              <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Listen to the live room audio through your earphones, then adjust the two sliders until the preview feels natural and comfortable.</Text>
            </View>

            <SurfaceCard style={styles.calibrationCard} theme={theme}>
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <Text style={[styles.calibrationTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>Live preview</Text>
                  <Text style={[styles.calibrationText, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>Talk, rub your fingers, or snap softly near each earbud mic while you tune.</Text>
                </View>
                <Pill
                  accent={hearingSupportStatus.stage === 'running'}
                  label={
                    hearingSupportStatus.stage === 'running'
                      ? 'Listening now'
                      : hearingSupportStatus.stage === 'starting'
                        ? 'Starting'
                        : hearingSupportStatus.lastError
                          ? 'Preview issue'
                          : 'Waiting'
                  }
                  theme={theme}
                />
              </View>

              <View style={styles.calibrationMetricsRow}>
                <CalibrationMetric
                  label="Input"
                  theme={theme}
                  value={hearingSupportStatus.selectedInput?.name ?? 'Connecting'}
                />
                <CalibrationMetric
                  label="Output"
                  theme={theme}
                  value={hearingSupportStatus.selectedOutput?.name ?? 'Connecting'}
                />
              </View>

              {hearingSupportStatus.lastError ? (
                <Text style={[styles.calibrationWarning, { color: theme.danger, fontFamily: theme.fonts.bodyMedium }]}>{hearingSupportStatus.lastError}</Text>
              ) : null}
            </SurfaceCard>

            <SurfaceCard style={styles.calibrationCard} theme={theme}>
              <TuningSlider
                helper="Raises all outside sound before your hearing-loss shaping. Increase this if your earbuds block too much of the room."
                label="Base lift"
                max={18}
                min={0}
                onChange={(value) => setCalibration((current) => ({ ...current, baseGainDb: value }))}
                step={0.5}
                theme={theme}
                value={calibration.baseGainDb}
                valueFormatter={(value) => `+${value.toFixed(1)} dB`}
              />

              <TuningSlider
                helper="Scales how strongly your ear-test profile boosts each side. Increase this if speech still feels too soft."
                label="Profile strength"
                max={2.2}
                min={0.5}
                onChange={(value) => setCalibration((current) => ({ ...current, boostMultiplier: value }))}
                step={0.05}
                theme={theme}
                value={calibration.boostMultiplier}
                valueFormatter={(value) => `${value.toFixed(2)}x`}
              />

              <View style={[styles.calibrationSummary, { backgroundColor: theme.elevated, borderColor: theme.border }]}>
                <Text style={[styles.calibrationSummaryTitle, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>Current tuning</Text>
                <Text style={[styles.calibrationSummaryText, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>
                  Base lift {calibration.baseGainDb.toFixed(1)} dB with profile strength at {calibration.boostMultiplier.toFixed(2)}x.
                </Text>
              </View>
            </SurfaceCard>

            <ActionButton
              disabled={isHearingSupportBusy}
              label={isHearingSupportBusy ? 'Updating preview...' : 'See results'}
              onPress={() => {
                void handleCalibrationContinue();
              }}
              theme={theme}
            />
          </ScrollView>
        ) : null}

        {stage === 'review' && draftProfile ? (
          <ScrollView contentContainerStyle={styles.reviewScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.headerBlock}>
              <Pill accent label="Ready" theme={theme} />
              <Text style={[styles.title, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Your profile is ready.</Text>
              <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: theme.fonts.body }]}>These results now include the live tuning you just set for your earphones.</Text>
            </View>

            <SurfaceCard style={styles.reviewCard} theme={theme}>
              <ReviewItem range={draftProfile.hearingRange.left} summary={draftProfile.leftSummary} title="Left ear" theme={theme} />
              <ReviewItem range={draftProfile.hearingRange.right} summary={draftProfile.rightSummary} title="Right ear" theme={theme} />
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

      <Modal animationType="none" presentationStyle="overFullScreen" transparent visible={stage === 'welcome' || stage === 'guide' || stage === 'rangeGuide'}>
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

              {stage === 'rangeGuide' ? (
                <>
                  <View style={styles.modalTopRow}>
                    <View style={styles.backButtonSpacer} />
                  </View>
                  <Text style={[styles.modalTitle, { color: theme.text, fontFamily: theme.fonts.displayBold }]}>Range sweep</Text>
                  <View style={styles.instructionsList}>
                    <Instruction icon="arrow-up-right" text="First we sweep upward from 20 Hz to find the lowest sound you can catch." theme={theme} />
                    <Instruction icon="arrow-down-right" text="Then we sweep down from 20 kHz to find the highest sound you still hear." theme={theme} />
                    <Instruction icon="zap" text="Tap the moment the sweep first becomes audible. This helps shift hidden highs and lows into your hearing window." theme={theme} />
                  </View>
                  <ActionButton label="Start sweeps" onPress={beginRangeTest} theme={theme} />
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
  range,
  summary,
  title,
  theme,
}: {
  range: HearingRange;
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
            <Text style={[styles.reviewMetricValue, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{formatRange(range.minFrequency, range.maxFrequency)}</Text>
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

function RangeSummaryChip({
  label,
  theme,
  value,
}: {
  label: string;
  theme: ReturnType<typeof useAppState>['theme'];
  value: string;
}) {
  return (
    <View style={[styles.rangeSummaryChip, { backgroundColor: theme.elevated, borderColor: theme.border }]}> 
      <Text style={[styles.rangeSummaryLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{label}</Text>
      <Text style={[styles.rangeSummaryValue, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{value}</Text>
    </View>
  );
}

function CalibrationMetric({
  label,
  theme,
  value,
}: {
  label: string;
  theme: ReturnType<typeof useAppState>['theme'];
  value: string;
}) {
  return (
    <View style={[styles.calibrationMetric, { backgroundColor: theme.elevated, borderColor: theme.border }]}>
      <Text style={[styles.calibrationMetricLabel, { color: theme.textMuted, fontFamily: theme.fonts.bodyMedium }]}>{label}</Text>
      <Text style={[styles.calibrationMetricValue, { color: theme.text, fontFamily: theme.fonts.bodySemiBold }]}>{value}</Text>
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
    left: '50%',
    top: '50%',
    width: 220,
    height: 220,
    marginLeft: -110,
    marginTop: -110,
    borderRadius: 999,
  },
  volumeRing: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 238,
    height: 238,
    marginLeft: -119,
    marginTop: -119,
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
  rangeSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  rangeSummaryChip: {
    minWidth: 116,
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  rangeSummaryLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  rangeSummaryValue: {
    fontSize: 13,
    lineHeight: 18,
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
  calibrationCard: {
    gap: 16,
  },
  calibrationTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  calibrationText: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  calibrationMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  calibrationMetric: {
    minWidth: 120,
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  calibrationMetricLabel: {
    fontSize: 11,
    lineHeight: 14,
  },
  calibrationMetricValue: {
    fontSize: 13,
    lineHeight: 18,
  },
  calibrationWarning: {
    fontSize: 13,
    lineHeight: 19,
  },
  calibrationSummary: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  calibrationSummaryTitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  calibrationSummaryText: {
    fontSize: 13,
    lineHeight: 20,
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
