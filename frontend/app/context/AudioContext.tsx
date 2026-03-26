import React, { createContext, useContext, useState, useRef, useCallback } from 'react';

export interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: Date;
  duration?: number;
}

export interface AudioSettings {
  bassBoost: number;
  midBoost: number;
  highBoost: number;
  trebleBoost: number;
  clarity: number;
  noiseReduction: number;
  volume: number;
  compressionRatio: number;
}

interface AudioContextType {
  isListening: boolean;
  isProcessing: boolean;
  transcripts: TranscriptEntry[];
  liveText: string;
  audioSettings: AudioSettings;
  bufferDuration: number; // minutes
  updateSettings: (settings: Partial<AudioSettings>) => void;
  startListening: () => void;
  stopListening: () => void;
  clearTranscripts: () => void;
  addTranscript: (text: string) => void;
  setLiveText: (text: string) => void;
}

const defaultSettings: AudioSettings = {
  bassBoost: 0,
  midBoost: 3,
  highBoost: 5,
  trebleBoost: 2,
  clarity: 70,
  noiseReduction: 60,
  volume: 80,
  compressionRatio: 50,
};

const AudioContext = createContext<AudioContextType>({
  isListening: false,
  isProcessing: false,
  transcripts: [],
  liveText: '',
  audioSettings: defaultSettings,
  bufferDuration: 5,
  updateSettings: () => {},
  startListening: () => {},
  stopListening: () => {},
  clearTranscripts: () => {},
  addTranscript: () => {},
  setLiveText: () => {},
});

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([
    {
      id: '1',
      text: 'Hello, how are you doing today? The weather seems quite nice outside.',
      timestamp: new Date(Date.now() - 1000 * 60 * 4),
    },
    {
      id: '2',
      text: 'I was thinking we could go to the park this afternoon if you are free.',
      timestamp: new Date(Date.now() - 1000 * 60 * 3),
    },
    {
      id: '3',
      text: 'The meeting has been rescheduled to Thursday at two PM.',
      timestamp: new Date(Date.now() - 1000 * 60 * 2),
    },
    {
      id: '4',
      text: 'Please make sure to bring your headphones and the project files.',
      timestamp: new Date(Date.now() - 1000 * 60 * 1),
    },
  ]);
  const [liveText, setLiveText] = useState('');
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(defaultSettings);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateSettings = useCallback((settings: Partial<AudioSettings>) => {
    setAudioSettings(prev => ({ ...prev, ...settings }));
  }, []);

  const addTranscript = useCallback((text: string) => {
    const entry: TranscriptEntry = {
      id: Date.now().toString(),
      text,
      timestamp: new Date(),
    };
    setTranscripts(prev => [...prev, entry]);
  }, []);

  const startListening = useCallback(() => {
    setIsListening(true);
    setIsProcessing(true);
    // Simulate live transcription
    const sampleTexts = [
      'Can you hear me clearly now?',
      'The audio quality sounds much better.',
      'This enhancement is working really well.',
      'I can understand every word you are saying.',
    ];
    let idx = 0;
    intervalRef.current = setInterval(() => {
      if (idx < sampleTexts.length) {
        setLiveText(sampleTexts[idx]);
        idx++;
      } else {
        setIsProcessing(false);
      }
    }, 3000);
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
    setIsProcessing(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (liveText) {
      addTranscript(liveText);
      setLiveText('');
    }
  }, [liveText, addTranscript]);

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  return (
    <AudioContext.Provider value={{
      isListening,
      isProcessing,
      transcripts,
      liveText,
      audioSettings,
      bufferDuration: 5,
      updateSettings,
      startListening,
      stopListening,
      clearTranscripts,
      addTranscript,
      setLiveText,
    }}>
      {children}
    </AudioContext.Provider>
  );
}

export const useAudio = () => useContext(AudioContext);
