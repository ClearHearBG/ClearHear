import { useAuth, useUser } from '@clerk/clerk-expo';
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
  if (mode === 'dark' || mode === 'midnight') return 'dark';
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
  logout: () => Promise<void>;
  toggleDeviceEnabled: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setAutoTranscribe: (value: boolean) => Promise<void>;
  transcribeLastFiveMinutes: () => Promise<void>;
  askAssistant: (question: string) => Promise<void>;
  clearConversationData: () => Promise<void>;
  completeEarTest: (profile: HearingProfile) => Promise<void>;
  clearLocalEarTestData: () => void;
  retakeEarTest: () => void;
}
 
const AppContext = createContext<AppContextValue | null>(null);
 
export function AppProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
 
  const [isReady, setIsReady] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [hearingProfile, setHearingProfile] = useState<HearingProfile | null>(null);
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
    if (!session) {
      setHearingProfile(null);
      setShouldShowEarTest(false);
      return;
    }

    setHearingProfile(earTestProfilesByUser[session.id] ?? null);
  }, [earTestProfilesByUser, session]);
 
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
    try {
      const transcript = await mockApi.transcribeLastFiveMinutes(transcripts.length);
      setTranscripts((c) => [transcript, ...c].slice(0, 12));
    } finally {
      setIsTranscribing(false);
    }
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
