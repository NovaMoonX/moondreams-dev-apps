import {
  clearFallback,
  reportFallback,
  type FallbackCause,
} from '@/lib/fallbacks/fallbacks';
import { NATURAL_START_TIMEOUT_MS } from '@/lib/speech/naturalVoice/config';
import {
  createCloudTts,
  FIRST_BYTE_MS,
  RESUME_MS,
} from '@/lib/speech/voice/cloudTts';
import {
  createDeviceTts,
  DEVICE_START_TIMEOUT_MS,
} from '@/lib/speech/voice/deviceTts';
import type { SpeechSource } from '@/lib/speech/voice/speechSource';
import type { SpeechPriority, TtsAdapter } from '@/lib/speech/voice/types';

// The first line of a session may meet a cold function on top of the usual sign-in and App Check waits.
const FIRST_LINE_FIRST_BYTE_MS = 6000;
// Once a line has fallen back, the next waits only this long, so a slow service costs a beat and not seconds of deaf microphone.
const AFTER_FALLBACK_FIRST_BYTE_MS = 1500;
// Two lines in a row that fall back or are cut short put the device's voice first for a while; one slow line never does.
const FAILURES_MAX = 2;
const RETRY_CLOUD_MS = 5 * 60_000;
const LATCH_FALLBACK_KEY = 'speech:cloud-speaker-latch';

const CLOUD_PROVIDER_NAMES: Record<string, string> = {
  googleTts: 'Google cloud voice',
  geminiTts: 'Gemini cloud voice',
  deepgramAura: 'Deepgram cloud voice',
};

/** What a line was said with, as a debug log words it; the voice name is the one the server reports, a stand-in included. */
export const describeSpokenVoice = (
  provider: string | null,
  id: string,
  voiceName: string | null = null,
) => {
  if (id === 'natural') return 'natural on-device voice';
  if (id === 'system') return 'browser voice';
  if (provider === 'emulator') return 'cloud voice test tone (local emulator)';
  const name =
    CLOUD_PROVIDER_NAMES[provider ?? ''] ??
    `cloud voice (${provider ?? 'unknown'})`;
  return `${name} (${voiceName ?? 'voice not named'})`;
};

// A queue gives a line this much beyond its voice's worst case before it moves on.
const LINE_WAIT_MARGIN_MS = 500;

/** How long the device's voice can take to give its first sound; the natural voice may use its whole allowance before the browser's takes over. */
const getDeviceStartWaitMs = (isNatural: boolean) =>
  DEVICE_START_TIMEOUT_MS + (isNatural ? NATURAL_START_TIMEOUT_MS : 0);

/** How long a queue waits for a line said by the device's voice alone to sound before it moves on. */
export const getDeviceLineWaitMs = (isNatural: boolean) =>
  getDeviceStartWaitMs(isNatural) + LINE_WAIT_MARGIN_MS;

export interface CloudSpoken {
  /** What actually sounded: a cloud voice, the natural voice or the browser's. */
  voice: string;
  /** Why the cloud voice was not the one heard (what failed first); null when it was. */
  cloudFailure: FallbackCause | null;
}

/** What a line reports back: it started sounding, it ended (also when cut or failed), or it never started. */
export interface CloudSpeakHandlers {
  onStart: () => void;
  onEnd: () => void;
  onNoStart: () => void;
}

interface CloudSpeakerOptions {
  source: SpeechSource;
  lang: string;
  isNatural: () => boolean;
  getPriority: () => SpeechPriority;
  /** Runs when a line starts sounding, with the voice that is making the sound. */
  onSpoken: (text: string, spoken: CloudSpoken) => void;
  /** Runs when the cloud voice sounded and then broke off, so some of the line was never said. */
  onCut: (cause: FallbackCause) => void;
}

/**
 * Says each line in a cloud voice, with the device's voice covering a slow or failed answer before any sound, and keeps what the sitting has learned: after one fallback the next line waits less for the cloud, and after two in a row the device's voice goes first, trying the cloud again every few minutes. `reset` starts the session over.
 */
