import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { HearingSupportStatus } from '@/modules/ble-audio';
import {
  INITIAL_HEARING_SUPPORT_STATUS,
  addHearingSupportStatusListener,
  getHearingSupportStatusAsync,
  hasHearingSupportPermissionAsync,
  requestHearingSupportPermissionAsync,
  startHearingSupportAsync,
  stopHearingSupportAsync,
} from '@/src/services/hearingSupport';
import { mockApi } from '@/src/services/mockApi';
import { loadPersistedState, savePersistedState } from '@/src/services/storage';
import { createNavigationTheme, themes } from '@/src/theme/theme';
import type {
  AppPreferences,
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

function normalizeThemeMode(mode: string | undefined | null): ThemeMode {
  if (mode === 'dark' || mode === 'midnight') {
    return 'dark';
  }

  return 'light';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Live hearing support could not start.';
}

interface AppContextValue {
  isReady: boolean;
  session: UserSession | null;
  preferences: AppPreferences;
  theme: (typeof themes)[ThemeMode];
  navigationTheme: ReturnType<typeof createNavigationTheme>;
  hearingProfile: HearingProfile | null;
  hearingSupportStatus: HearingSupportStatus;
  canCancelEarTest: boolean;
  transcripts: TranscriptRecord[];
  assistantMessages: AssistantMessage[];
  needsEarTest: boolean;
  isAuthenticating: boolean;
  isTranscribing: boolean;
  isAskingAssistant: boolean;
  isSavingProfile: boolean;
  signIn: (name: string, email: string) => Promise<void>;
  logout: () => Promise<void>;
  toggleDeviceEnabled: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setAutoTranscribe: (value: boolean) => Promise<void>;
  transcribeLastFiveMinutes: () => Promise<void>;
  askAssistant: (question: string) => Promise<void>;
  clearConversationData: () => Promise<void>;
  completeEarTest: (profile: HearingProfile) => Promise<void>;
  retakeEarTest: () => void;
  cancelEarTest: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [hearingProfile, setHearingProfile] = useState<HearingProfile | null>(null);
  const [earTestBackup, setEarTestBackup] = useState<HearingProfile | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([mockApi.buildIntroMessage()]);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAskingAssistant, setIsAskingAssistant] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [hearingSupportStatus, setHearingSupportStatus] = useState<HearingSupportStatus>(INITIAL_HEARING_SUPPORT_STATUS);
  const hasHydrated = useRef(false);

  useEffect(() => {
    const subscription = addHearingSupportStatusListener((status) => {
      setHearingSupportStatus(status);
    });

    void getHearingSupportStatusAsync().then(setHearingSupportStatus);

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const hydrate = async () => {
      const persisted = await loadPersistedState();

      if (!isMounted) {
        return;
      }

      if (persisted) {
        setSession(persisted.session);
        setPreferences(
          persisted.preferences
            ? {
                ...persisted.preferences,
                themeMode: normalizeThemeMode(persisted.preferences.themeMode),
              }
            : defaultPreferences,
        );
        setHearingProfile(persisted.hearingProfile);
        setEarTestBackup(null);
        setTranscripts(persisted.transcripts ?? []);
        setAssistantMessages(
          persisted.assistantMessages?.length > 0
            ? persisted.assistantMessages
            : [mockApi.buildIntroMessage(persisted.session?.name)],
        );
      }

      hasHydrated.current = true;
      setIsReady(true);
    };

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated.current) {
      return;
    }

    void savePersistedState({
      session,
      preferences,
      hearingProfile,
      transcripts,
      assistantMessages,
    });
  }, [assistantMessages, hearingProfile, preferences, session, transcripts]);

  const theme = themes[preferences.themeMode];
  const navigationTheme = useMemo(() => createNavigationTheme(theme), [theme]);

  const updatePreferences = async (updater: (current: AppPreferences) => AppPreferences) => {
    const nextPreferences = updater(preferences);
    const savedPreferences = await mockApi.savePreferences(nextPreferences);
    setPreferences(savedPreferences);
  };

  const syncHearingSupport = useCallback(
    async ({
      enabled = preferences.isDeviceEnabled,
      profile = hearingProfile,
      promptForPermission = false,
    }: {
      enabled?: boolean;
      profile?: HearingProfile | null;
      promptForPermission?: boolean;
    } = {}) => {
      if (!session || !enabled || !profile) {
        const nextStatus = await stopHearingSupportAsync();
        setHearingSupportStatus(nextStatus);
        return nextStatus;
      }

      const hasPermission = promptForPermission
        ? await requestHearingSupportPermissionAsync()
        : await hasHearingSupportPermissionAsync();

      if (!hasPermission) {
        const nextStatus = {
          ...(await getHearingSupportStatusAsync()),
          lastError: 'Microphone permission is required to run live hearing support.',
          running: false,
          stage: 'error' as const,
        };
        setHearingSupportStatus(nextStatus);
        return nextStatus;
      }

      setHearingSupportStatus((current) => ({
        ...current,
        lastError: null,
        running: true,
        stage: 'starting',
      }));

      try {
        const nextStatus = await startHearingSupportAsync(profile);
        setHearingSupportStatus(nextStatus);
        return nextStatus;
      } catch (error) {
        const nextStatus = {
          ...(await getHearingSupportStatusAsync()),
          lastError: getErrorMessage(error),
          running: false,
          stage: 'error' as const,
        };
        setHearingSupportStatus(nextStatus);
        return nextStatus;
      }
    },
    [hearingProfile, preferences.isDeviceEnabled, session],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void syncHearingSupport();
  }, [hearingProfile, isReady, preferences.isDeviceEnabled, session, syncHearingSupport]);

  const signIn = async (name: string, email: string) => {
    setIsAuthenticating(true);
    try {
      const nextSession = await mockApi.login(name, email);
      setSession(nextSession);
      setHearingProfile(null);
      setEarTestBackup(null);
      setTranscripts([]);
      setAssistantMessages([mockApi.buildIntroMessage(nextSession.name)]);
      setPreferences((current) => ({ ...current, isDeviceEnabled: true }));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const logout = async () => {
    const nextStatus = await stopHearingSupportAsync();
    setHearingSupportStatus(nextStatus);
    await mockApi.logout();
    setSession(null);
    setHearingProfile(null);
    setEarTestBackup(null);
    setTranscripts([]);
    setAssistantMessages([mockApi.buildIntroMessage()]);
    setPreferences((current) => ({ ...current, isDeviceEnabled: false }));
  };

  const toggleDeviceEnabled = async () => {
    if (!preferences.isDeviceEnabled) {
      const hasPermission = await requestHearingSupportPermissionAsync();
      if (!hasPermission) {
        setHearingSupportStatus((current) => ({
          ...current,
          lastError: 'Microphone permission is required to run live hearing support.',
          running: false,
          stage: 'error',
        }));
        return;
      }

      await updatePreferences((current) => ({
        ...current,
        isDeviceEnabled: true,
      }));
      return;
    }

    await updatePreferences((current) => ({
      ...current,
      isDeviceEnabled: false,
    }));
  };

  const setThemeMode = async (mode: ThemeMode) => {
    await updatePreferences((current) => ({
      ...current,
      themeMode: normalizeThemeMode(mode),
    }));
  };

  const setAutoTranscribe = async (value: boolean) => {
    await updatePreferences((current) => ({
      ...current,
      autoTranscribe: value,
    }));
  };

  const transcribeLastFiveMinutes = async () => {
    setIsTranscribing(true);
    try {
      const transcript = await mockApi.transcribeLastFiveMinutes(transcripts.length);
      setTranscripts((current) => [transcript, ...current].slice(0, 12));
    } finally {
      setIsTranscribing(false);
    }
  };

  const askAssistant = async (question: string) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      return;
    }

    const userMessage: AssistantMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmedQuestion,
      createdAt: new Date().toISOString(),
    };

    setAssistantMessages((current) => [...current, userMessage]);
    setIsAskingAssistant(true);

    try {
      const answer = await mockApi.askConversationAssistant(trimmedQuestion, transcripts);
      setAssistantMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: answer,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsAskingAssistant(false);
    }
  };

  const clearConversationData = async () => {
    setTranscripts([]);
    setAssistantMessages([mockApi.buildIntroMessage(session?.name)]);
  };

  const completeEarTest = async (profile: HearingProfile) => {
    setIsSavingProfile(true);
    try {
      const savedProfile = await mockApi.saveHearingProfile(profile);

      if (preferences.isDeviceEnabled) {
        const hasPermission = await requestHearingSupportPermissionAsync();
        if (!hasPermission) {
          await updatePreferences((current) => ({
            ...current,
            isDeviceEnabled: false,
          }));
          setHearingSupportStatus((current) => ({
            ...current,
            lastError: 'Microphone permission is required to run live hearing support.',
            running: false,
            stage: 'error',
          }));
        }
      }

      setHearingProfile(savedProfile);
      setEarTestBackup(null);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const retakeEarTest = () => {
    setEarTestBackup(hearingProfile);
    setHearingProfile(null);
  };

  const cancelEarTest = () => {
    if (!earTestBackup) {
      return;
    }

    setHearingProfile(earTestBackup);
    setEarTestBackup(null);
  };

  const value: AppContextValue = {
    isReady,
    session,
    preferences,
    theme,
    navigationTheme,
    hearingProfile,
    hearingSupportStatus,
    canCancelEarTest: Boolean(earTestBackup),
    transcripts,
    assistantMessages,
    needsEarTest: Boolean(session && !hearingProfile),
    isAuthenticating,
    isTranscribing,
    isAskingAssistant,
    isSavingProfile,
    signIn,
    logout,
    toggleDeviceEnabled,
    setThemeMode,
    setAutoTranscribe,
    transcribeLastFiveMinutes,
    askAssistant,
    clearConversationData,
    completeEarTest,
    retakeEarTest,
    cancelEarTest,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppState must be used within AppProvider');
  }

  return context;
}
