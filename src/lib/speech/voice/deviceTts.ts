import { readAloud } from '@/lib/speech/readAloud';
import type { TtsAdapter } from '@/lib/speech/voice/types';

/** Speaks through `readAloud` (text written out for the ear first): the natural voice when `isNatural` and it is ready, the system voice otherwise. `isPlayingThroughWebAudio` follows the voice actually heard, so a natural voice that gave way to the system voice says so. */
export const createDeviceTts = ({
  isNatural,
  lang,
}: {
  isNatural: boolean;
  lang: string;
}): TtsAdapter => {
  const live = { isNaturalNow: false };
  return {
    id: isNatural ? 'natural' : 'system',
    route: 'device',
    get isPlayingThroughWebAudio() {
      return live.isNaturalNow;
    },
    speak: (text, { signal, onStart, onEnd, onProgress, onRouteChange }) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        const state = { stop: null as (() => void) | null, isDone: false };
        const finish = () => {
          if (state.isDone) return;
          state.isDone = true;
          signal.removeEventListener('abort', abort);
          onEnd();
          resolve();
        };
        function abort() {
          state.stop?.();
          finish();
        }
        signal.addEventListener('abort', abort);
        state.stop = readAloud(text, {
          lang,
          isNatural,
          startTimeoutMs: 1500,
          onStart,
          onEnd: finish,
          onProgress,
          onVoice: (voice) => {
            live.isNaturalNow = voice === 'natural';
            onRouteChange?.();
          },
        });
      }),
  };
};