export const createCloudSpeaker = ({
  source,
  lang,
  isNatural,
  getPriority,
  onSpoken,
  onCut,
}: CloudSpeakerOptions) => {
  const session = {
    failures: 0,
    latchedAt: null as number | null,
    hasPlayed: false,
    lastCause: null as FallbackCause | null,
  };

  const isDeviceFirst = () =>
    session.latchedAt !== null &&
    Date.now() - session.latchedAt < RETRY_CLOUD_MS;

  const getFirstByteMs = () => {
    if (session.failures > 0) return AFTER_FALLBACK_FIRST_BYTE_MS;
    return session.hasPlayed ? FIRST_BYTE_MS : FIRST_LINE_FIRST_BYTE_MS;
  };

  const countFailure = (cause: FallbackCause) => {
    session.failures += 1;
    session.lastCause = cause;
    if (session.failures < FAILURES_MAX) return;
    session.latchedAt = Date.now();
    reportFallback({
      key: LATCH_FALLBACK_KEY,
      feature: 'Speaking',
      wanted: 'the cloud voice',
      used: "this device's voice, with the cloud voice tried again in a few minutes",
      reason: 'two lines in a row fell back or were cut short',
      cause: {
        stage: 'cloud voice failed twice in a row',
        detail: `The last one, ${cause.stage}: ${cause.detail}`,
      },
      facts: [`Failures in a row: ${session.failures}`],
    });
  };

  const settle = () => {
    session.failures = 0;
    session.latchedAt = null;
    session.hasPlayed = true;
    session.lastCause = null;
    clearFallback(LATCH_FALLBACK_KEY);
  };

  const speak = (
    text: string,
    { onStart, onEnd, onNoStart }: CloudSpeakHandlers,
  ) => {
    const aborter = new AbortController();
    const line = {
      provider: null as string | null,
      voiceName: null as string | null,
      failure: null as FallbackCause | null,
      isStarted: false,
    };
    const lineSource: SpeechSource = {
      warm: source.warm,
      fetchSpeech: async (...args) => {
        const answer = await source.fetchSpeech(...args);
        if (answer.status === 'ready') {
          line.provider = answer.provider;
          line.voiceName = answer.voiceName ?? null;
        }
        return answer;
      },
    };
    const device = createDeviceTts({ isNatural: isNatural(), lang });
    const isSkippingCloud = isDeviceFirst();
    const cloud = isSkippingCloud
      ? null
      : createCloudTts({
          source: lineSource,
          fallback: device,
          firstByteMs: getFirstByteMs(),
          onFallback: (cause) => {
            line.failure = cause;
            countFailure(cause);
          },
          onCut: (cause) => {
            countFailure(cause);
            onCut(cause);
          },
          onPlayed: settle,
        });
    const adapter: TtsAdapter = cloud ?? device;
    const getCloudFailure = () => {
      if (cloud === null) return session.lastCause;
      return cloud.isFallingBack ? line.failure : null;
    };
    const getVoice = () =>
      cloud === null || cloud.isFallingBack
        ? describeSpokenVoice(
            null,
            device.isPlayingThroughWebAudio ? 'natural' : 'system',
          )
        : describeSpokenVoice(line.provider, cloud.id, line.voiceName);
    adapter
      .speak(text, {
        priority: getPriority(),
        signal: aborter.signal,
        onStart: () => {
          line.isStarted = true;
          onSpoken(text, {
            voice: getVoice(),
            cloudFailure: getCloudFailure(),
          });
          onStart();
        },
        onEnd: () => undefined,
      })
      .catch(() => undefined)
      .then(() => {
        if (!line.isStarted && !aborter.signal.aborted) onNoStart();
        onEnd();
      });
    return () => aborter.abort();
  };

  return {
    speak,
    /** Forgets what the sitting learned: the next line gets a cold start's allowance and the cloud voice first. */
    reset: () => {
      session.failures = 0;
      session.latchedAt = null;
      session.hasPlayed = false;
      session.lastCause = null;
      clearFallback(LATCH_FALLBACK_KEY);
    },
    /** How long a queue waits for the next line to sound before it moves on: the cloud's first-byte limit and the wake of the audio output, then the device's voice starting, then a margin. */
    getLineWaitMs: () =>
      (isDeviceFirst() ? 0 : getFirstByteMs() + RESUME_MS) +
      getDeviceLineWaitMs(isNatural()),
  };
};
