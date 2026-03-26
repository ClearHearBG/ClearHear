import type {
  AppPreferences,
  AssistantMessage,
  HearingProfile,
  TranscriptRecord,
  UserSession,
} from '@/src/types/app';

const transcriptTemplates = [
  {
    title: 'Cafe planning chat',
    text:
      'You talked about meeting near the bakery after work, checking whether the outside tables were quiet enough, and bringing the blue over-ear headphones for the train ride home.',
    tags: ['plans', 'travel', 'headphones'],
    speakers: ['You', 'Mila'],
    sentiment: 'calm' as const,
  },
  {
    title: 'Shift update',
    text:
      'A teammate mentioned that Thursday\'s stand-up moved to 2:30 PM, the client recap should stay under twenty minutes, and the design handoff notes are already in the shared folder.',
    tags: ['work', 'schedule', 'handoff'],
    speakers: ['You', 'Teammate'],
    sentiment: 'busy' as const,
  },
  {
    title: 'Family follow-up',
    text:
      'Someone checked if dinner should be moved later, asked whether the taxi was booked, and reminded you to call once you arrived because the restaurant gets loud after seven.',
    tags: ['family', 'dinner', 'reminder'],
    speakers: ['You', 'Sister'],
    sentiment: 'supportive' as const,
  },
  {
    title: 'Clinic reminder',
    text:
      'The receptionist confirmed the hearing specialist visit for next Tuesday morning, suggested bringing your current earbuds, and said a quieter room would be available on request.',
    tags: ['health', 'appointment', 'audio'],
    speakers: ['You', 'Reception'],
    sentiment: 'supportive' as const,
  },
];

function delay(ms = 700): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sanitizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : 'ClearHear Member';
}

function buildIntro(name?: string): AssistantMessage {
  return {
    id: `assistant-intro-${name ?? 'guest'}`,
    role: 'assistant',
    text: name
      ? `Hi ${name}. Save a recent conversation and ask me about it whenever you need a quick recap.`
      : 'Hi. Save a recent conversation and I can help you look back at it.',
    createdAt: new Date().toISOString(),
  };
}

function extractTimeMention(text: string): string | null {
  const match = text.match(/\b\d{1,2}(?::\d{2})?\s?(?:AM|PM)\b/i);
  return match?.[0] ?? null;
}

export const mockApi = {
  async login(name: string, email: string): Promise<UserSession> {
    await delay(800);

    return {
      id: `session-${Date.now()}`,
      name: sanitizeName(name),
      email: email.trim().length > 0 ? email.trim() : 'demo@clearhear.app',
      joinedAt: new Date().toISOString(),
    };
  },

  async logout(): Promise<void> {
    await delay(280);
  },

  async savePreferences(preferences: AppPreferences): Promise<AppPreferences> {
    await delay(200);
    return preferences;
  },

  async saveHearingProfile(profile: HearingProfile): Promise<HearingProfile> {
    await delay(680);
    return profile;
  },

  async transcribeLastFiveMinutes(existingCount: number): Promise<TranscriptRecord> {
    await delay(1100);

    const template = transcriptTemplates[existingCount % transcriptTemplates.length];

    return {
      id: `transcript-${Date.now()}`,
      title: template.title,
      text: template.text,
      createdAt: new Date().toISOString(),
      minutes: 5,
      tags: template.tags,
      speakers: template.speakers,
      sentiment: template.sentiment,
      source: 'buffer',
    };
  },

  async askConversationAssistant(question: string, transcripts: TranscriptRecord[]): Promise<string> {
    await delay(900);

    if (transcripts.length === 0) {
      return 'I do not have a saved recap yet. Save one first and I can answer from it.';
    }

    const latest = transcripts[0];
    const allTags = Array.from(new Set(transcripts.flatMap((transcript) => transcript.tags))).slice(0, 4);
    const lowerQuestion = question.toLowerCase();
    const timeMention = transcripts.map((transcript) => extractTimeMention(transcript.text)).find(Boolean);

    if (lowerQuestion.includes('when') || lowerQuestion.includes('time') || lowerQuestion.includes('schedule')) {
      return timeMention
        ? `The clearest time cue I found was ${timeMention}. The latest saved capture also mentions ${latest.title.toLowerCase()}.`
        : `I did not find a precise time stamp, but your recent captures revolve around ${allTags.join(', ')} and the latest one is "${latest.title}."`;
    }

    if (lowerQuestion.includes('who') || lowerQuestion.includes('person') || lowerQuestion.includes('people')) {
      return `The most recent conversation involved ${latest.speakers.join(' and ')}. Across your saved captures, the recurring themes are ${allTags.join(', ')}.`;
    }

    if (lowerQuestion.includes('summary') || lowerQuestion.includes('talk about') || lowerQuestion.includes('discuss')) {
      return `Here is the short recap: the last ${Math.min(transcripts.length, 3)} captures focused on ${allTags.join(', ')}. The newest transcript says: "${latest.text}"`;
    }

    return `Based on your saved conversation memory, the strongest thread right now is ${allTags.join(', ')}. The latest capture, "${latest.title}", says ${latest.text.toLowerCase()}`;
  },

  buildIntroMessage(name?: string): AssistantMessage {
    return buildIntro(name);
  },
};
