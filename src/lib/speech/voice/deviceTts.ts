import { readAloud } from '@/lib/speech/readAloud';
import type { TtsAdapter } from '@/lib/speech/voice/types';

/** How long the device's voice may take to start before a line is given up on. */
export const DEVICE_START_TIMEOUT_MS = 1500;

/** Speaks through `readAloud`: the natural voice when `isNatural` and ready, the system voice otherwise. */
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
          startTimeoutMs: DEVICE_START_TIMEOUT_MS,
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
