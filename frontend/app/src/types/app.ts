export type ThemeMode = 'light' | 'dark';

export type EarSide = 'left' | 'right';

export type AppTab = 'home' | 'recaps' | 'ai' | 'settings';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
}

export interface AppPreferences {
  themeMode: ThemeMode;
  isDeviceEnabled: boolean;
  autoTranscribe: boolean;
}

export interface TranscriptRecord {
  id: string;
  title: string;
  text: string;
  createdAt: string;
  minutes: number;
  tags: string[];
  speakers: string[];
  sentiment: 'calm' | 'busy' | 'supportive';
  source: 'buffer';
}

export interface AssistantMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  createdAt: string;
}

export interface HearingPoint {
  ear: EarSide;
  frequency: number;
  threshold: number;
  lossDb: number;
  comfort: 'soft' | 'medium' | 'high';
  heard: boolean;
}

export interface HearingSummary {
  lowRangeHz: number | null;
  highRangeHz: number | null;
  averageLossDb: number;
  clarityScore: number;
}

export interface HearingProfile {
  id: string;
  testedAt: string;
  points: HearingPoint[];
  leftSummary: HearingSummary;
  rightSummary: HearingSummary;
  overallScore: number;
}

export interface PersistedState {
  session: UserSession | null;
  preferences: AppPreferences;
  hearingProfile: HearingProfile | null;
  earTestProfilesByUser?: Record<string, HearingProfile>;
  transcripts: TranscriptRecord[];
  assistantMessages: AssistantMessage[];
}
