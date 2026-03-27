import type { EarSide, HearingPoint, HearingProfile, HearingSummary } from '@/src/types/app';

export const EAR_TEST_FREQUENCIES = [63, 80, 100, 125, 180, 250, 350, 500, 700, 1000, 1400, 2000, 2800, 4000, 5600, 8000, 11000, 14000, 16000] as const;
export const MIN_TEST_FREQUENCY = EAR_TEST_FREQUENCIES[0];
export const MAX_TEST_FREQUENCY = EAR_TEST_FREQUENCIES[EAR_TEST_FREQUENCIES.length - 1];
export const TEST_EAR_ORDER: EarSide[] = ['left', 'right'];
export const TEST_THRESHOLD_MIN = 4;
export const TEST_THRESHOLD_MAX = 64;
const MAX_HEARD_LOSS_DB = 72;

interface FrequencyVolumeProfile {
  startThreshold: number;
  endThreshold: number;
  steps: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getFrequencyVolumeProfile(frequency: number): FrequencyVolumeProfile {
  if (frequency <= 80) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: TEST_THRESHOLD_MAX, steps: 4 };
  }

  if (frequency <= 125) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: TEST_THRESHOLD_MAX, steps: 5 };
  }

  if (frequency <= 350) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: TEST_THRESHOLD_MAX, steps: 6 };
  }

  if (frequency <= 1400) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 56, steps: 8 };
  }

  if (frequency <= 4000) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 48, steps: 10 };
  }

  if (frequency <= 8000) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 44, steps: 11 };
  }

  return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 40, steps: 12 };
}

function getThresholdSpan(profile: FrequencyVolumeProfile): number {
  return Math.max(1, profile.endThreshold - profile.startThreshold);
}

function getEasedRampProgress(progress: number): number {
  const safeProgress = clamp(progress, 0, 1);

  return safeProgress ** 1.85;
}

function interpolateThreshold(profile: FrequencyVolumeProfile, progress: number): number {
  const safeProgress = getEasedRampProgress(progress);
  const thresholdSpan = getThresholdSpan(profile);
  const scaledProgress = safeProgress * profile.steps;
  const stepIndex = Math.min(profile.steps - 1, Math.floor(scaledProgress));
  const stepSize = thresholdSpan / profile.steps;
  const currentStepStart = stepIndex / profile.steps;
  const nextStepStart = Math.min(1, (stepIndex + 1) / profile.steps);
  const localProgress = nextStepStart > currentStepStart ? (safeProgress - currentStepStart) / (nextStepStart - currentStepStart) : 0;
  const thresholdStart = profile.startThreshold + stepIndex * stepSize;
  const thresholdEnd = profile.startThreshold + Math.min(profile.steps, stepIndex + 1) * stepSize;

  return thresholdStart + (thresholdEnd - thresholdStart) * localProgress;
}

export function getThresholdAtProgress(frequency: number, progress: number): number {
  const profile = getFrequencyVolumeProfile(frequency);

  return Math.round(interpolateThreshold(profile, progress));
}

export function getVolumeLevelAtProgress(frequency: number, progress: number): number {
  const profile = getFrequencyVolumeProfile(frequency);
  const safeProgress = getEasedRampProgress(progress);

  if (safeProgress <= 0) {
    return 1;
  }

  return Math.min(profile.steps, Math.ceil(safeProgress * profile.steps));
}

export function createHearingPoint({
  ear,
  frequency,
  threshold,
  heard,
}: {
  ear: EarSide;
  frequency: number;
  threshold: number;
  heard: boolean;
}): HearingPoint {
  const profile = getFrequencyVolumeProfile(frequency);
  const normalizedThreshold = clamp(Math.round(threshold), TEST_THRESHOLD_MIN, TEST_THRESHOLD_MAX);
  const thresholdRatio = clamp((normalizedThreshold - profile.startThreshold) / getThresholdSpan(profile), 0, 1);
  const lossDb = heard ? Math.round(thresholdRatio * MAX_HEARD_LOSS_DB) : 80;

  return {
    ear,
    frequency,
    threshold: normalizedThreshold,
    lossDb,
    comfort: thresholdRatio <= 0.34 ? 'soft' : thresholdRatio <= 0.67 ? 'medium' : 'high',
    heard,
  };
}

function summarizeEar(points: HearingPoint[]): HearingSummary {
  const heardPoints = points.filter((point) => point.heard);
  const averageLossDb =
    heardPoints.length > 0
      ? Math.round(heardPoints.reduce((sum, point) => sum + point.lossDb, 0) / heardPoints.length)
      : 80;

  return {
    lowRangeHz: heardPoints.length > 0 ? Math.min(...heardPoints.map((point) => point.frequency)) : null,
    highRangeHz: heardPoints.length > 0 ? Math.max(...heardPoints.map((point) => point.frequency)) : null,
    averageLossDb,
    clarityScore: Math.max(0, Math.min(100, 100 - averageLossDb)),
  };
}

export function buildHearingProfile(points: HearingPoint[]): HearingProfile {
  const leftPoints = points.filter((point) => point.ear === 'left');
  const rightPoints = points.filter((point) => point.ear === 'right');
  const leftSummary = summarizeEar(leftPoints);
  const rightSummary = summarizeEar(rightPoints);

  return {
    id: `hearing-${Date.now()}`,
    testedAt: new Date().toISOString(),
    points,
    leftSummary,
    rightSummary,
    overallScore: Math.round((leftSummary.clarityScore + rightSummary.clarityScore) / 2),
  };
}

export function describeEarSupport(summary: HearingSummary): string {
  if (!summary.lowRangeHz && !summary.highRangeHz) {
    return 'Needs stronger support across the range.';
  }

  if (summary.lowRangeHz !== null && summary.lowRangeHz > 125) {
    return 'Very low sounds may need extra lift.';
  }

  if (summary.highRangeHz !== null && summary.highRangeHz < 4000) {
    return 'Sharper speech detail may need extra lift.';
  }

  if (summary.averageLossDb <= 20) {
    return 'A light adjustment should be enough.';
  }

  if (summary.averageLossDb <= 40) {
    return 'Moderate support should help most conversations.';
  }

  return 'Stronger support should help in busy rooms.';
}
