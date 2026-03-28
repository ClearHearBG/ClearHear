import { PermissionsAndroid, Platform } from 'react-native';

import ClearHearAudio, { type BufferedAudioExport, type BufferedAudioStatus } from '@/modules/ble-audio';

import type { AudioBufferStatus } from '@/src/types/app';

type ExportedAudioBuffer = BufferedAudioExport;

async function ensureRecordAudioPermission() {
  if (Platform.OS !== 'android') {
    return;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Microphone access',
      message: 'ClearHear needs microphone access to keep the listening buffer ready for recaps.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );

  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Microphone permission is required to record the listening buffer.');
  }
}

function toAudioBufferStatus(status: BufferedAudioStatus): AudioBufferStatus {
  return {
    isRecording: status.isRecording,
    bufferedSeconds: status.bufferedSeconds,
    maxBufferSeconds: status.maxBufferSeconds,
    recentInputLevel: status.recentInputLevel,
    hasRecentInput: status.hasRecentInput,
  };
}

export async function startAudioBufferRecorder(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await ensureRecordAudioPermission();
}

export async function stopAudioBufferRecorder(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
}

export async function clearAudioBufferRecorder(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await ClearHearAudio.clearBufferedAudioAsync();
}

export async function exportAudioBuffer(): Promise<ExportedAudioBuffer> {
  if (Platform.OS !== 'android') {
    throw new Error('The rolling audio buffer is only available on Android right now.');
  }

  return ClearHearAudio.exportBufferedAudioAsync();
}

export async function getAudioBufferStatus(): Promise<AudioBufferStatus> {
  if (Platform.OS !== 'android') {
    return {
      isRecording: false,
      bufferedSeconds: 0,
      maxBufferSeconds: 15,
      recentInputLevel: 0,
      hasRecentInput: false,
    };
  }

  return toAudioBufferStatus(await ClearHearAudio.getBufferedAudioStatusAsync());
}
