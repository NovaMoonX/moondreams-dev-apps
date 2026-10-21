import {
  NATURAL_MAX_SLOW_READINGS,
  NATURAL_VOICE_CACHE_NAME,
  NATURAL_VOICE_CONFIG_URL,
  NATURAL_VOICE_MODEL_BYTES,
  NATURAL_VOICE_MODEL_URL,
} from '@/lib/speech/naturalVoice/config';
import type {
  FromVoiceWorker,
  ToVoiceWorker,
} from '@/lib/speech/naturalVoice/workerMessages';

export type NaturalVoiceStatus =
  'idle' | 'downloading' | 'loading' | 'ready' | 'failed';

/** Why the voice is not working: the download failed, there was no room to keep it, it would not start, or it was too slow on this device. */
export type NaturalVoiceProblem = 'download' | 'space' | 'load' | 'slow';

export interface NaturalVoiceState {
  status: NaturalVoiceStatus;
  /** 0 to 1 while downloading. */
  progress: number;
  /** Whether the voice is kept on this device; null until looked at. */
  isStored: boolean | null;
  problem: NaturalVoiceProblem | null;
}

const MIN_MODEL_BYTES = 1_000_000;
const LOAD_TIMEOUT_MS = 90_000;
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);
const MIN_MEMORY_GB = 4;

class CancelledError extends Error {}

interface Pending {
  resolve: (audio: { pcm: Float32Array; sampleRate: number }) => void;
  reject: (error: Error) => void;
}

const initial: NaturalVoiceState = {
  status: 'idle',
  progress: 0,
  isStored: null,
  problem: null,
};

const store = {
  state: initial,
  listeners: new Set<() => void>(),
  worker: null as Worker | null,
  pending: new Map<number, Pending>(),
  nextId: 1,
  running: null as Promise<void> | null,
  abort: null as AbortController | null,
  cancelLoad: null as (() => void) | null,
  slowReadings: 0,
};

const setState = (patch: Partial<NaturalVoiceState>) => {
  store.state = { ...store.state, ...patch };
  store.listeners.forEach((listener) => listener());
};

export const subscribeNaturalVoice = (listener: () => void) => {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
};

export const getNaturalVoiceState = () => store.state;

/** Whether this page can run the voice: a secure page with workers, WebAssembly SIMD, the cache and audio, and memory for it. */
export const isNaturalVoiceSupported = () => {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  if (
    typeof Worker === 'undefined' ||
    typeof caches === 'undefined' ||
    typeof AudioContext === 'undefined' ||
    typeof WebAssembly === 'undefined'
  ) {
    return false;
  }
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  if (memory !== undefined && memory < MIN_MEMORY_GB) return false;
  try {
    return WebAssembly.validate(SIMD_PROBE);
  } catch {
    return false;
  }
};

const failWorkRequests = (error: Error) => {
  const waiting = Array.from(store.pending.values());
  store.pending.clear();
  waiting.forEach((request) => request.reject(error));
};

const stopWorker = () => {
  store.cancelLoad?.();
  store.worker?.terminate();
  store.worker = null;
  failWorkRequests(new CancelledError('The voice was stopped'));
};

/** Looks for the voice files on this device. */
export const refreshNaturalVoiceStored = async () => {
  try {
    const cache = await caches.open(NATURAL_VOICE_CACHE_NAME);
    const [model, config] = await Promise.all([
      cache.match(NATURAL_VOICE_MODEL_URL),
      cache.match(NATURAL_VOICE_CONFIG_URL),
    ]);
    setState({ isStored: model !== undefined && config !== undefined });
  } catch {
    setState({ isStored: false });
  }
};

const readBody = async (
  body: ReadableStream<Uint8Array>,
  total: number,
  onProgress: (fraction: number) => void,
) => {
  const reader = body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const readNext = async (loaded: number): Promise<Blob> => {
    const { done, value } = await reader.read();
    if (done) return new Blob(chunks);
    chunks.push(value as Uint8Array<ArrayBuffer>);
    onProgress(Math.min(1, (loaded + value.length) / total));
    return readNext(loaded + value.length);
  };
  return readNext(0);
};

const downloadToCache = async (
  url: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
) => {
  const response = await fetch(url, { signal });
  if (!response.ok || response.body === null) {
    throw new Error(`The download answered ${response.status}`);
  }
  const length = Number(response.headers.get('Content-Length'));
  const blob = await readBody(
    response.body,
    length > 0 ? length : NATURAL_VOICE_MODEL_BYTES,
    onProgress,
  );
  if (blob.size === 0) throw new Error('The download was empty');
  const cache = await caches.open(NATURAL_VOICE_CACHE_NAME);
  await cache.put(
    url,
    new Response(blob, {
      headers: { 'Content-Type': 'application/octet-stream' },
    }),
  );
  return blob.size;
};

const download = async () => {
  const controller = new AbortController();
  store.abort = controller;
  setState({ status: 'downloading', progress: 0, problem: null });
  await downloadToCache(
    NATURAL_VOICE_CONFIG_URL,
    controller.signal,
    () => undefined,
  );
  const size = await downloadToCache(
    NATURAL_VOICE_MODEL_URL,
    controller.signal,
    (progress) => setState({ progress }),
  );
  if (size < MIN_MODEL_BYTES) throw new Error('The download was incomplete');
  setState({ isStored: true, progress: 1 });
};

