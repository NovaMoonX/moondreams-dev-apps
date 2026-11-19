import { clearFallback, reportFallback } from '@/lib/fallbacks/fallbacks';
import { ON_DEVICE_FALLBACK_KEYS } from '@/lib/speech/onDevice/config';
import {
  getRecognizerStatus,
  loadRecognizer,
  openRecognition,
} from '@/lib/speech/onDevice/recognizer';
import {
  describeThrown,
  readSpeechEvents,
  recordSpeechEvent,
} from '@/lib/speech/speechDiagnostics';
import { startPcmCapture } from '@/lib/speech/voice/pcmWorklet';
import type {
  FrameSource,
  SttAdapter,
  SttErrorCode,
} from '@/lib/speech/voice/types';

/** The model hears in capitals with no punctuation; this reads it as a sentence. */
export const toHeardText = (parts: string[]) => {
  const text = parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\bi\b/g, 'I')
    .replace(/\bi'(m|ll|d|ve)\b/g, "I'$1");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const FALLBACK_KEY = ON_DEVICE_FALLBACK_KEYS.listen;
// 20 ms frames: what a listen holds while the model loads, and what the wake listener keeps for the turn it hands over.
const HELD_FRAMES = 750;
// The model ends a phrase after 0.8 s of quiet, so a shorter tail never repeats the phrase's own last word.
const HANDOVER_FRAMES = 30;

// A model that failed to load is already reported under its own key, so the listen it ended isn't reported twice.
const reportListenFailed = (stage: string, raw: string) => {
  if (getRecognizerStatus() === 'failed') return;
  const events = readSpeechEvents();
  reportFallback({
    key: FALLBACK_KEY,
    feature: 'Listening',
    wanted: 'the on-device speech model',
    used: 'nothing for this listen, which ended',
    reason: "it couldn't listen",
    cause: { stage, detail: raw },
    trace: events.length > 0 ? events.join('\n') : null,
  });
};

const toErrorCode = (error: unknown): SttErrorCode => {
  recordSpeechEvent(`On-device listening failed: ${describeThrown(error)}`);
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'denied';
    }
    if (error.name === 'NotFoundError') return 'no-microphone';
  }
  reportListenFailed('listen', describeThrown(error));
  return 'unavailable';
};

/**
 * Echo cancellation keeps a line the page plays from being heard as the person, but on Android it also puts the phone
 * in call mode, which pauses or muffles music, so the wake listener (which runs while nothing plays, and hands this
 * microphone to its turn) opens without it.
 */
const openMicrophone = async ({
  isEchoCancelled,
}: {
  isEchoCancelled: boolean;
}): Promise<FrameSource> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: isEchoCancelled,
      noiseSuppression: true,
      channelCount: 1,
    },
  });
  const state = {
    subscriber: null as ((frame: ArrayBuffer) => void) | null,
    capture: null as { stop: () => void } | null,
    isStopped: false,
  };
  const stopTracks = () => stream.getTracks().forEach((track) => track.stop());
  try {
    state.capture = await startPcmCapture({
      stream,
      onFrame: (frame) => state.subscriber?.(frame),
    });
  } catch (error) {
    stopTracks();
    throw error;
  }
  return {
    preRoll: [],
    subscribe: (onFrame) => {
      state.subscriber = onFrame;
    },
    stop: () => {
      if (state.isStopped) return;
      state.isStopped = true;
      state.subscriber = null;
      state.capture?.stop();
      stopTracks();
    },
  };
};

/**
 * Listens with the downloaded recognition model, in a worker on this device: no sound leaves it. Given a `source` (a
 * speech gate that heard the person start) it hears that microphone's pre-roll and live frames and releases it when
 * done; otherwise it opens the microphone itself. `stop` delivers everything heard, once.
 */
