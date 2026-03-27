import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

import type { AudioBufferStatus } from '@/src/types/app';

type ExportedAudioBuffer = {
  uri: string;
  name: string;
  mimeType: string;
  durationSeconds: number;
};

type AudioBufferRecorderModule = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  clear: () => Promise<void>;
  exportBufferedAudio: () => Promise<ExportedAudioBuffer>;
  getStatus: () => Promise<AudioBufferStatus>;
};

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

function getRecorderModule(): AudioBufferRecorderModule | null {
  const nativeModule = NativeModules.RollingAudioBuffer as AudioBufferRecorderModule | undefined;

  if (Platform.OS !== 'android' || !nativeModule) {
    return null;
  }

  return nativeModule;
}

export async function startAudioBufferRecorder(): Promise<void> {
  const recorder = getRecorderModule();
  if (!recorder) {
    return;
  }

  await ensureRecordAudioPermission();
  await recorder.start();
}

export async function stopAudioBufferRecorder(): Promise<void> {
  const recorder = getRecorderModule();
  if (!recorder) {
    return;
  }

  await recorder.stop();
}

export async function clearAudioBufferRecorder(): Promise<void> {
  const recorder = getRecorderModule();
  if (!recorder) {
    return;
  }

  await recorder.clear();
}

export async function exportAudioBuffer(): Promise<ExportedAudioBuffer> {
  if (Platform.OS !== 'android') {
    throw new Error('The rolling audio buffer is only available on Android right now.');
  }

  const recorder = getRecorderModule();
  if (!recorder) {
    throw new Error('The rolling audio buffer is not available in this Android build yet. Rebuild and reinstall the Android app so the native module is included.');
  }

  return recorder.exportBufferedAudio();
}

export async function getAudioBufferStatus(): Promise<AudioBufferStatus> {
  const recorder = getRecorderModule();
  if (!recorder) {
    return {
      isRecording: false,
      bufferedSeconds: 0,
      maxBufferSeconds: 15,
      recentInputLevel: 0,
      hasRecentInput: false,
    };
  }

  return recorder.getStatus();
}
