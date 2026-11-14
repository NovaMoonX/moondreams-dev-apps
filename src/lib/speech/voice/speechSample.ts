import { unlockAudio } from '@/lib/speech/audioContext';
import { createCloudTts } from '@/lib/speech/voice/cloudTts';
import {
  withSpeechVoice,
  type SpeechSource,
  type SpeechVoice,
} from '@/lib/speech/voice/speechSource';
import type { TtsAdapter } from '@/lib/speech/voice/types';

export type SpeechSampleResult = 'played' | 'stopped' | 'failed';

const UNAVAILABLE = 'unavailable';

const noDevice: TtsAdapter = {
  id: UNAVAILABLE,
  route: 'device',
  isPlayingThroughWebAudio: false,
  speak: () => Promise.resolve(),
};

/** Plays one line in the cloud voice outside a conversation; the device voice never stands in. */
export const playSpeechSample = ({
  source,
  text,
  voice,
  onStart,
}: {
  source: SpeechSource;
  text: string;
  voice: SpeechVoice;
  onStart?: () => void;
}): { stop: () => void; done: Promise<SpeechSampleResult> } => {
  unlockAudio();
  const controller = new AbortController();
  const done = createCloudTts({
    source: withSpeechVoice(source, voice),
    fallback: noDevice,
  })
    .speak(text, {
      priority: 'reply',
      signal: controller.signal,
      onStart: () => onStart?.(),
      onEnd: () => undefined,
    })
    .then(
      (playedBy): SpeechSampleResult =>
        controller.signal.aborted
          ? 'stopped'
          : playedBy === UNAVAILABLE
            ? 'failed'
            : 'played',
      () => 'failed' as const,
    );
  return { stop: () => controller.abort(), done };
};
