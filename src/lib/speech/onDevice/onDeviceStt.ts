import {
  loadRecognizer,
  openRecognition,
} from '@/lib/speech/onDevice/recognizer';
import {
  describeThrown,
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

const toErrorCode = (error: unknown): SttErrorCode => {
  recordSpeechEvent(`On-device listening failed: ${describeThrown(error)}`);
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return 'denied';
    }
    if (error.name === 'NotFoundError') return 'no-microphone';
  }
  return 'unavailable';
};

/** Opens the microphone (echo cancellation on, so a line the page plays is not heard as the person) as a frame source. */
const openMicrophone = async (): Promise<FrameSource> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
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
        if (recognition.current === null) {
          deliver(read());
          return;
        }
        state.microphone?.stop();
        source?.stop();
        recognition.current.finish();
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
        // The model loads before the microphone opens, so a failed load never leaves a microphone running.
        await loadRecognizer();
        if (state.isDone) return;
        const microphone = source ?? (await openMicrophone());
        if (source === null) state.microphone = microphone;
        if (state.isDone) {
          microphone.stop();
          return;
        }
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
          onFailed: () => {
            if (state.isDone) return;
            release();
            state.isDone = true;
            options.onError('unavailable');
          },
        });
        if (recognition.current === null) throw new Error('Not loaded');
        microphone.preRoll.forEach((frame) => recognition.current?.push(frame));
        microphone.subscribe((frame) => recognition.current?.push(frame));
        options.onListening?.();
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
 * Listens continuously with the downloaded model, on this device only, and hands over each finished phrase (a pause
 * ends one). For waiting on a wake phrase: nothing is sent anywhere. `onUnavailable` runs when the microphone or the
 * model can't start; `close` releases both.
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
  };
  const close = () => {
    state.isClosed = true;
    state.recognition?.close();
    state.recognition = null;
    state.microphone?.stop();
    state.microphone = null;
  };
  loadRecognizer()
    .then(() => (state.isClosed ? null : openMicrophone()))
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
        onFailed: () => {
          if (state.isClosed) return;
          close();
          onUnavailable('unavailable');
        },
      });
      microphone.subscribe((frame) => state.recognition?.push(frame));
    })
    .catch((error: unknown) => {
      if (state.isClosed) return;
      close();
      onUnavailable(toErrorCode(error));
    });
  return { close };
};
