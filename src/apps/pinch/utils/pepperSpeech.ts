import type { SpeakHandlers } from '@/hooks/useSpeechCommands';
import type { FallbackCause } from '@/lib/fallbacks/fallbacks';
import { createCloudTts } from '@/lib/speech/voice/cloudTts';
import { createDeviceTts } from '@/lib/speech/voice/deviceTts';
import {
  createSpeechSource,
  type SpeechSource,
} from '@/lib/speech/voice/speechSource';
import type { SpeechPriority } from '@/lib/speech/voice/types';
import {
  getHttpFunctionUrl,
  getSignedHeaders,
} from '@lib/firebase/httpFunction';

/** Pepper's voice: the server's default for the app (Zephyr), never a pick. */
export const createPepperSpeechSource = () =>
  createSpeechSource({
    appId: 'pinch',
    url: getHttpFunctionUrl('streamSpeech'),
    getHeaders: getSignedHeaders,
    readVoice: () => ({ voiceId: null, speed: null }),
  });

const CLOUD_PROVIDER_NAMES: Record<string, string> = {
  googleTts: 'Google cloud voice',
  geminiTts: 'Gemini cloud voice',
  deepgramAura: 'Deepgram cloud voice',
};

/** What a line was said with, as the conversation log words it; the voice name is the one the server reports, a stand-in for Zephyr included. */
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

export interface PepperSpoken {
  /** What actually sounded: a cloud voice, the natural voice or the browser's. */
  voice: string;
  /** Why the cloud voice was not the one heard (what failed first); null when it was. */
  cloudFailure: FallbackCause | null;
}

interface PepperSpeakerOptions {
  source: SpeechSource;
  lang: string;
  isNatural: () => boolean;
  getPriority: () => SpeechPriority;
  /** Runs when a line starts sounding, with the voice that is making the sound. */
  onSpoken: (text: string, spoken: PepperSpoken) => void;
  /** Runs when the cloud voice sounded and then broke off, so some of the line was never said. */
  onCut: (cause: FallbackCause) => void;
}

/** Says a line in the cloud voice, with the device's voice (the natural one when the person turned it on and it is ready) covering a slow or failed answer before any sound. Each line gets its own adapters, so what one line did never colours the next. */
export const createPepperSpeaker =
  ({
    source,
    lang,
    isNatural,
    getPriority,
    onSpoken,
    onCut,
  }: PepperSpeakerOptions) =>
  (text: string, { onStart, onEnd, onNoStart }: SpeakHandlers) => {
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
    const cloud = createCloudTts({
      source: lineSource,
      fallback: device,
      onFallback: (cause) => {
        line.failure = cause;
      },
      onCut,
    });
    const getVoice = () => {
      if (!cloud.isFallingBack)
        return describeSpokenVoice(line.provider, cloud.id, line.voiceName);
      return describeSpokenVoice(
        null,
        device.isPlayingThroughWebAudio ? 'natural' : 'system',
      );
    };
    cloud
      .speak(text, {
        priority: getPriority(),
        signal: aborter.signal,
        onStart: () => {
          line.isStarted = true;
          onSpoken(text, {
            voice: getVoice(),
            cloudFailure: cloud.isFallingBack ? line.failure : null,
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
