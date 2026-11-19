import {
  describeThrown,
  recordSpeechEvent,
} from '@/lib/speech/speechDiagnostics';

const STORAGE_KEY = 'speech.noiseCleaning';

export const NOISE_SAMPLE_RATE = 48_000;

/** Whether the microphone is cleaned of music and chatter on this device before anything listens. On unless the person turned it off. */
export const isNoiseCleaningOn = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setNoiseCleaningOn = (isOn: boolean) => {
  try {
    if (isOn) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, 'off');
  } catch {
    // Storage is blocked; the choice lasts until the page closes.
  }
};

const loaded: {
  request: ReturnType<typeof fetchCleaner> | null;
} = { request: null };

const fetchCleaner = async () => {
  const [library, wasmUrl, simdUrl, workletUrl] = await Promise.all([
    import('@sapphi-red/web-noise-suppressor'),
    import('@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'),
    import('@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'),
    import('@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'),
  ]);
  const wasmBinary = await library.loadRnnoise({
    url: wasmUrl.default,
    simdUrl: simdUrl.default,
  });
  return { library, wasmBinary, workletUrl: workletUrl.default };
};

const loadCleaner = () => {
  const request = loaded.request ?? fetchCleaner();
  loaded.request = request;
  return request.catch((error: unknown) => {
    loaded.request = null;
    throw error;
  });
};

/** Fetches and compiles the cleaner from the site's own origin ahead of a listen, once, so that listen finds it ready. A failure is recorded, never thrown. */
export const preloadNoiseCleaning = () => {
  if (!isNoiseCleaningOn()) return;
  loadCleaner().catch((error: unknown) =>
    recordSpeechEvent(
      `Noise cleaning preload failed: ${describeThrown(error)}`,
    ),
  );
};

/** Adds the RNNoise worklet to a 48 kHz context and returns a node that cleans one mono channel. */
export const createNoiseNode = async (context: AudioContext) => {
  const { library, wasmBinary, workletUrl } = await loadCleaner();
  await context.audioWorklet.addModule(workletUrl);
  return new library.RnnoiseWorkletNode(context, {
    maxChannels: 1,
    wasmBinary: wasmBinary.slice(0),
  });
};
