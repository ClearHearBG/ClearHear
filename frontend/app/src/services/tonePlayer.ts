import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { Platform } from 'react-native';

import type { EarSide } from '@/src/types/app';

const SAMPLE_RATE = 44100;
export const RAMPED_TONE_DURATION_MS = 3200;

const TONE_DURATION_SECONDS = RAMPED_TONE_DURATION_MS / 1000;
const FADE_OUT_SECONDS = 0.06;

const toneCache = new Map<string, string>();

type ExpoAvModule = typeof import('expo-av');
type SoundLike = {
  stopAsync: () => Promise<unknown>;
  unloadAsync: () => Promise<unknown>;
  setOnPlaybackStatusUpdate: (callback: (status: { isLoaded: boolean; didJustFinish?: boolean }) => void) => void;
};

let audioPrepared = false;
let activeSound: SoundLike | null = null;
let cachedExpoAvModule: ExpoAvModule | null = null;
let didWarnAboutMissingAv = false;

function thresholdToAmplitude(threshold: number): number {
  return Math.max(0.03, Math.min(0.42, threshold / 100));
}

function writeWavHeader(view: DataView, byteLength: number, sampleRate: number) {
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + byteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, byteLength, true);
}

function buildRampedToneWave(frequency: number, threshold: number, ear: EarSide): Uint8Array {
  const maxAmplitude = thresholdToAmplitude(threshold);
  const frameCount = Math.floor(SAMPLE_RATE * TONE_DURATION_SECONDS);
  const dataLength = frameCount * 4;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);

  writeWavHeader(view, dataLength, SAMPLE_RATE);

  const fadeOutFrames = Math.floor(SAMPLE_RATE * FADE_OUT_SECONDS);
  let offset = 44;

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const rampProgress = index / frameCount;
    const fadeOut = index > frameCount - fadeOutFrames ? (frameCount - index) / fadeOutFrames : 1;
    const envelope = Math.max(0, Math.min(1, rampProgress * fadeOut));
    const sampleValue = Math.sin(2 * Math.PI * frequency * time) * maxAmplitude * envelope;
    const pcm = Math.max(-1, Math.min(1, sampleValue)) * 32767;

    view.setInt16(offset, ear === 'left' ? pcm : 0, true);
    view.setInt16(offset + 2, ear === 'right' ? pcm : 0, true);
    offset += 4;
  }

  return bytes;
}

async function getToneUri(frequency: number, threshold: number, ear: EarSide): Promise<string> {
  const cacheKey = `${ear}-${frequency}-${threshold}`;
  const cachedUri = toneCache.get(cacheKey);

  if (cachedUri) {
    return cachedUri;
  }

  const bytes = buildRampedToneWave(frequency, threshold, ear);
  const base64 = Buffer.from(bytes).toString('base64');

  if (Platform.OS === 'web') {
    const dataUri = `data:audio/wav;base64,${base64}`;
    toneCache.set(cacheKey, dataUri);
    return dataUri;
  }

  if (!FileSystem.cacheDirectory) {
    throw new Error('Missing cache directory for tone playback');
  }

  const uri = `${FileSystem.cacheDirectory}clearhear-tone-${cacheKey}.wav`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  toneCache.set(cacheKey, uri);

  return uri;
}

async function getExpoAvModule(): Promise<ExpoAvModule | null> {
  if (cachedExpoAvModule) {
    return cachedExpoAvModule;
  }

  try {
    cachedExpoAvModule = await import('expo-av');
    return cachedExpoAvModule;
  } catch (error) {
    if (!didWarnAboutMissingAv) {
      didWarnAboutMissingAv = true;
      console.warn(
        'expo-av is unavailable in this build. Tone playback is disabled until the native app includes the AV module.',
        error,
      );
    }
    return null;
  }
}

async function unloadActiveSound() {
  if (!activeSound) {
    return;
  }

  const sound = activeSound;
  activeSound = null;

  try {
    await sound.stopAsync();
  } catch {
    // ignore stop failures
  }

  try {
    await sound.unloadAsync();
  } catch {
    // ignore unload failures
  }
}

export async function prepareTonePlayer() {
  if (audioPrepared) {
    return;
  }

  const expoAv = await getExpoAvModule();
  if (!expoAv) {
    return;
  }

  await expoAv.Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    interruptionModeIOS: expoAv.InterruptionModeIOS.DoNotMix,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeAndroid: expoAv.InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });

  audioPrepared = true;
}

export async function playRampedTone({
  ear,
  frequency,
  threshold,
}: {
  ear: EarSide;
  frequency: number;
  threshold: number;
}) {
  const expoAv = await getExpoAvModule();
  if (!expoAv) {
    return;
  }

  await prepareTonePlayer();
  await unloadActiveSound();

  const uri = await getToneUri(frequency, threshold, ear);
  const { sound } = await expoAv.Audio.Sound.createAsync(
    { uri },
    {
      shouldPlay: true,
      positionMillis: 0,
      progressUpdateIntervalMillis: 80,
      volume: 1,
    },
  );

  activeSound = sound as SoundLike;

  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) {
        void unloadActiveSound().finally(resolve);
        return;
      }

      if (status.didJustFinish) {
        void unloadActiveSound().finally(resolve);
      }
    });
  });
}

export async function stopTonePlayback() {
  await unloadActiveSound();
}
