import {
  ON_DEVICE_BINARY,
  ON_DEVICE_CACHE_NAME,
  ON_DEVICE_MODELS,
  ON_DEVICE_RUNTIME,
} from '@/lib/speech/onDevice/config';
import type {
  FromRecognizerWorker,
  ToRecognizerWorker,
} from '@/lib/speech/onDevice/workerMessages';

export type RecognizerStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface RecognitionHandlers {
  onPartial: (text: string) => void;
  onSegment: (text: string) => void;
  onFinished: (text: string) => void;
  onFailed: () => void;
}

/** One stretch of listening on the loaded model: 16 kHz 16-bit frames in, words out. */
export interface Recognition {
  push: (frame: ArrayBuffer) => void;
  /** Ends the audio; `onFinished` gets the last words. */
  finish: () => void;
  /** Drops it with nothing more delivered. */
  close: () => void;
}

const LOAD_TIMEOUT_MS = 60_000;

const store = {
  status: 'idle' as RecognizerStatus,
  listeners: new Set<() => void>(),
  worker: null as Worker | null,
  loading: null as Promise<void> | null,
  handlers: new Map<number, RecognitionHandlers>(),
  nextId: 1,
};

const setStatus = (status: RecognizerStatus) => {
  store.status = status;
  store.listeners.forEach((listener) => listener());
};

export const subscribeRecognizer = (listener: () => void) => {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
};

export const getRecognizerStatus = () => store.status;

const failAll = () => {
  const waiting = Array.from(store.handlers.values());
  store.handlers.clear();
  waiting.forEach((handlers) => handlers.onFailed());
};

const handleMessage = (message: FromRecognizerWorker) => {
  if (message.type === 'ready') return;
  if (message.type === 'failed') {
    if (message.id === null) return;
    const handlers = store.handlers.get(message.id);
    store.handlers.delete(message.id);
    handlers?.onFailed();
    return;
  }
  const handlers = store.handlers.get(message.id);
  if (handlers === undefined) return;
  if (message.type === 'partial') handlers.onPartial(message.text);
  else if (message.type === 'segment') handlers.onSegment(message.text);
  else {
    store.handlers.delete(message.id);
    handlers.onFinished(message.text);
  }
};

/** Frees the model from memory; the download stays. */
export const unloadRecognizer = () => {
  store.worker?.terminate();
  store.worker = null;
  store.loading = null;
  failAll();
  setStatus('idle');
};

/** Starts the model from what is kept on this device; resolves once it can listen. */
export const loadRecognizer = () => {
  if (store.status === 'ready') return Promise.resolve();
  if (store.loading !== null) return store.loading;
  const loading = new Promise<void>((resolve, reject) => {
    const worker = new Worker(
      new URL('./recognizerWorker.ts', import.meta.url),
      {
        type: 'module',
      },
    );
    store.worker = worker;
    setStatus('loading');
    const fail = (error: Error) => {
      window.clearTimeout(timeoutId);
      if (store.worker === worker) {
        worker.terminate();
        store.worker = null;
        store.loading = null;
        setStatus('failed');
      }
      reject(error);
    };
    const timeoutId = window.setTimeout(
      () => fail(new Error('The model took too long to start')),
      LOAD_TIMEOUT_MS,
    );
    worker.onerror = (event) =>
      fail(new Error(event.message || 'The model could not start'));
    worker.onmessage = (event: MessageEvent<FromRecognizerWorker>) => {
      const message = event.data;
      if (message.type === 'ready') {
        window.clearTimeout(timeoutId);
        store.loading = null;
        setStatus('ready');
        resolve();
        return;
      }
      if (message.type === 'failed' && message.id === null) {
        fail(new Error(message.message));
        return;
      }
      handleMessage(message);
    };
    const init: ToRecognizerWorker = {
      type: 'init',
      cacheName: ON_DEVICE_CACHE_NAME,
      runtimeUrl: ON_DEVICE_RUNTIME.url,
      binaryUrl: ON_DEVICE_BINARY.url,
      models: ON_DEVICE_MODELS.map(({ url, name }) => ({ url, name })),
    };
    worker.postMessage(init);
  });
  store.loading = loading;
  return loading;
};

/** Opens a stretch of listening on the loaded model; null when it isn't loaded. */
export const openRecognition = (
  handlers: RecognitionHandlers,
): Recognition | null => {
  const worker = store.worker;
  if (worker === null || store.status !== 'ready') return null;
  const id = store.nextId;
  store.nextId += 1;
  store.handlers.set(id, handlers);
  const post = (message: ToRecognizerWorker) => worker.postMessage(message);
  post({ type: 'open', id });
  return {
    push: (frame) => {
      if (!store.handlers.has(id)) return;
      post({ type: 'audio', id, pcm: frame });
    },
    finish: () => post({ type: 'finish', id }),
    close: () => {
      store.handlers.delete(id);
      post({ type: 'close', id });
    },
  };
};
