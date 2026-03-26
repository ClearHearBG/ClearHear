import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

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

interface AppContextValue {
  isReady: boolean;
  session: UserSession | null;
  preferences: AppPreferences;
  theme: (typeof themes)[ThemeMode];
  navigationTheme: ReturnType<typeof createNavigationTheme>;
  hearingProfile: HearingProfile | null;
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
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<UserSession | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [hearingProfile, setHearingProfile] = useState<HearingProfile | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptRecord[]>([]);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([mockApi.buildIntroMessage()]);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAskingAssistant, setIsAskingAssistant] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const hasHydrated = useRef(false);

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

  const signIn = async (name: string, email: string) => {
    setIsAuthenticating(true);
    try {
      const nextSession = await mockApi.login(name, email);
      setSession(nextSession);
      setHearingProfile(null);
      setTranscripts([]);
      setAssistantMessages([mockApi.buildIntroMessage(nextSession.name)]);
      setPreferences((current) => ({ ...current, isDeviceEnabled: true }));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const logout = async () => {
    await mockApi.logout();
    setSession(null);
    setHearingProfile(null);
    setTranscripts([]);
    setAssistantMessages([mockApi.buildIntroMessage()]);
    setPreferences((current) => ({ ...current, isDeviceEnabled: false }));
  };

  const toggleDeviceEnabled = async () => {
    await updatePreferences((current) => ({
      ...current,
      isDeviceEnabled: !current.isDeviceEnabled,
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
      setHearingProfile(savedProfile);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const retakeEarTest = () => {
    setHearingProfile(null);
  };

  const value: AppContextValue = {
    isReady,
    session,
    preferences,
    theme,
    navigationTheme,
    hearingProfile,
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
