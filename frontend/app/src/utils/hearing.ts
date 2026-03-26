import type { EarSide, HearingPoint, HearingProfile, HearingSummary } from '@/src/types/app';

export const MIN_TEST_FREQUENCY = 20;
export const MAX_TEST_FREQUENCY = 20000;
export const ANCHOR_TEST_FREQUENCY = 1000;
export const TEST_EAR_ORDER: EarSide[] = ['left', 'right'];
export const TEST_SEARCH_ROUNDS = 5;
export const TEST_SEARCH_MIN = 6;
export const TEST_SEARCH_MAX = 64;

export function nextFrequencyCandidate(low: number, high: number): number {
  return Math.round(Math.sqrt(low * high));
}

export function getStartingThreshold(frequency: number): number {
  if (frequency <= 80 || frequency >= 12000) {
    return 44;
  }

  if (frequency <= 250 || frequency >= 8000) {
    return 38;
  }

  return 32;
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
  const normalizedThreshold = Math.max(TEST_SEARCH_MIN, Math.min(TEST_SEARCH_MAX, Math.round(threshold)));
  const lossDb = heard ? Math.max(0, Math.round((normalizedThreshold - TEST_SEARCH_MIN) * 1.2)) : 80;

  return {
    ear,
    frequency,
    threshold: normalizedThreshold,
    lossDb,
    comfort: normalizedThreshold <= 22 ? 'soft' : normalizedThreshold <= 42 ? 'medium' : 'high',
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

  if (summary.lowRangeHz !== null && summary.lowRangeHz > 120) {
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
