import { useAuth, useUser } from '@clerk/clerk-expo';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
 
import { configureApiClient, getRuntimeErrorDetails } from '@/src/api/mutator/custom-instance';
import { clearAudioBufferRecorder, exportAudioBuffer, getAudioBufferStatus, startAudioBufferRecorder, stopAudioBufferRecorder } from '@/src/services/audioBufferRecorder';
import { mockApi } from '@/src/services/mockApi'; 
import { loadPersistedState, savePersistedState } from '@/src/services/storage';
import {
  createTranscriptionFromBuffer,
  deleteAllTranscriptions,
  deleteTranscription as deleteTranscriptionById,
  fetchTranscriptions,
} from '@/src/services/transcriptions';
import { createNavigationTheme, themes } from '@/src/theme/theme';
import type {
  AppPreferences,
  AudioBufferStatus,
  AssistantMessage,
  HearingProfile,
  ThemeMode,
  TranscriptRecord,
  UserSession,
} from '@/src/types/app';
 
const defaultPreferences: AppPreferences = {
  themeMode: 'light',
  isDeviceEnabled: true,
  autoTranscribe: false,
};

const TRANSCRIPT_SYNC_RETRY_DELAYS_MS = [0, 1500, 4000];
 
function normalizeThemeMode(mode: string | undefined | null): ThemeMode {
  if (mode === 'dark' || mode === 'midnight') return 'dark';
  return 'light';
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
 
interface AppContextValue {
  isReady: boolean;
  session: UserSession | null;
  preferences: AppPreferences;
  theme: (typeof themes)[ThemeMode];
  navigationTheme: ReturnType<typeof createNavigationTheme>;
  hearingProfile: HearingProfile | null;
  audioBufferStatus: AudioBufferStatus;
  transcripts: TranscriptRecord[];
  assistantMessages: AssistantMessage[];
  needsEarTest: boolean;
  isAuthenticating: boolean;
  isTranscribing: boolean;
  isAskingAssistant: boolean;
  isSavingProfile: boolean;
  logout: () => Promise<void>;
  toggleDeviceEnabled: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setAutoTranscribe: (value: boolean) => Promise<void>;
  transcribeLastFiveMinutes: () => Promise<void>;
  deleteTranscript: (id: string) => Promise<void>;
  askAssistant: (question: string) => Promise<void>;
  clearConversationData: () => Promise<void>;
  completeEarTest: (profile: HearingProfile) => Promise<void>;
  clearLocalEarTestData: () => void;
  retakeEarTest: () => void;
}
 
const AppContext = createContext<AppContextValue | null>(null);

const defaultAudioBufferStatus: AudioBufferStatus = {
  isRecording: false,
  bufferedSeconds: 0,
  maxBufferSeconds: 15,
  recentInputLevel: 0,
  hasRecentInput: false,
};
 
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
 
  const [isReady, setIsReady] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [hearingProfile, setHearingProfile] = useState<HearingProfile | null>(null);
  const [audioBufferStatus, setAudioBufferStatus] = useState<AudioBufferStatus>(defaultAudioBufferStatus);
  const [earTestProfilesByUser, setEarTestProfilesByUser] = useState<Record<string, HearingProfile>>({});
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [shouldShowEarTest, setShouldShowEarTest] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAskingAssistant, setIsAskingAssistant] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const hasHydrated = useRef(false);
 
  // Build a UserSession from the Clerk user whenever it changes
  const session: UserSession | null = useMemo(() => {
    if (!isSignedIn || !user) return null;
    return {
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'ClearHear Member',
      email: user.primaryEmailAddress?.emailAddress ?? '',
      joinedAt: user.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  }, [isSignedIn, user]);
 
  // Hydrate persisted state once on mount
  useEffect(() => {
    let isMounted = true;
 
    const hydrate = async () => {
      const persisted = await loadPersistedState();
 
      if (!isMounted) return;
 
      if (persisted) {
        setPreferences(
          persisted.preferences
            ? { ...persisted.preferences, themeMode: normalizeThemeMode(persisted.preferences.themeMode) }
            : defaultPreferences,
        );
        setHearingProfile(persisted.hearingProfile);
        setEarTestProfilesByUser(persisted.earTestProfilesByUser ?? {});
        setTranscripts(persisted.transcripts ?? []);
        setAssistantMessages(
          persisted.assistantMessages?.length > 0
            ? persisted.assistantMessages
            : [],
        );
      }
 
      hasHydrated.current = true;
      setIsReady(true);
    };
 
    void hydrate();
    return () => { isMounted = false; };
  }, []);
 
  // When a user signs in for the first time (no prior messages), seed the intro
  useEffect(() => {
    if (!session) return;
    if (assistantMessages.length === 0) {
      setAssistantMessages([mockApi.buildIntroMessage(session.name)]);
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    configureApiClient(
      isSignedIn
        ? () => getToken({ skipCache: true } as never)
        : null,
    );
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (!session) {
      setHearingProfile(null);
      setShouldShowEarTest(false);
      setTranscripts([]);
      return;
    }

    setHearingProfile(earTestProfilesByUser[session.id] ?? null);
  }, [earTestProfilesByUser, session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let isActive = true;

    const syncTranscripts = async () => {
      for (let index = 0; index < TRANSCRIPT_SYNC_RETRY_DELAYS_MS.length; index += 1) {
        const delayMs = TRANSCRIPT_SYNC_RETRY_DELAYS_MS[index];

        if (delayMs > 0) {
          await sleep(delayMs);
        }

        if (!isActive) {
          return;
        }

        try {
          const remoteTranscripts = await fetchTranscriptions();
          if (isActive) {
            setTranscripts(remoteTranscripts);
          }
          return;
        } catch (error) {
          const isLastAttempt = index === TRANSCRIPT_SYNC_RETRY_DELAYS_MS.length - 1;
          if (isLastAttempt) {
            console.warn('Failed to load transcripts from the backend.', getRuntimeErrorDetails(error));
          }
        }
      }
    };

    void syncTranscripts();

    return () => {
      isActive = false;
    };
  }, [session]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!session || !preferences.isDeviceEnabled || !hearingProfile || shouldShowEarTest) {
      void stopAudioBufferRecorder();
      return;
    }

    void startAudioBufferRecorder().catch((error) => {
      console.warn('Failed to start the rolling audio buffer.', error);
      setPreferences((current) => ({ ...current, isDeviceEnabled: false }));
    });
  }, [hearingProfile, isReady, preferences.isDeviceEnabled, session, shouldShowEarTest]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const shouldPoll =
      Boolean(session) &&
      preferences.isDeviceEnabled &&
      Boolean(hearingProfile) &&
      !shouldShowEarTest;

    if (!shouldPoll) {
      setAudioBufferStatus(defaultAudioBufferStatus);
      return;
    }

    let isActive = true;

    const syncStatus = async () => {
      try {
        const nextStatus = await getAudioBufferStatus();
        if (isActive) {
          setAudioBufferStatus(nextStatus);
        }
      } catch (error) {
        if (isActive) {
          console.warn('Failed to read the rolling audio buffer status.', error);
        }
      }
    };

    void syncStatus();
    const interval = setInterval(() => {
      void syncStatus();
    }, 1000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [hearingProfile, isReady, preferences.isDeviceEnabled, session, shouldShowEarTest]);
 
  // Persist state whenever it changes (after hydration)
  useEffect(() => {
    if (!hasHydrated.current) return;
 
    void savePersistedState({
      session,
      preferences,
      hearingProfile,
      earTestProfilesByUser,
      transcripts,
      assistantMessages,
    });
  }, [assistantMessages, earTestProfilesByUser, hearingProfile, preferences, session, transcripts]);
 
  const theme = themes[preferences.themeMode];
  const navigationTheme = useMemo(() => createNavigationTheme(theme), [theme]);
 
  const updatePreferences = async (updater: (current: AppPreferences) => AppPreferences) => {
    const nextPreferences = updater(preferences);
    const saved = await mockApi.savePreferences(nextPreferences);
    setPreferences(saved);
  };
 
  const logout = async () => {
    await signOut();
    await stopAudioBufferRecorder();
    setHearingProfile(null);
    setShouldShowEarTest(false);
    setTranscripts([]);
    setAssistantMessages([]);
    setPreferences((c) => ({ ...c, isDeviceEnabled: false }));
  };
 
  const toggleDeviceEnabled = async () => {
    if (!preferences.isDeviceEnabled && !hearingProfile) {
      setShouldShowEarTest(true);
      setPreferences((current) => ({ ...current, isDeviceEnabled: false }));
      return;
    }

    await updatePreferences((c) => ({ ...c, isDeviceEnabled: !c.isDeviceEnabled }));
  };
 
  const setThemeMode = async (mode: ThemeMode) => {
    await updatePreferences((c) => ({ ...c, themeMode: normalizeThemeMode(mode) }));
  };
 
  const setAutoTranscribe = async (value: boolean) => {
    await updatePreferences((c) => ({ ...c, autoTranscribe: value }));
  };
 
  const transcribeLastFiveMinutes = async () => {
    setIsTranscribing(true);
    let statusBeforeExport = audioBufferStatus;
    try {
      statusBeforeExport = await getAudioBufferStatus();
      const audioBuffer = await exportAudioBuffer();
      const transcript = await createTranscriptionFromBuffer(audioBuffer);
      setTranscripts((c) => [transcript, ...c].slice(0, 12));
      setAssistantMessages((current) => {
        if (!session) {
          return current;
        }

        return current.length > 0 ? current : [mockApi.buildIntroMessage(session.name)];
      });
    } catch (error) {
      console.warn('Failed to create a recap from the rolling buffer.', {
        error: getRuntimeErrorDetails(error),
        audioBufferStatus,
        statusBeforeExport,
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const deleteTranscript = async (id: string) => {
    await deleteTranscriptionById(id);
    setTranscripts((current) => current.filter((transcript) => transcript.id !== id));
  };
 
  const askAssistant = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
 
    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
 
    setAssistantMessages((c) => [...c, userMessage]);
    setIsAskingAssistant(true);
 
    try {
      const answer = await mockApi.askConversationAssistant(trimmed, transcripts);
      setAssistantMessages((c) => [
        ...c,
        { id: `assistant-${Date.now()}`, role: 'assistant', text: answer, createdAt: new Date().toISOString() },
      ]);
    } finally {
      setIsAskingAssistant(false);
    }
  };
 
  const clearConversationData = async () => {
    await deleteAllTranscriptions();
    setTranscripts([]);
    setAssistantMessages(session ? [mockApi.buildIntroMessage(session.name)] : []);
  };
 
  const completeEarTest = async (profile: HearingProfile) => {
    setIsSavingProfile(true);
    try {
      setHearingProfile(profile);
      setShouldShowEarTest(false);
      setPreferences((current) => ({ ...current, isDeviceEnabled: true }));
      if (session) {
        setEarTestProfilesByUser((current) => ({
          ...current,
          [session.id]: profile,
        }));
      }
    } finally {
      setIsSavingProfile(false);
    }
  };
 
  const retakeEarTest = () => {
    setHearingProfile(null);
    setShouldShowEarTest(true);
    setPreferences((current) => ({ ...current, isDeviceEnabled: false }));
    if (session) {
      setEarTestProfilesByUser((current) => {
        const next = { ...current };
        delete next[session.id];
        return next;
      });
    }
  };

  const clearLocalEarTestData = () => {
    setHearingProfile(null);
    setShouldShowEarTest(false);
    setEarTestProfilesByUser({});
    setPreferences((current) => ({ ...current, isDeviceEnabled: false }));
    setAudioBufferStatus(defaultAudioBufferStatus);
    void clearAudioBufferRecorder();
  };
 
  const value: AppContextValue = {
    isReady,
    session,
    preferences,
    theme,
    navigationTheme,
    hearingProfile,
    audioBufferStatus,
    transcripts,
    assistantMessages,
    needsEarTest: shouldShowEarTest,
    isAuthenticating: false, // Clerk handles its own loading states
    isTranscribing,
    isAskingAssistant,
    isSavingProfile,
    logout,
    toggleDeviceEnabled,
    setThemeMode,
    setAutoTranscribe,
    transcribeLastFiveMinutes,
    deleteTranscript,
    askAssistant,
    clearConversationData,
    completeEarTest,
    clearLocalEarTestData,
    retakeEarTest,
  };
 
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
 
export function useAppState() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppState must be used within AppProvider');
  return context;
}
