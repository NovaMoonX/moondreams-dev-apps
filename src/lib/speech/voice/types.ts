export type VoiceRoute = 'cloud' | 'device';

export type CloudHeldReason = 'listenLimit' | 'mintLimit' | 'budgetReached';

export type SpeechHeldReason = 'speechLimit' | 'budgetReached';

/** ack: a code-built confirmation of what was done · reply: an answer · summary: a long read. */
export type SpeechPriority = 'ack' | 'reply' | 'summary';

/** whisper: said softly and close; only the cloud voice can. */
export type SpeechDelivery = 'whisper';

export type SttErrorCode =
  'denied' | 'service' | 'no-microphone' | 'unavailable' | 'language';

export interface SttStartOptions {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onSpeechStart: () => void;
  onError: (code: SttErrorCode) => void;
  /** Audio is being captured (the microphone is live); only an adapter that takes a while to get ready calls it. */
  onListening?: () => void;
  /** A recognizer is open on that audio, so silence now means nothing was said; a no-speech timer starts here, never at `onListening`. */
  onReady?: () => void;
  /** The audio just before the tap, for adapters that keep a buffer; always null for now. */
  preRoll: Float32Array | null;
}

/** A microphone already open and running through the capture worklet: the frames from just before it was handed over, then the live ones. */
export interface FrameSource {
  /** 16 kHz mono 16-bit little-endian frames, oldest first. */
  preRoll: ArrayBuffer[];
  /** Gets every later frame, including any that arrived before this call; call once. */
  subscribe: (onFrame: (frame: ArrayBuffer) => void) => void;
  /** Releases the microphone. */
  stop: () => void;
}

/** What a cloud listen that gave up hands to the listener that takes over. */
export interface CloudHandover {
  /** Everything heard so far, then the live audio while the microphone is open; null when no microphone was open to carry on. */
  source: FrameSource | null;
  /** The person had already ended the listen, so the audio in `source` is all there is and the new listener should finish at once. */
  isClosing: boolean;
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
  delivery?: SpeechDelivery;
  signal: AbortSignal;
  onStart: () => void;
  onEnd: () => void;
  onProgress?: (fraction: number) => void;
  onRouteChange?: () => void;
}

export interface TtsAdapter {
  id: string;
  route: VoiceRoute;
  /** Resolves with the id of what actually played (provider-qualified for the cloud, the fallback's id when it stood in); void means this adapter's id. */
  speak: (text: string, options: TtsSpeakOptions) => Promise<string | void>;
  isPlayingThroughWebAudio: boolean;
  isFallingBack?: boolean;
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
