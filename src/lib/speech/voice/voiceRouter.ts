import type { SpeechPriority } from '@/lib/speech/voice/types';

interface ListenerInput {
  isOnline: boolean;
  /** No cloud adapter exists yet, so this is read by nothing. */
  isCloudAvailable?: boolean;
}

interface SpeakerInput {
  isOnline: boolean;
  priority: SpeechPriority;
  isNaturalVoiceReady: boolean;
  /** No cloud adapter exists yet, so this is read by nothing. */
  isCloudAvailable?: boolean;
}

export type ListenerChoice = 'browser';
export type SpeakerChoice = 'natural' | 'system';

/** Which adapter listens to an utterance: the browser's recognition, the only one so far. A cloud adapter joins by adding a choice and the inputs it needs. */
export const pickListener = (input: ListenerInput): ListenerChoice => {
  void input;
  return 'browser';
};

/** Which adapter speaks a line: the natural voice when it is ready, else the system voice. */
export const pickSpeaker = (input: SpeakerInput): SpeakerChoice =>
  input.isNaturalVoiceReady ? 'natural' : 'system';
