export type VoiceRoute = 'cloud' | 'device';

export type CloudHeldReason = 'listenLimit' | 'mintLimit' | 'budgetReached';

export type SpeechHeldReason = 'speechLimit' | 'budgetReached';

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
  /** Ends the utterance without sending anything more; `onFinal` fires once, empty. */
  cancel?: () => void;
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
  /** Resolves with the id of what actually played (provider-qualified for the cloud, the fallback's id when it stood in); void means this adapter's id. */
  speak: (text: string, options: TtsSpeakOptions) => Promise<string | void>;
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
