import { hasRoomForOnDevice } from '@/lib/speech/onDevice/capability';
import {
  ON_DEVICE_CACHE_NAME,
  ON_DEVICE_FILES,
  ON_DEVICE_TOTAL_BYTES,
  type OnDeviceFile,
} from '@/lib/speech/onDevice/config';

/** Why the last download didn't keep the model: it stopped, there was no room, or a file wasn't the one expected. */
export type OnDeviceDownloadProblem = 'download' | 'space' | 'check';

export interface OnDeviceModelState {
  isDownloading: boolean;
  /** Bytes received so far in this download. */
  loadedBytes: number;
  /** Whether every file is kept on this device; null until looked at. */
  isStored: boolean | null;
  problem: OnDeviceDownloadProblem | null;
}

class FileCheckError extends Error {}

const store = {
  state: {
    isDownloading: false,
    loadedBytes: 0,
    isStored: null,
    problem: null,
  } as OnDeviceModelState,
  listeners: new Set<() => void>(),
  abort: null as AbortController | null,
};

const setState = (patch: Partial<OnDeviceModelState>) => {
  store.state = { ...store.state, ...patch };
  store.listeners.forEach((listener) => listener());
};

export const subscribeOnDeviceModel = (listener: () => void) => {
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
};

export const getOnDeviceModelState = () => store.state;

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

const readBody = async (
  body: ReadableStream<Uint8Array>,
  onBytes: (count: number) => void,
) => {
  const reader = body.getReader();
  const readNext = async (chunks: Uint8Array<ArrayBuffer>[]): Promise<Blob> => {
    const { done, value } = await reader.read();
    if (done) return new Blob(chunks);
    onBytes(value.length);
    return readNext([...chunks, value as Uint8Array<ArrayBuffer>]);
  };
  return readNext([]);
};

const fetchChecked = async (
  file: OnDeviceFile,
  signal: AbortSignal,
  onBytes: (count: number) => void,
) => {
  const response = await fetch(file.url, { signal, cache: 'no-cache' });
  if (!response.ok || response.body === null) {
    throw new Error(`The download answered ${response.status}`);
  }
  const blob = await readBody(response.body, onBytes);
  const digest = toHex(
    await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
  );
  if (blob.size !== file.bytes || digest !== file.sha256) {
    throw new FileCheckError(`${file.url} is not the expected file`);
  }
  return blob;
};

/** Looks for the model on this device; a download left half done (a closed tab) is cleared away. */
export const refreshOnDeviceStored = async () => {
  if (store.abort !== null) return;
  try {
    if (!(await caches.has(ON_DEVICE_CACHE_NAME))) {
      setState({ isStored: false });
      return;
    }
    const cache = await caches.open(ON_DEVICE_CACHE_NAME);
    const found = await Promise.all(
      ON_DEVICE_FILES.map((file) => cache.match(file.url)),
    );
    const isStored = found.every((response) => response !== undefined);
    if (!isStored) await caches.delete(ON_DEVICE_CACHE_NAME);
    setState({ isStored });
  } catch {
    setState({ isStored: false });
  }
};

const getProblem = (error: unknown): OnDeviceDownloadProblem => {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'space';
  }
  return error instanceof FileCheckError ? 'check' : 'download';
};

/** Downloads every file from this site, checks each against its hash and keeps it on the device. A cancel or a failure keeps nothing. Call from a tap: it is a large download. */
export const downloadOnDeviceModel = async () => {
  if (store.abort !== null) return;
  const controller = new AbortController();
  store.abort = controller;
  setState({ isDownloading: true, loadedBytes: 0, problem: null });
  try {
    if (!(await hasRoomForOnDevice())) {
      throw new DOMException('No room for the model', 'QuotaExceededError');
    }
    const cache = await caches.open(ON_DEVICE_CACHE_NAME);
    await ON_DEVICE_FILES.reduce(async (previous, file) => {
      await previous;
      const blob = await fetchChecked(file, controller.signal, (count) =>
        setState({
          loadedBytes: Math.min(
            ON_DEVICE_TOTAL_BYTES,
            store.state.loadedBytes + count,
          ),
        }),
      );
      if (controller.signal.aborted) throw new DOMException('', 'AbortError');
      await cache.put(
        file.url,
        new Response(blob, {
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      );
    }, Promise.resolve());
    setState({
      isDownloading: false,
      isStored: true,
      loadedBytes: ON_DEVICE_TOTAL_BYTES,
    });
  } catch (error) {
    await caches.delete(ON_DEVICE_CACHE_NAME).catch(() => false);
    const isCancel =
      error instanceof DOMException && error.name === 'AbortError';
    if (!isCancel) console.error('The on-device model was not kept', error);
    setState({
      isDownloading: false,
      isStored: false,
      loadedBytes: 0,
      problem: isCancel ? null : getProblem(error),
    });
  } finally {
    store.abort = null;
  }
};

/** Stops a download in progress; nothing of it is kept. */
export const cancelOnDeviceDownload = () => store.abort?.abort();

/** Deletes the kept model from this device. */
export const removeOnDeviceModel = async () => {
  store.abort?.abort();
  await caches.delete(ON_DEVICE_CACHE_NAME);
  setState({ isStored: false, problem: null, loadedBytes: 0 });
};
