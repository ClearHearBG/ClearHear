import { NativeModule, requireNativeModule } from 'expo';

import type {
  AudioDeviceSummary,
  BleAudioModuleEvents,
  BufferedAudioExport,
  BufferedAudioStatus,
  HearingSupportStatus,
} from './ble-audio.types';

declare class BleAudioModule extends NativeModule<BleAudioModuleEvents> {
  getStatusAsync(): Promise<HearingSupportStatus>;
  getInputDevicesAsync(): Promise<AudioDeviceSummary[]>;
  getBufferedAudioStatusAsync(): Promise<BufferedAudioStatus>;
  exportBufferedAudioAsync(): Promise<BufferedAudioExport>;
  clearBufferedAudioAsync(): Promise<void>;
  startAsync(configJson: string): Promise<HearingSupportStatus>;
  updateProfileAsync(configJson: string): Promise<HearingSupportStatus>;
  stopAsync(): Promise<HearingSupportStatus>;
}

export default requireNativeModule<BleAudioModule>('ClearHearAudio');
