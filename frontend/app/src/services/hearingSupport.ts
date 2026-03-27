import { PermissionsAndroid, Platform } from 'react-native';

import ClearHearAudio, {
  type AudioDeviceSummary,
  type HearingSupportStatus,
  type NativeHearingSupportConfig,
} from '@/modules/ble-audio';
import type { HearingProfile } from '@/src/types/app';

const DEFAULT_MAX_GAIN_DB = 18;
const DEFAULT_BAND_COUNT = 24;

type StatusListener = (status: HearingSupportStatus) => void;

export type HearingSupportListenerSubscription = {
  remove: () => void;
};

function createBaseStatus(lastError: string | null = null): HearingSupportStatus {
  return {
    stage: 'idle',
    running: false,
    inputMode: 'mono',
    usingSharedInput: true,
    sampleRate: null,
    bufferFrames: null,
    selectedInput: null,
    selectedOutput: null,
    availableInputs: [],
    availableOutputs: [],
    lastError,
  };
}

export const INITIAL_HEARING_SUPPORT_STATUS = createBaseStatus();

function isAndroid(): boolean {
  return Platform.OS === 'android';
}

function toNativeConfig(
  profile: HearingProfile,
  routePreferences?: {
    preferredInputId?: number | null;
    preferredOutputId?: number | null;
  },
): NativeHearingSupportConfig {
  return {
    bandCount: DEFAULT_BAND_COUNT,
    baseGainDb: profile.calibration.baseGainDb,
    boostMultiplier: profile.calibration.boostMultiplier,
    hearingRange: [
      {
        ear: 'left',
        minFrequency: profile.hearingRange.left.minFrequency,
        maxFrequency: profile.hearingRange.left.maxFrequency,
      },
      {
        ear: 'right',
        minFrequency: profile.hearingRange.right.minFrequency,
        maxFrequency: profile.hearingRange.right.maxFrequency,
      },
    ],
    maxGainDb: DEFAULT_MAX_GAIN_DB,
    preferredInputId: routePreferences?.preferredInputId ?? null,
    preferredOutputId: routePreferences?.preferredOutputId ?? null,
    points: profile.points
      .map((point) => ({
        ear: point.ear,
        frequency: point.frequency,
        lossDb: point.lossDb,
      }))
      .sort((first, second) => first.frequency - second.frequency),
  };
}

export async function hasHearingSupportPermissionAsync(): Promise<boolean> {
  if (!isAndroid()) {
    return false;
  }

  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
}

export async function requestHearingSupportPermissionAsync(): Promise<boolean> {
  if (!isAndroid()) {
    return false;
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    buttonNegative: 'Not now',
    buttonPositive: 'Allow',
    message: 'ClearHear needs microphone access to capture headset audio and apply your hearing profile live.',
    title: 'Microphone access',
  });

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getHearingSupportStatusAsync(): Promise<HearingSupportStatus> {
  if (!isAndroid()) {
    return createBaseStatus('Live audio processing is only available on Android.');
  }

  return ClearHearAudio.getStatusAsync();
}

export async function getHearingSupportInputDevicesAsync(): Promise<AudioDeviceSummary[]> {
  if (!isAndroid()) {
    return [];
  }

  return ClearHearAudio.getInputDevicesAsync();
}

export async function startHearingSupportAsync(
  profile: HearingProfile,
  routePreferences?: {
    preferredInputId?: number | null;
    preferredOutputId?: number | null;
  },
): Promise<HearingSupportStatus> {
  if (!isAndroid()) {
    return createBaseStatus('Live audio processing is only available on Android.');
  }

  return ClearHearAudio.startAsync(JSON.stringify(toNativeConfig(profile, routePreferences)));
}

export async function updateHearingSupportProfileAsync(
  profile: HearingProfile,
  routePreferences?: {
    preferredInputId?: number | null;
    preferredOutputId?: number | null;
  },
): Promise<HearingSupportStatus> {
  if (!isAndroid()) {
    return createBaseStatus('Live audio processing is only available on Android.');
  }

  return ClearHearAudio.updateProfileAsync(JSON.stringify(toNativeConfig(profile, routePreferences)));
}

export async function stopHearingSupportAsync(): Promise<HearingSupportStatus> {
  if (!isAndroid()) {
    return createBaseStatus();
  }

  return ClearHearAudio.stopAsync();
}

export function addHearingSupportStatusListener(listener: StatusListener): HearingSupportListenerSubscription {
  if (!isAndroid()) {
    return {
      remove() {},
    };
  }

  return ClearHearAudio.addListener('onStateChange', listener);
}
