import type { SpeechPriority } from '@/lib/speech/voice/types';

interface ListenerInput {
  isOnline: boolean;
  /** The person's mode allows listening in the cloud. */
  isCloudAllowed: boolean;
  /** The cloud turned this device away for today. */
  isCloudHeld: boolean;
  /** The app supplied a way to get a token. */
  hasCloud: boolean;
  /** The opt-in recognition model is downloaded and hears this language. */
  isOnDeviceReady: boolean;
}

interface SpeakerInput {
  isOnline: boolean;
  priority: SpeechPriority;
  isNaturalVoiceReady: boolean;
  /** The person's mode allows speaking in the cloud. */
  isCloudAllowed: boolean;
  /** The cloud turned this device away for today. */
  isCloudHeld: boolean;
  /** The app supplied a speech source. */
  hasCloud: boolean;
  /** An earlier line of this conversation fell back to the device voice. */
  isDeviceSticky: boolean;
}

export type ListenerChoice = 'cloud' | 'onDevice' | 'browser';
export type SpeakerChoice = 'cloud' | 'natural' | 'system';

/** Which adapter listens to an utterance: the cloud's only when online, allowed, not held today and the app has a token source; otherwise the on-device model when it is downloaded, else the browser's recognition. */
export const pickListener = (input: ListenerInput): ListenerChoice =>
  input.isOnline && input.isCloudAllowed && !input.isCloudHeld && input.hasCloud
    ? 'cloud'
    : input.isOnDeviceReady
      ? 'onDevice'
      : 'browser';

/** Which recognizer waits for a wake phrase: the on-device model when it is downloaded (nothing leaves the device), else the browser's own. Never the cloud. */
export const pickWakeListener = (input: {
  isOnDeviceReady: boolean;
}): Exclude<ListenerChoice, 'cloud'> =>
  input.isOnDeviceReady ? 'onDevice' : 'browser';

/** Which adapter speaks a line: the cloud's for a reply or summary when it can, else the natural voice when ready, else the system voice. */
export const pickSpeaker = (input: SpeakerInput): SpeakerChoice =>
  input.isOnline &&
  input.priority !== 'ack' &&
  input.isCloudAllowed &&
  !input.isCloudHeld &&
  !input.isDeviceSticky &&
  input.hasCloud
    ? 'cloud'
    : input.isNaturalVoiceReady
      ? 'natural'
      : 'system';
