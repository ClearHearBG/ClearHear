import type {
  EarSide,
  HearingCalibration,
  HearingPoint,
  HearingProfile,
  HearingRange,
  HearingRangeByEar,
  HearingSummary,
} from '@/src/types/app';

export const SOURCE_MIN_FREQUENCY = 20;
export const SOURCE_MAX_FREQUENCY = 20000;
export const EAR_TEST_FREQUENCIES = [63, 80, 100, 125, 180, 250, 350, 500, 700, 1000, 1400, 2000, 2800, 4000, 5600, 8000, 11000, 14000, 16000] as const;
export const MIN_TEST_FREQUENCY = EAR_TEST_FREQUENCIES[0];
export const MAX_TEST_FREQUENCY = EAR_TEST_FREQUENCIES[EAR_TEST_FREQUENCIES.length - 1];
export const TEST_EAR_ORDER: EarSide[] = ['left', 'right'];
export const TEST_THRESHOLD_MIN = 0;
export const TEST_THRESHOLD_MAX = 84;

const MAX_HEARD_LOSS_DB = 72;
const MIN_RANGE_SPAN_HZ = 80;
const EXTREME_LOW_RANGE_CUTOFF_HZ = 28;
const EXTREME_HIGH_RANGE_CUTOFF_HZ = 18500;
const HIGH_SWEEP_PROGRESS_EXPONENT = 1.85;

export const DEFAULT_HEARING_CALIBRATION: HearingCalibration = {
  baseGainDb: 6,
  boostMultiplier: 1,
};

export const DEFAULT_HEARING_RANGE_BY_EAR: HearingRangeByEar = {
  left: { minFrequency: null, maxFrequency: null },
  right: { minFrequency: null, maxFrequency: null },
};

export type HearingBoundaryDirection = 'low' | 'high';

interface FrequencyVolumeProfile {
  startThreshold: number;
  endThreshold: number;
  steps: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteFrequency(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return clamp(Math.round(value), SOURCE_MIN_FREQUENCY, SOURCE_MAX_FREQUENCY);
}

function createDerivedRange(points: HearingPoint[]): HearingRange {
  const heardPoints = points.filter((point) => point.heard);

  if (heardPoints.length === 0) {
    return { minFrequency: null, maxFrequency: null };
  }

  return {
    minFrequency: Math.min(...heardPoints.map((point) => point.frequency)),
    maxFrequency: Math.max(...heardPoints.map((point) => point.frequency)),
  };
}

function normalizeHearingRange(range?: Partial<HearingRange> | null, fallback?: HearingRange): HearingRange {
  const fallbackMin = toFiniteFrequency(fallback?.minFrequency);
  const fallbackMax = toFiniteFrequency(fallback?.maxFrequency);
  let nextMin = toFiniteFrequency(range?.minFrequency) ?? fallbackMin;
  let nextMax = toFiniteFrequency(range?.maxFrequency) ?? fallbackMax;

  if (nextMin !== null && nextMin <= EXTREME_LOW_RANGE_CUTOFF_HZ && fallbackMin !== null && fallbackMin > nextMin) {
    nextMin = fallbackMin;
  }

  if (nextMax !== null && nextMax >= EXTREME_HIGH_RANGE_CUTOFF_HZ && fallbackMax !== null && fallbackMax < nextMax) {
    nextMax = fallbackMax;
  }

  if (nextMin === null && nextMax === null) {
    return { minFrequency: null, maxFrequency: null };
  }

  if (nextMin === null) {
    return {
      minFrequency: clamp((nextMax ?? SOURCE_MAX_FREQUENCY) - MIN_RANGE_SPAN_HZ, SOURCE_MIN_FREQUENCY, SOURCE_MAX_FREQUENCY),
      maxFrequency: nextMax,
    };
  }

  if (nextMax === null) {
    return {
      minFrequency: nextMin,
      maxFrequency: clamp(nextMin + MIN_RANGE_SPAN_HZ, SOURCE_MIN_FREQUENCY, SOURCE_MAX_FREQUENCY),
    };
  }

  if (nextMax <= nextMin) {
    return {
      minFrequency: nextMin,
      maxFrequency: clamp(nextMin + MIN_RANGE_SPAN_HZ, SOURCE_MIN_FREQUENCY, SOURCE_MAX_FREQUENCY),
    };
  }

  return {
    minFrequency: nextMin,
    maxFrequency: nextMax,
  };
}

function legacyRangeForEar(profile: HearingProfile, ear: EarSide): HearingRange {
  const summary = ear === 'left' ? profile.leftSummary : profile.rightSummary;
  const fallback = createDerivedRange(profile.points.filter((point) => point.ear === ear));

  return normalizeHearingRange(
    {
      minFrequency: summary.lowRangeHz,
      maxFrequency: summary.highRangeHz,
    },
    fallback,
  );
}

export function normalizeHearingRangeByEar(rangeByEar?: Partial<HearingRangeByEar> | null, fallbackPoints: HearingPoint[] = []): HearingRangeByEar {
  const fallbackLeft = createDerivedRange(fallbackPoints.filter((point) => point.ear === 'left'));
  const fallbackRight = createDerivedRange(fallbackPoints.filter((point) => point.ear === 'right'));

  return {
    left: normalizeHearingRange(rangeByEar?.left, fallbackLeft),
    right: normalizeHearingRange(rangeByEar?.right, fallbackRight),
  };
}

function logInterpolateFrequency(startFrequency: number, endFrequency: number, progress: number): number {
  const safeProgress = clamp(progress, 0, 1);
  const startLog = Math.log(startFrequency);
  const endLog = Math.log(endFrequency);

  return Math.round(Math.exp(startLog + (endLog - startLog) * safeProgress));
}

export function getBoundarySweepFrequencyAtProgress(direction: HearingBoundaryDirection, progress: number): number {
  const adjustedProgress = direction === 'high' ? clamp(progress, 0, 1) ** HIGH_SWEEP_PROGRESS_EXPONENT : clamp(progress, 0, 1);

  return direction === 'low'
    ? logInterpolateFrequency(SOURCE_MIN_FREQUENCY, SOURCE_MAX_FREQUENCY, adjustedProgress)
    : logInterpolateFrequency(SOURCE_MAX_FREQUENCY, SOURCE_MIN_FREQUENCY, adjustedProgress);
}

export function getFrequencyVolumeProfile(frequency: number): FrequencyVolumeProfile {
  if (frequency <= 80) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: TEST_THRESHOLD_MAX, steps: 5 };
  }

  if (frequency <= 125) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 82, steps: 6 };
  }

  if (frequency <= 350) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 76, steps: 8 };
  }

  if (frequency <= 1400) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 64, steps: 10 };
  }

  if (frequency <= 4000) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 56, steps: 11 };
  }

  if (frequency <= 8000) {
    return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 50, steps: 12 };
  }

  return { startThreshold: TEST_THRESHOLD_MIN, endThreshold: 46, steps: 13 };
}

