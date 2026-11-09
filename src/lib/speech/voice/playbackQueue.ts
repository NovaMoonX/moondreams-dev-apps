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
  resolve: (result: SpeakResult) => void;
}

interface Playing {
  line: Line;
  controller: AbortController;
  adapter: TtsAdapter;
}

/** One line plays at a time. Within a turn an `ack` goes before a `reply` or `summary` that is waiting, and never cuts one off; a line of a newer turn cancels the older turn's playing and waiting lines; `clear` stops everything. */
export const createPlaybackQueue = ({
  pick,
  onActiveChange,
}: {
  pick: (priority: SpeechPriority) => TtsAdapter;
  onActiveChange?: (isActive: boolean) => void;
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
  ) => {
    if (state.playing !== playing) return;
    state.playing = null;
    playing.line.resolve({ status, adapterId: playing.adapter.id });
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
    };
    state.playing = playing;
    onActiveChange?.(true);
    adapter
      .speak(next.text, {
        priority: next.priority,
        signal: playing.controller.signal,
        onStart: () => next.onStart?.(),
        onEnd: () => undefined,
      })
      .then(
        () => finish(playing, 'spoken', true),
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
      play();
    },
    isActive: () => state.playing !== null || state.waiting.length > 0,
  };
};
