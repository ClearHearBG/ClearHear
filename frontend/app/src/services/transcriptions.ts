import { getTranscriptions } from '@/src/api/generated/endpoints/transcriptions/transcriptions';
import type { TranscriptionEntity } from '@/src/api/generated/models';
import type { TranscriptRecord } from '@/src/types/app';

type NativeUploadFile = {
  uri: string;
  name: string;
  mimeType: string;
};

const transcriptionsApi = getTranscriptions();

function getTranscriptTitle(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'Recent recap';
  }

  const title = trimmed.split(/\s+/).slice(0, 5).join(' ');
  return title.length > 44 ? `${title.slice(0, 41)}...` : title;
}

function getPreferredLanguage(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const language = locale.split(/[-_]/)[0]?.trim().toLowerCase();
    return language || 'en';
  } catch {
    return 'en';
  }
}

export function mapTranscriptionToTranscriptRecord(entity: TranscriptionEntity): TranscriptRecord {
  return {
    id: entity.id,
    title: getTranscriptTitle(entity.text),
    text: entity.text,
    createdAt: entity.createdAt,
    minutes: entity.duration ? Math.max(1, Math.round(entity.duration / 60)) : 5,
    tags: [],
    speakers: [],
    sentiment: 'calm',
    source: 'buffer',
  };
}

export async function fetchTranscriptions(): Promise<TranscriptRecord[]> {
  const transcriptions = await transcriptionsApi.transcriptionsControllerFindAll();
  return transcriptions.map(mapTranscriptionToTranscriptRecord);
}

export async function createTranscriptionFromBuffer(file: NativeUploadFile): Promise<TranscriptRecord> {
  const transcription = await transcriptionsApi.transcriptionsControllerTranscribe({
    file: {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob,
    language: getPreferredLanguage(),
  });

  return mapTranscriptionToTranscriptRecord(transcription);
}

export async function deleteTranscription(id: string): Promise<void> {
  await transcriptionsApi.transcriptionsControllerRemove(id);
}

export async function deleteAllTranscriptions(): Promise<void> {
  await transcriptionsApi.transcriptionsControllerRemoveAll();
}