function getThresholdSpan(profile: FrequencyVolumeProfile): number {
  return Math.max(1, profile.endThreshold - profile.startThreshold);
}

function getEasedRampProgress(progress: number): number {
  const safeProgress = clamp(progress, 0, 1);

  return safeProgress ** 2.8;
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

export function buildHearingProfile(
  points: HearingPoint[],
  calibration: HearingCalibration = DEFAULT_HEARING_CALIBRATION,
  hearingRange?: Partial<HearingRangeByEar> | null,
): HearingProfile {
  const leftPoints = points.filter((point) => point.ear === 'left');
  const rightPoints = points.filter((point) => point.ear === 'right');
  const leftSummary = summarizeEar(leftPoints);
  const rightSummary = summarizeEar(rightPoints);

  return {
    id: `hearing-${Date.now()}`,
    testedAt: new Date().toISOString(),
    points,
    calibration,
    hearingRange: normalizeHearingRangeByEar(hearingRange, points),
    leftSummary,
    rightSummary,
    overallScore: Math.round((leftSummary.clarityScore + rightSummary.clarityScore) / 2),
  };
}

export function normalizeHearingCalibration(
  calibration?: Partial<HearingCalibration> | null,
): HearingCalibration {
  return {
    baseGainDb:
      typeof calibration?.baseGainDb === 'number' && Number.isFinite(calibration.baseGainDb)
        ? Math.max(0, Math.min(18, calibration.baseGainDb))
        : DEFAULT_HEARING_CALIBRATION.baseGainDb,
    boostMultiplier:
      typeof calibration?.boostMultiplier === 'number' && Number.isFinite(calibration.boostMultiplier)
        ? Math.max(0.5, Math.min(2.2, calibration.boostMultiplier))
        : DEFAULT_HEARING_CALIBRATION.boostMultiplier,
  };
}

export function normalizeHearingProfile(profile: HearingProfile | null | undefined): HearingProfile | null {
  if (!profile) {
    return null;
  }

  const normalizedHearingRange = profile.hearingRange
    ? normalizeHearingRangeByEar(profile.hearingRange, profile.points)
    : {
        left: legacyRangeForEar(profile, 'left'),
        right: legacyRangeForEar(profile, 'right'),
      };

  return {
    ...profile,
    calibration: normalizeHearingCalibration(profile.calibration),
    hearingRange: normalizedHearingRange,
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