const handleMessage = (message: FromVoiceWorker) => {
  if (message.type === 'audio') {
    const request = store.pending.get(message.id);
    store.pending.delete(message.id);
    request?.resolve({ pcm: message.pcm, sampleRate: message.sampleRate });
    return;
  }
  if (message.type === 'cancelled') {
    const request = store.pending.get(message.id);
    store.pending.delete(message.id);
    request?.reject(new CancelledError('The reading was cancelled'));
    return;
  }
  if (message.type === 'failed' && message.id !== null) {
    const request = store.pending.get(message.id);
    store.pending.delete(message.id);
    request?.reject(new Error(message.message));
  }
};

const loadWorker = () =>
  new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('./piperWorker.ts', import.meta.url), {
      type: 'module',
    });
    store.worker = worker;
    const timeoutId = window.setTimeout(
      () => reject(new Error('The voice took too long to start')),
      LOAD_TIMEOUT_MS,
    );
    store.cancelLoad = () => {
      window.clearTimeout(timeoutId);
      store.cancelLoad = null;
      reject(new DOMException('The voice was stopped', 'AbortError'));
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeoutId);
      reject(new Error(event.message || 'The voice could not start'));
    };
    worker.onmessage = (event: MessageEvent<FromVoiceWorker>) => {
      const message = event.data;
      if (message.type === 'ready') {
        window.clearTimeout(timeoutId);
        store.cancelLoad = null;
        resolve();
        return;
      }
      if (message.type === 'failed' && message.id === null) {
        window.clearTimeout(timeoutId);
        reject(new Error(message.message));
        return;
      }
      handleMessage(message);
    };
    const init: ToVoiceWorker = {
      type: 'init',
      modelUrl: NATURAL_VOICE_MODEL_URL,
      configUrl: NATURAL_VOICE_CONFIG_URL,
      cacheName: NATURAL_VOICE_CACHE_NAME,
    };
    worker.postMessage(init);
  });

const load = async () => {
  setState({ status: 'loading', problem: null });
  await loadWorker();
  store.slowReadings = 0;
  setState({ status: 'ready' });
};

const getProblem = (error: unknown): NaturalVoiceProblem => {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'space';
  }
  return store.state.status === 'downloading' ? 'download' : 'load';
};

const run = async (shouldDownload: boolean) => {
  if (store.running !== null) return store.running;
  const task = (async () => {
    try {
      if (store.state.status === 'ready') return;
      if (shouldDownload && store.state.isStored !== true) await download();
      await load();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('The natural voice could not start', error);
      stopWorker();
      setState({ status: 'failed', problem: getProblem(error) });
    } finally {
      store.abort = null;
      store.running = null;
    }
  })();
  store.running = task;
  return task;
};

/** Downloads the voice if it is not kept on this device, then starts it. Call from a tap: it is a large download. */
export const enableNaturalVoice = () => run(true);

/** Starts the voice from what is already kept on this device; never downloads. */
export const warmNaturalVoice = async () => {
  await refreshNaturalVoiceStored();
  if (store.state.isStored === true && store.state.status === 'idle') {
    await run(false);
  }
};

/** Frees the voice from memory; what was downloaded stays. */
export const unloadNaturalVoice = () => {
  store.abort?.abort();
  stopWorker();
  setState({ status: 'idle', progress: 0, problem: null });
};

/** Frees the voice and deletes what was downloaded. */
export const removeNaturalVoice = async () => {
  unloadNaturalVoice();
  try {
    const cache = await caches.open(NATURAL_VOICE_CACHE_NAME);
    await Promise.all([
      cache.delete(NATURAL_VOICE_MODEL_URL),
      cache.delete(NATURAL_VOICE_CONFIG_URL),
    ]);
  } catch (error) {
    console.error('The natural voice could not be removed', error);
  }
  setState({ isStored: false });
};

/** Speaks one piece of text. Rejects when the voice is not ready, fails, or `cancelNaturalSynthesis` cuts it short. */
export const synthesizeNaturalVoice = (text: string) =>
  new Promise<{ pcm: Float32Array; sampleRate: number }>((resolve, reject) => {
    const worker = store.worker;
    if (worker === null || store.state.status !== 'ready') {
      reject(new Error('The voice is not ready'));
      return;
    }
    const id = store.nextId;
    store.nextId += 1;
    store.pending.set(id, { resolve, reject });
    const message: ToVoiceWorker = { type: 'synth', id, text };
    worker.postMessage(message);
  });

export const cancelNaturalSynthesis = () => {
  if (store.pending.size === 0) return;
  const message: ToVoiceWorker = { type: 'cancel' };
  store.worker?.postMessage(message);
  failWorkRequests(new CancelledError('The reading was cancelled'));
};

export const isNaturalVoiceCancel = (error: unknown) =>
  error instanceof CancelledError;

/** A reading that gave no sound in time: after a few in a row the voice is set aside, so a slow phone gets the usual voice. */
export const recordSlowNaturalReading = () => {
  store.slowReadings += 1;
  if (store.slowReadings < NATURAL_MAX_SLOW_READINGS) return;
  stopWorker();
  setState({ status: 'failed', problem: 'slow' });
};

export const recordFastNaturalReading = () => {
  store.slowReadings = 0;
};
