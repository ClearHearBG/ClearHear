import { registerWebModule, NativeModule } from 'expo';

import type {
  AudioDeviceSummary,
  BleAudioModuleEvents,
  HearingSupportStatus,
} from './ble-audio.types';

const unsupportedStatus: HearingSupportStatus = {
  stage: 'idle',
  running: false,
  inputMode: 'mono',
  usingSharedInput: true,
  sampleRate: null,
  bufferFrames: null,
  selectedInput: null,
  selectedOutput: null,
  availableInputs: [],
  availableOutputs: [],
  lastError: 'Live audio processing is only available on Android.',
};

class BleAudioModule extends NativeModule<BleAudioModuleEvents> {
  async getStatusAsync(): Promise<HearingSupportStatus> {
    return unsupportedStatus;
  }

  async getInputDevicesAsync(): Promise<AudioDeviceSummary[]> {
    return [];
  }

  async startAsync(): Promise<HearingSupportStatus> {
    return unsupportedStatus;
  }

  async updateProfileAsync(): Promise<HearingSupportStatus> {
    return unsupportedStatus;
  }

  async stopAsync(): Promise<HearingSupportStatus> {
    return unsupportedStatus;
  }
}

export default registerWebModule(BleAudioModule, 'ClearHearAudio');
