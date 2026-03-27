import type { PersistedState } from '@/src/types/app';

const STORAGE_KEY = '@clearhear/app-state/v1';

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryStore = new Map<string, string>();

const inMemoryStorage: StorageLike = {
  async getItem(key) {
    return memoryStore.get(key) ?? null;
  },
  async setItem(key, value) {
    memoryStore.set(key, value);
  },
  async removeItem(key) {
    memoryStore.delete(key);
  },
};

let cachedStorage: StorageLike | null = null;
let didWarnAboutFallback = false;

async function getStorage(): Promise<StorageLike> {
  if (cachedStorage) {
    return cachedStorage;
  }

  try {
    const asyncStorageModule = (await import('@react-native-async-storage/async-storage')) as {
      default?: StorageLike;
    };

    if (
      asyncStorageModule.default &&
      typeof asyncStorageModule.default.getItem === 'function' &&
      typeof asyncStorageModule.default.setItem === 'function' &&
      typeof asyncStorageModule.default.removeItem === 'function'
    ) {
      cachedStorage = asyncStorageModule.default;
      return cachedStorage;
    }
  } catch (error) {
    if (!didWarnAboutFallback) {
      didWarnAboutFallback = true;
      console.warn(
        'AsyncStorage native module is unavailable in this build. Falling back to in-memory storage until the Android app is rebuilt.',
        error,
      );
    }
  }

  cachedStorage = inMemoryStorage;
  return cachedStorage;
}

export async function loadPersistedState(): Promise<PersistedState | null> {
  try {
    const storage = await getStorage();
    const raw = await storage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

export async function savePersistedState(state: PersistedState): Promise<void> {
  const storage = await getStorage();
  await storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function clearPersistedState(): Promise<void> {
  const storage = await getStorage();
  await storage.removeItem(STORAGE_KEY);
}
