import type { SpeechPriority } from '@/lib/speech/voice/types';

interface ListenerInput {
  isOnline: boolean;
  /** The person's mode allows listening in the cloud. */
  isCloudAllowed: boolean;
  /** The cloud turned this device away for today. */
  isCloudHeld: boolean;
  /** The app supplied a way to get a token. */
  hasCloud: boolean;
}

interface SpeakerInput {
  isOnline: boolean;
  priority: SpeechPriority;
  isNaturalVoiceReady: boolean;
  /** No cloud adapter exists yet, so this is read by nothing. */
  isCloudAvailable?: boolean;
}

export type ListenerChoice = 'cloud' | 'browser';
export type SpeakerChoice = 'natural' | 'system';

/** Which adapter listens to an utterance: the cloud's only when online, allowed, not held today and the app has a token source; the browser's recognition otherwise. */
export const pickListener = (input: ListenerInput): ListenerChoice =>
  input.isOnline && input.isCloudAllowed && !input.isCloudHeld && input.hasCloud
    ? 'cloud'
    : 'browser';

/** Which adapter speaks a line: the natural voice when it is ready, else the system voice. */
export const pickSpeaker = (input: SpeakerInput): SpeakerChoice =>
  input.isNaturalVoiceReady ? 'natural' : 'system';