export const createOnDeviceStt = ({
  source = null,
}: { source?: FrameSource | null } = {}): SttAdapter => {
  const run = {
    stop: null as (() => void) | null,
    cancel: null as (() => void) | null,
    drop: null as (() => void) | null,
  };
  return {
    id: 'on-device',
    route: 'device',
    canStream: true,
    start: async (options) => {
      run.drop?.();
      const state = {
        isDone: false,
        segments: [] as string[],
        partial: '',
        isHeard: false,
        microphone: null as FrameSource | null,
        held: [] as ArrayBuffer[],
        isFinishing: false,
      };
      const read = () => toHeardText([...state.segments, state.partial]);
      const hear = () => {
        if (read() === '') return;
        if (!state.isHeard) options.onSpeechStart();
        state.isHeard = true;
        options.onPartial(read());
      };
      const release = () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        state.microphone?.stop();
        source?.stop();
        run.stop = null;
        run.cancel = null;
        run.drop = null;
      };
      const deliver = (text: string) => {
        if (state.isDone) return;
        state.isDone = true;
        release();
        options.onFinal(text);
      };
      const recognition = {
        current: null as ReturnType<typeof openRecognition>,
      };
      const stop = () => {
        if (state.isDone) return;
        if (recognition.current === null && state.held.length === 0) {
          deliver(read());
          return;
        }
        state.microphone?.stop();
        source?.stop();
        if (recognition.current === null) state.isFinishing = true;
        else recognition.current.finish();
      };
      const cancel = () => {
        recognition.current?.close();
        deliver('');
      };
      const drop = () => {
        recognition.current?.close();
        state.isDone = true;
        release();
      };
      function handleVisibility() {
        if (document.visibilityState === 'hidden') stop();
      }
      run.stop = stop;
      run.cancel = cancel;
      run.drop = drop;
      document.addEventListener('visibilitychange', handleVisibility);
      try {
        const microphone =
          source ?? (await openMicrophone({ isEchoCancelled: true }));
        if (source === null) state.microphone = microphone;
        if (state.isDone) {
          microphone.stop();
          return;
        }
        const hold = (frame: ArrayBuffer) => {
          if (recognition.current) recognition.current.push(frame);
          else state.held = [...state.held, frame].slice(-HELD_FRAMES);
        };
        microphone.preRoll.forEach(hold);
        microphone.subscribe(hold);
        options.onListening?.();
        await loadRecognizer();
        if (state.isDone) return;
        recognition.current = openRecognition({
          onPartial: (text) => {
            state.partial = text;
            hear();
          },
          onSegment: (text) => {
            state.segments = [...state.segments, text];
            state.partial = '';
            hear();
          },
          onFinished: (text) => {
            state.segments = [...state.segments, text];
            state.partial = '';
            deliver(read());
          },
          onFailed: (detail) => {
            if (state.isDone) return;
            release();
            state.isDone = true;
            reportListenFailed('recognizer', detail);
            options.onError('unavailable');
          },
        });
        if (recognition.current === null) throw new Error('Not loaded');
        state.held.forEach((frame) => recognition.current?.push(frame));
        state.held = [];
        if (state.isFinishing) recognition.current.finish();
        clearFallback(FALLBACK_KEY);
      } catch (error) {
        if (state.isDone) return;
        state.isDone = true;
        release();
        options.onError(toErrorCode(error));
      }
    },
    stop: () => run.stop?.(),
    cancel: () => run.cancel?.(),
  };
};

/**
 * Listens for wake phrases with the downloaded model, on this device only: each finished phrase (a pause ends one) goes to
 * `onPhrase`. `close` releases the model and microphone; `handOver` releases only the model and returns the open
 * microphone, which has no echo cancellation.
 */
export const listenOnDevice = ({
  onPhrase,
  onUnavailable,
}: {
  onPhrase: (text: string) => void;
  onUnavailable: (code: SttErrorCode) => void;
}) => {
  const state = {
    isClosed: false,
    microphone: null as FrameSource | null,
    recognition: null as ReturnType<typeof openRecognition>,
    recent: [] as ArrayBuffer[],
  };
  const close = () => {
    state.isClosed = true;
    state.recognition?.close();
    state.recognition = null;
    state.microphone?.stop();
    state.microphone = null;
  };
  const handOver = (): FrameSource | null => {
    const { microphone } = state;
    if (microphone === null) return null;
    state.isClosed = true;
    state.recognition?.close();
    state.recognition = null;
    state.microphone = null;
    const buffered = [...state.recent];
    microphone.subscribe((frame) => buffered.push(frame));
    return { ...microphone, preRoll: buffered };
  };
  loadRecognizer()
    .then(() =>
      state.isClosed ? null : openMicrophone({ isEchoCancelled: false }),
    )
    .then((microphone) => {
      if (microphone === null) return;
      if (state.isClosed) {
        microphone.stop();
        return;
      }
      state.microphone = microphone;
      state.recognition = openRecognition({
        onPartial: () => undefined,
        onSegment: (text) => onPhrase(toHeardText([text])),
        onFinished: () => undefined,
        onFailed: (detail) => {
          if (state.isClosed) return;
          close();
          reportListenFailed('recognizer', detail);
          onUnavailable('unavailable');
        },
      });
      clearFallback(FALLBACK_KEY);
      microphone.subscribe((frame) => {
        state.recent = [...state.recent, frame].slice(-HANDOVER_FRAMES);
        state.recognition?.push(frame);
      });
    })
    .catch((error: unknown) => {
      if (state.isClosed) return;
      close();
      onUnavailable(toErrorCode(error));
    });
  return { close, handOver };
};
