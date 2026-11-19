import {
  clearFallback,
  removeFallback,
  reportFallback,
} from '@/lib/fallbacks/fallbacks';
import {
  describeThrown,
  recordSpeechEvent,
} from '@/lib/speech/speechDiagnostics';

const STORAGE_KEY = 'speech.noiseCleaning';

export const NOISE_SAMPLE_RATE = 48_000;

export const NOISE_CLEANING_FALLBACK_KEY = 'speech-noise-cleaning';

/** Whether the microphone is cleaned of music and chatter on this device before anything listens. On unless the person turned it off. */
export const isNoiseCleaningOn = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setNoiseCleaningOn = (isOn: boolean) => {
  if (!isOn) removeFallback(NOISE_CLEANING_FALLBACK_KEY);
  try {
    if (isOn) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, 'off');
  } catch {
    // Storage is blocked; the choice lasts until the page closes.
  }
};

const cleaner: {
  request: ReturnType<typeof fetchCleaner> | null;
  isReady: boolean;
  hasFailed: boolean;
} = { request: null, isReady: false, hasFailed: false };

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
  cleaner.isReady = true;
  return { library, wasmBinary, workletUrl: workletUrl.default };
};

const loadCleaner = () => {
  const request = cleaner.request ?? fetchCleaner();
  cleaner.request = request;
  return request.catch((error: unknown) => {
    cleaner.request = null;
    throw error;
  });
};

const reportSkipped = (reason: string, stage: string, detail: string) =>
  reportFallback({
    key: NOISE_CLEANING_FALLBACK_KEY,
    feature: 'Listening',
    wanted: 'the microphone cleaned of background noise',
    used: 'the raw microphone',
    reason,
    cause: { stage, detail },
  });

/** Whether the cleaner is loaded and can be used by the next capture, without waiting for anything. */
export const isNoiseCleanerReady = () => cleaner.isReady && !cleaner.hasFailed;

/** True once the cleaner failed for a real reason (not only slowness); it stays off until the page reloads. */
export const hasNoiseCleaningFailed = () => cleaner.hasFailed;

/** A cleaner that was still loading when a listen opened: that listen used the raw microphone. */
export const reportNoiseCleaningLoading = () =>
  reportSkipped(
    "it wasn't loaded yet",
    'loading',
    'The cleaner was still loading when this listen opened',
  );

export const reportNoiseCleaningApplied = () =>
  clearFallback(NOISE_CLEANING_FALLBACK_KEY);

/** Turns the cleaner off for the rest of the page's life after it failed inside a capture, which a retry would not fix. */
export const failNoiseCleaning = (error: unknown) => {
  cleaner.hasFailed = true;
  recordSpeechEvent(
    `Noise cleaning failed, listening without it until the page reloads: ${describeThrown(error)}`,
  );
  reportSkipped("it couldn't load", 'load', describeThrown(error));
};

/** Fetches and compiles the cleaner from the site's own origin ahead of a listen, once; a listen that opens before it is ready is captured raw, and the next one gets it. */
export const preloadNoiseCleaning = () => {
  if (!isNoiseCleaningOn() || cleaner.hasFailed) return;
  loadCleaner().then(reportNoiseCleaningApplied, (error: unknown) => {
    recordSpeechEvent(
      `Noise cleaning preload failed: ${describeThrown(error)}`,
    );
    reportSkipped("it couldn't load", 'preload', describeThrown(error));
  });
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
