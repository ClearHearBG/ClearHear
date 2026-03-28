export type HearingSupportStage = 'idle' | 'starting' | 'running' | 'error';

export type HearingSupportInputMode = 'mono' | 'stereo';

export type AudioDeviceSummary = {
  id: number;
  name: string;
  type: string;
  typeLabel: string;
  channelCounts: number[];
  sampleRates: number[];
  isBluetooth: boolean;
  isHeadset: boolean;
};

export type HearingSupportPoint = {
  ear: 'left' | 'right';
  frequency: number;
  lossDb: number;
};

export type HearingRangePoint = {
  ear: 'left' | 'right';
  minFrequency: number | null;
  maxFrequency: number | null;
};

export type NativeHearingSupportConfig = {
  points: HearingSupportPoint[];
  hearingRange?: HearingRangePoint[];
  maxGainDb?: number;
  bandCount?: number;
  baseGainDb?: number;
  boostMultiplier?: number;
  amplificationEnabled?: boolean;
  frequencyMappingEnabled?: boolean;
  noiseFilteringEnabled?: boolean;
  preferredInputId?: number | null;
  preferredOutputId?: number | null;
};

export type HearingSupportStatus = {
  stage: HearingSupportStage;
  running: boolean;
  inputMode: HearingSupportInputMode;
  usingSharedInput: boolean;
  sampleRate: number | null;
  bufferFrames: number | null;
  selectedInput: AudioDeviceSummary | null;
  selectedOutput: AudioDeviceSummary | null;
  availableInputs: AudioDeviceSummary[];
  availableOutputs: AudioDeviceSummary[];
  lastError: string | null;
};

export type BufferedAudioStatus = {
  isRecording: boolean;
  bufferedSeconds: number;
  maxBufferSeconds: number;
  recentInputLevel: number;
  hasRecentInput: boolean;
};

export type BufferedAudioExport = {
  uri: string;
  name: string;
  mimeType: string;
  durationSeconds: number;
};

export type BleAudioModuleEvents = {
  onStateChange: (status: HearingSupportStatus) => void;
};
