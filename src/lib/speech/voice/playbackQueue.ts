import { setDucked } from '@/lib/speech/voice/duckBus';
import type { SpeechPriority, TtsAdapter } from '@/lib/speech/voice/types';

export interface SpeakResult {
  status: 'spoken' | 'cancelled' | 'failed';
  /** The adapter that played the line; null when none did. */
  adapterId: string | null;
}

interface Line {
  text: string;
  priority: SpeechPriority;
  /** Rises with each turn; a line from an older turn than the newest seen is dropped. */
  turnKey: number;
  onStart?: () => void;
  onProgress?: (fraction: number) => void;
  resolve: (result: SpeakResult) => void;
}

interface Playing {
  line: Line;
  controller: AbortController;
  adapter: TtsAdapter;
  progress: ReturnType<typeof createProgress>;
}

export const SPOKEN_CHARS_PER_SECOND = 14;
const ESTIMATE_TICK_MS = 150;
const ESTIMATE_CEILING = 0.96;
// A voice that reports only at chunk starts is estimated forward from its last report, but never further than a chunk.
const ESTIMATE_RUN_CHARS = 120;

/** A line's progress only moves forward: the voice's reports, with a clock estimate between them, short of the end. */
const createProgress = (line: Line) => {
  const state = {
    last: 0,
    reportedAt: 0,
    reportedFraction: 0,
    isReported: false,
    timerId: null as ReturnType<typeof setInterval> | null,
  };
  const report = (fraction: number) => {
    const next = Math.min(1, Math.max(0, fraction));
    if (next <= state.last) return;
    state.last = next;
    line.onProgress?.(next);
  };
  const stop = () => {
    if (state.timerId !== null) clearInterval(state.timerId);
    state.timerId = null;
  };
  return {
    fromAdapter: (fraction: number) => {
      state.isReported = true;
      state.reportedAt = Date.now();
      state.reportedFraction = Math.min(1, Math.max(0, fraction));
      report(fraction);
    },
    start: () => {
      if (!line.onProgress || state.timerId !== null) return;
      state.reportedAt = Date.now();
      state.timerId = setInterval(() => {
        const chars =
          ((Date.now() - state.reportedAt) / 1000) * SPOKEN_CHARS_PER_SECOND;
        report(
          Math.min(
            ESTIMATE_CEILING,
            state.reportedFraction +
              Math.min(
                state.isReported ? ESTIMATE_RUN_CHARS : Infinity,
                chars,
              ) /
                Math.max(1, line.text.length),
          ),
        );
      }, ESTIMATE_TICK_MS);
    },
    stop,
    complete: () => {
      stop();
      report(1);
    },
  };
};

/** The key a line joining the queue takes, or null to drop it: never newer than the queue's, and dropped when a newer turn has spoken. */
export const toJoinKey = ({
  turnKey,
  currentKey,
  isActive,
}: {
  turnKey: number;
  currentKey: number;
  isActive: boolean;
}) => {
  if (!isActive) return turnKey;
  return turnKey < currentKey ? null : currentKey;
};

/** One line plays at a time. Within a turn an `ack` goes before a `reply` or `summary` that is waiting, and never cuts one off; a line of a newer turn cancels the older turn's playing and waiting lines; `clear` stops everything. */
export const createPlaybackQueue = ({
  pick,
  onActiveChange,
  onRouteChange,
}: {
  pick: (priority: SpeechPriority) => TtsAdapter;
  onActiveChange?: (isActive: boolean) => void;
  onRouteChange?: () => void;
}) => {
  const state = {
    waiting: [] as Line[],
    playing: null as Playing | null,
    turnKey: null as number | null,
  };

  const cancelWaiting = (keep: (line: Line) => boolean) => {
    const dropped = state.waiting.filter((line) => !keep(line));
    state.waiting = state.waiting.filter(keep);
    dropped.forEach((line) =>
      line.resolve({ status: 'cancelled', adapterId: null }),
    );
  };

  const finish = (
    playing: Playing,
    status: SpeakResult['status'],
    isResuming: boolean,
    playedBy?: string | void,
  ) => {
    if (state.playing !== playing) return;
    state.playing = null;
    if (status === 'spoken') playing.progress.complete();
    else playing.progress.stop();
    playing.line.resolve({ status, adapterId: playedBy ?? playing.adapter.id });
    if (isResuming) play();
  };

  const stopPlaying = () => {
    const { playing } = state;
    if (playing === null) return;
    playing.controller.abort();
    finish(playing, 'cancelled', false);
  };

  function play() {
    if (state.playing !== null) return;
    const next = state.waiting.shift();
    if (next === undefined) {
      onActiveChange?.(false);
      return;
    }
    const adapter = pick(next.priority);
    const playing: Playing = {
      line: next,
      controller: new AbortController(),
      adapter,
      progress: createProgress(next),
    };
    state.playing = playing;
    onActiveChange?.(true);
    adapter
      .speak(next.text, {
        priority: next.priority,
        signal: playing.controller.signal,
        onStart: () => {
          next.onStart?.();
          playing.progress.start();
          onRouteChange?.();
        },
        onEnd: () => undefined,
        onProgress: next.onProgress ? playing.progress.fromAdapter : undefined,
        onRouteChange: () => onRouteChange?.(),
      })
      .then(
        (playedBy) => finish(playing, 'spoken', true, playedBy),
        () => finish(playing, 'failed', true),
      );
  }

  return {
    enqueue: (
      text: string,
      options: {
        priority: SpeechPriority;
        turnKey: number;
        onStart?: () => void;
        /** How far through the line the sound is (0 to 1); never goes back. */
        onProgress?: (fraction: number) => void;
      },
    ) =>
      new Promise<SpeakResult>((resolve) => {
        const { turnKey } = options;
        if (state.turnKey !== null && turnKey < state.turnKey) {
          resolve({ status: 'cancelled', adapterId: null });
          return;
        }
        if (state.turnKey === null || turnKey > state.turnKey) {
          state.turnKey = turnKey;
          cancelWaiting(() => false);
          stopPlaying();
        }
        const line: Line = { text, ...options, resolve };
        const firstReplyAt = state.waiting.findIndex(
          (entry) => entry.priority !== 'ack',
        );
        state.waiting =
          options.priority === 'ack' && firstReplyAt !== -1
            ? [
                ...state.waiting.slice(0, firstReplyAt),
                line,
                ...state.waiting.slice(firstReplyAt),
              ]
            : [...state.waiting, line];
        play();
      }),
    clear: () => {
      cancelWaiting(() => false);
      stopPlaying();
      setDucked(false);
      play();
    },
    /** Turns the playing line down without stopping it (cloud voice lines only; the device voices can't be turned down). */
    duck: () => setDucked(true),
    unduck: () => setDucked(false),
    /** The words of the line playing now; null when none is. */
    getPlayingText: () => state.playing?.line.text ?? null,
    /** How the line playing now is voiced: `cloud` unless a device voice speaks it (by choice or after a fallback); null when none plays. */
    getPlayingVoice: () => {
      const { playing } = state;
      if (playing === null) return null;
      const { adapter, line } = playing;
      return {
        priority: line.priority,
        route:
          adapter.route === 'cloud' && adapter.isFallingBack !== true
            ? ('cloud' as const)
            : ('device' as const),
      };
    },
    isActive: () => state.playing !== null || state.waiting.length > 0,
    /** True while the line playing goes through the page's audio, so the microphone's echo cancellation can tell it from the person. */
    isPlayingThroughWebAudio: () =>
      state.playing?.adapter.isPlayingThroughWebAudio ?? false,
  };
};
