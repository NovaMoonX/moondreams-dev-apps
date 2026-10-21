/// <reference lib="webworker" />
import createPiperPhonemize from '@diffusionstudio/piper-wasm/build/piper_phonemize.js';
import * as ort from 'onnxruntime-web/wasm';

import type {
  FromVoiceWorker,
  ToVoiceWorker,
} from '@/lib/speech/naturalVoice/workerMessages';

const ORT_WASM_URL = new URL(
  '../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm',
  import.meta.url,
).href;
const PHONEMIZE_WASM_URL = new URL(
  '../../../../node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm',
  import.meta.url,
).href;
const PHONEMIZE_DATA_URL = new URL(
  '../../../../node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data',
  import.meta.url,
).href;
const PHONEMIZE_TIMEOUT_MS = 15_000;

interface VoiceConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  speaker_id_map: Record<string, number>;
}

interface LoadedVoice {
  session: ort.InferenceSession;
  config: VoiceConfig;
}

const loaded: { voice: LoadedVoice | null; generation: number } = {
  voice: null,
  generation: 0,
};
const queue: { tail: Promise<void> } = { tail: Promise.resolve() };

const send = (message: FromVoiceWorker, transfer: Transferable[] = []) =>
  self.postMessage(message, transfer);

const readCached = async (cacheName: string, url: string) => {
  const cache = await caches.open(cacheName);
  const response = await cache.match(url);
  if (response === undefined) throw new Error('The voice is not downloaded');
  return response;
};

const init = async ({
  modelUrl,
  configUrl,
  cacheName,
}: Extract<ToVoiceWorker, { type: 'init' }>) => {
  // One thread, because threads need cross-origin isolation the site does not set.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { 'ort-wasm-simd.wasm': ORT_WASM_URL };
  const config = JSON.parse(
    await (await readCached(cacheName, configUrl)).text(),
  ) as VoiceConfig;
  const model = await (await readCached(cacheName, modelUrl)).arrayBuffer();
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
  });
  loaded.voice = { session, config };
  send({ type: 'ready', sampleRate: config.audio.sample_rate });
};

/** Turns text into the phoneme ids the voice reads; a fresh engine per call, the way the engine's own build is meant to be run. */
const toPhonemeIds = (text: string, voice: string) =>
  new Promise<number[]>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error('The text could not be prepared')),
      PHONEMIZE_TIMEOUT_MS,
    );
    createPiperPhonemize({
      print: (line) => {
        try {
          const ids = (JSON.parse(line) as { phoneme_ids?: number[] })
            .phoneme_ids;
          if (!Array.isArray(ids)) return;
          clearTimeout(timeoutId);
          resolve(ids);
        } catch {
          // Other lines the engine prints are not the ids.
        }
      },
      printErr: () => undefined,
      locateFile: (file) => {
        if (file.endsWith('.wasm')) return PHONEMIZE_WASM_URL;
        if (file.endsWith('.data')) return PHONEMIZE_DATA_URL;
        return file;
      },
    })
      .then((module) =>
        module.callMain([
          '-l',
          voice,
          '--input',
          JSON.stringify([{ text: text.trim() }]),
          '--espeak_data',
          '/espeak-ng-data',
        ]),
      )
      .catch(reject);
  });

const synthesize = async (id: number, text: string, generation: number) => {
  const voice = loaded.voice;
  if (voice === null) throw new Error('The voice is not loaded');
  if (generation !== loaded.generation) {
    send({ type: 'cancelled', id });
    return;
  }
  const { session, config } = voice;
  const ids = await toPhonemeIds(text, config.espeak.voice);
  if (generation !== loaded.generation) {
    send({ type: 'cancelled', id });
    return;
  }
  const hasSpeakers = Object.keys(config.speaker_id_map).length > 0;
  const feeds = {
    input: new ort.Tensor('int64', ids, [1, ids.length]),
    input_lengths: new ort.Tensor('int64', [ids.length]),
    scales: new ort.Tensor('float32', [
      config.inference.noise_scale,
      config.inference.length_scale,
      config.inference.noise_w,
    ]),
    ...(hasSpeakers ? { sid: new ort.Tensor('int64', [0]) } : {}),
  };
  const result = await session.run(feeds);
  const pcm = (result.output.data as Float32Array).slice();
  send({ type: 'audio', id, pcm, sampleRate: config.audio.sample_rate }, [
    pcm.buffer,
  ]);
};

const getMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The voice stopped working';

self.onmessage = (event: MessageEvent<ToVoiceWorker>) => {
  const message = event.data;
  if (message.type === 'cancel') {
    loaded.generation += 1;
    return;
  }
  if (message.type === 'init') {
    init(message).catch((error: unknown) =>
      send({ type: 'failed', id: null, message: getMessage(error) }),
    );
    return;
  }
  const generation = loaded.generation;
  queue.tail = queue.tail
    .then(() => synthesize(message.id, message.text, generation))
    .catch((error: unknown) =>
      send({ type: 'failed', id: message.id, message: getMessage(error) }),
    );
};
