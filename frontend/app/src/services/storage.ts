import * as FileSystem from 'expo-file-system/legacy';

import type { PersistedState } from '@/src/types/app';

const STORAGE_FILE_NAME = 'clearhear-app-state-v1.json';

let memoryState: string | null = null;

function getStorageUri(): string | null {
  const baseDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;

  if (!baseDirectory) {
    return null;
  }

  return `${baseDirectory}${STORAGE_FILE_NAME}`;
}

export async function loadPersistedState(): Promise<PersistedState | null> {
  const storageUri = getStorageUri();

  if (!storageUri) {
    return memoryState ? (JSON.parse(memoryState) as PersistedState) : null;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(storageUri);
    if (!fileInfo.exists) {
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(storageUri);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return memoryState ? (JSON.parse(memoryState) as PersistedState) : null;
  }
}

export async function savePersistedState(state: PersistedState): Promise<void> {
  const raw = JSON.stringify(state);
  memoryState = raw;

  const storageUri = getStorageUri();
  if (!storageUri) {
    return;
  }

  await FileSystem.writeAsStringAsync(storageUri, raw);
}

export async function clearPersistedState(): Promise<void> {
  memoryState = null;

  const storageUri = getStorageUri();
  if (!storageUri) {
    return;
  }

  const fileInfo = await FileSystem.getInfoAsync(storageUri);
  if (fileInfo.exists) {
    await FileSystem.deleteAsync(storageUri, { idempotent: true });
  }
}
