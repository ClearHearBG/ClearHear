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

export type NativeHearingSupportConfig = {
  points: HearingSupportPoint[];
  maxGainDb?: number;
  bandCount?: number;
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
  lastError: string | null;
};

export type BleAudioModuleEvents = {
  onStateChange: (status: HearingSupportStatus) => void;
};
