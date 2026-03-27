import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';

import type { EarSide } from '@/src/types/app';
import { getThresholdAtProgress } from '@/src/utils/hearing';

const SAMPLE_RATE = 44100;
export const RAMPED_TONE_DURATION_MS = 4600;

const TONE_DURATION_SECONDS = RAMPED_TONE_DURATION_MS / 1000;
const FADE_OUT_SECONDS = 0.06;

const toneCache = new Map<string, string>();

let audioPrepared = false;
let activePlayer: ReturnType<typeof createAudioPlayer> | null = null;
let activePlayerSubscription: { remove: () => void } | null = null;
let activePlaybackResolve: (() => void) | null = null;
let activePlaybackTimeout: ReturnType<typeof setTimeout> | null = null;
let playbackSessionId = 0;

function thresholdToAmplitude(threshold: number): number {
  return Math.max(0.015, Math.min(0.42, threshold / 100));
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

function buildRampedToneWave(frequency: number, ear: EarSide): Uint8Array {
  const frameCount = Math.floor(SAMPLE_RATE * TONE_DURATION_SECONDS);
  const dataLength = frameCount * 4;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);

  writeWavHeader(view, dataLength, SAMPLE_RATE);

  const fadeOutFrames = Math.floor(SAMPLE_RATE * FADE_OUT_SECONDS);
  let offset = 44;

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / SAMPLE_RATE;
    const rampProgress = index / Math.max(1, frameCount - 1);
    const currentThreshold = getThresholdAtProgress(frequency, rampProgress);
    const fadeOut = index > frameCount - fadeOutFrames ? (frameCount - index) / fadeOutFrames : 1;
    const envelope = Math.max(0, Math.min(1, fadeOut));
    const sampleValue = Math.sin(2 * Math.PI * frequency * time) * thresholdToAmplitude(currentThreshold) * envelope;
    const pcm = Math.max(-1, Math.min(1, sampleValue)) * 32767;

    view.setInt16(offset, ear === 'left' ? pcm : 0, true);
    view.setInt16(offset + 2, ear === 'right' ? pcm : 0, true);
    offset += 4;
  }

  return bytes;
}

async function getToneUri(frequency: number, ear: EarSide): Promise<string> {
  const cacheKey = `${ear}-${frequency}-progressive-v4`;
  const cachedUri = toneCache.get(cacheKey);

  if (cachedUri) {
    return cachedUri;
  }

  const bytes = buildRampedToneWave(frequency, ear);
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

function disposePlayer(player: ReturnType<typeof createAudioPlayer>) {
  try {
    player.pause();
  } catch {
    // ignore pause failures
  }

  try {
    player.remove();
  } catch {
    // ignore remove failures
  }
}

async function unloadActiveSound() {
  activePlayerSubscription?.remove();
  activePlayerSubscription = null;

  if (activePlaybackTimeout) {
    clearTimeout(activePlaybackTimeout);
    activePlaybackTimeout = null;
  }

  const resolvePlayback = activePlaybackResolve;
  activePlaybackResolve = null;

  if (activePlayer) {
    const player = activePlayer;
    activePlayer = null;
    disposePlayer(player);
  }

  resolvePlayback?.();
}

export async function prepareTonePlayer() {
  if (audioPrepared) {
    return;
  }

  await setAudioModeAsync({
    interruptionMode: 'doNotMix',
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });

  audioPrepared = true;
}

export async function playRampedTone({
  ear,
  frequency,
}: {
  ear: EarSide;
  frequency: number;
}) {
  const sessionId = playbackSessionId + 1;
  playbackSessionId = sessionId;

  await prepareTonePlayer();
  await unloadActiveSound();

  const uri = await getToneUri(frequency, ear);

  if (sessionId !== playbackSessionId) {
    return;
  }

  const player = createAudioPlayer(uri, {
    updateInterval: 80,
  });

  if (sessionId !== playbackSessionId) {
    disposePlayer(player);

    return;
  }

  player.volume = 1;
  activePlayer = player;

  await new Promise<void>((resolve) => {
    let resolved = false;
    let subscription: { remove: () => void } | null = null;

    const finishPlayback = () => {
      if (resolved) {
        return;
      }

      resolved = true;

      subscription?.remove();
      if (activePlayerSubscription === subscription) {
        activePlayerSubscription = null;
      }
      if (activePlaybackResolve === finishPlayback) {
        activePlaybackResolve = null;
      }
      if (activePlaybackTimeout) {
        clearTimeout(activePlaybackTimeout);
        activePlaybackTimeout = null;
      }

      if (activePlayer === player) {
        activePlayer = null;
      }

      disposePlayer(player);
      resolve();
    };

    activePlaybackResolve = finishPlayback;
    activePlaybackTimeout = setTimeout(finishPlayback, RAMPED_TONE_DURATION_MS + 200);
    subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (sessionId !== playbackSessionId || status.didJustFinish) {
        finishPlayback();
      }
    });
    activePlayerSubscription = subscription;

    if (sessionId !== playbackSessionId) {
      finishPlayback();
      return;
    }

    player.play();
  });
}

export async function stopTonePlayback() {
  playbackSessionId += 1;
  await unloadActiveSound();
}
