export type VoiceRoute = 'cloud' | 'device';

export type CloudHeldReason = 'listenLimit' | 'mintLimit' | 'budgetReached';

/** ack: a code-built confirmation of what was done · reply: an answer · summary: a long read. */
export type SpeechPriority = 'ack' | 'reply' | 'summary';

export type SttErrorCode =
  'denied' | 'service' | 'no-microphone' | 'unavailable' | 'language';

export interface SttStartOptions {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onSpeechStart: () => void;
  onError: (code: SttErrorCode) => void;
  /** The audio just before the tap, for adapters that keep a buffer; always null for now. */
  preRoll: Float32Array | null;
}

export interface SttAdapter {
  id: string;
  route: VoiceRoute;
  canStream: boolean;
  start: (options: SttStartOptions) => Promise<void>;
  /** Ends the utterance; `onFinal` fires once with everything heard. */
  stop: () => void;
}

export interface TtsSpeakOptions {
  priority: SpeechPriority;
  signal: AbortSignal;
  onStart: () => void;
  onEnd: () => void;
}

export interface TtsAdapter {
  id: string;
  route: VoiceRoute;
  speak: (text: string, options: TtsSpeakOptions) => Promise<void>;
  /** True when the audio goes through the page's audio graph, so the browser's echo cancellation hears it. */
  isPlayingThroughWebAudio: boolean;
}

export interface VoiceIdentity {
  id: string;
  label: string;
  device: {
    naturalVoice: boolean;
    systemVoiceHints: string[];
    rate: number;
    pitch: number;
  };
}
