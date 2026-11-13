/// <reference lib="webworker" />
import type {
  FromRecognizerWorker,
  ToRecognizerWorker,
} from '@/lib/speech/onDevice/workerMessages';

interface RecognizerStream {
  acceptWaveform: (sampleRate: number, samples: Float32Array) => void;
  inputFinished: () => void;
  free: () => void;
}

interface Recognizer {
  handle: number;
  createStream: () => RecognizerStream;
  isReady: (stream: RecognizerStream) => boolean;
  decode: (stream: RecognizerStream) => void;
  isEndpoint: (stream: RecognizerStream) => boolean;
  reset: (stream: RecognizerStream) => void;
  getResult: (stream: RecognizerStream) => { text: string };
  free: () => void;
}

interface RuntimeModule {
  FS: {
    mkdir: (path: string) => void;
    writeFile: (path: string, data: Uint8Array) => void;
    unlink: (path: string) => void;
  };
}

interface RuntimeExports {
  createAsrModule: (options: {
    wasmBinary: ArrayBuffer;
    print: (line: string) => void;
    printErr: (line: string) => void;
  }) => Promise<RuntimeModule>;
  createOnlineRecognizer: (
    module: RuntimeModule,
    config: Record<string, unknown>,
  ) => Recognizer;
}

const SAMPLE_RATE = 16_000;
const MODEL_DIR = '/model';
// A streaming model holds back its last frames until it hears what follows them, and drops words that open the very
// first frames, so half a second of silence goes in before the start and after the end.
const PAD_SAMPLES = SAMPLE_RATE / 2;

const loaded = {
  recognizer: null as Recognizer | null,
  streams: new Map<number, { stream: RecognizerStream; last: string }>(),
};

const send = (message: FromRecognizerWorker) => self.postMessage(message);

const readCached = async (cacheName: string, url: string) => {
  const cache = await caches.open(cacheName);
  const response = await cache.match(url);
  if (response === undefined) throw new Error('The model is not downloaded');
  return response;
};

const toFloat = (pcm: ArrayBuffer) =>
  Float32Array.from(new Int16Array(pcm), (sample) => sample / 32768);

const buildConfig = (names: Record<string, string>) => ({
  featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
  modelConfig: {
    transducer: {
      encoder: names.encoder,
      decoder: names.decoder,
      joiner: names.joiner,
    },
    paraformer: { encoder: '', decoder: '' },
    zipformer2Ctc: { model: '' },
    nemoCtc: { model: '' },
    toneCtc: { model: '' },
    tokens: names.tokens,
    numThreads: 1,
    provider: 'cpu',
    debug: 0,
    modelType: '',
    modelingUnit: '',
    bpeVocab: '',
  },
  decodingMethod: 'greedy_search',
  maxActivePaths: 4,
  enableEndpoint: 1,
  rule1MinTrailingSilence: 2.4,
  rule2MinTrailingSilence: 0.8,
  rule3MinUtteranceLength: 20,
  hotwordsFile: '',
  hotwordsScore: 1.5,
  ctcFstDecoderConfig: { graph: '', maxActive: 3000 },
  ruleFsts: '',
  ruleFars: '',
});

const init = async ({
  cacheName,
  runtimeUrl,
  binaryUrl,
  models,
}: Extract<ToRecognizerWorker, { type: 'init' }>) => {
  const source = await (await readCached(cacheName, runtimeUrl)).blob();
  const sourceUrl = URL.createObjectURL(
    new Blob([source], { type: 'text/javascript' }),
  );
  const runtime = (await import(
    /* @vite-ignore */ sourceUrl
  )) as RuntimeExports;
  URL.revokeObjectURL(sourceUrl);
  const wasmBinary = await (
    await readCached(cacheName, binaryUrl)
  ).arrayBuffer();
  const module = await runtime.createAsrModule({
    wasmBinary,
    print: () => undefined,
    printErr: (line) => console.warn(line),
  });
  module.FS.mkdir(MODEL_DIR);
  const files = await Promise.all(
    models.map(async (file) => ({
      path: `${MODEL_DIR}/${file.name}`,
      data: new Uint8Array(
        await (await readCached(cacheName, file.url)).arrayBuffer(),
      ),
    })),
  );
  files.forEach((file) => module.FS.writeFile(file.path, file.data));
  const names = Object.fromEntries(
    models.map((file) => [
      file.name.split('.')[0],
      `${MODEL_DIR}/${file.name}`,
    ]),
  );
  const recognizer = runtime.createOnlineRecognizer(module, buildConfig(names));
  // Safe once created: the recognizer keeps its own copy of every model file.
  files.forEach((file) => module.FS.unlink(file.path));
  if (!recognizer.handle) throw new Error('The model could not be loaded');
  loaded.recognizer = recognizer;
  send({ type: 'ready' });
};

const decodeAll = (recognizer: Recognizer, stream: RecognizerStream) => {
  while (recognizer.isReady(stream)) recognizer.decode(stream);
};

const hear = (id: number, pcm: ArrayBuffer) => {
  const recognizer = loaded.recognizer;
  const entry = loaded.streams.get(id);
  if (recognizer === null || entry === undefined) return;
  entry.stream.acceptWaveform(SAMPLE_RATE, toFloat(pcm));
  decodeAll(recognizer, entry.stream);
  const text = recognizer.getResult(entry.stream).text.trim();
  if (recognizer.isEndpoint(entry.stream)) {
    if (text !== '') send({ type: 'segment', id, text });
    recognizer.reset(entry.stream);
    entry.last = '';
    return;
  }
  if (text === entry.last) return;
  entry.last = text;
  send({ type: 'partial', id, text });
};

const finish = (id: number) => {
  const recognizer = loaded.recognizer;
  const entry = loaded.streams.get(id);
  loaded.streams.delete(id);
  if (recognizer === null || entry === undefined) {
    send({ type: 'finished', id, text: '' });
    return;
  }
  entry.stream.acceptWaveform(SAMPLE_RATE, new Float32Array(PAD_SAMPLES));
  entry.stream.inputFinished();
  decodeAll(recognizer, entry.stream);
  const text = recognizer.getResult(entry.stream).text.trim();
  entry.stream.free();
  send({ type: 'finished', id, text });
};

const handle = (message: ToRecognizerWorker) => {
  if (message.type === 'init') {
    init(message).catch((error: unknown) =>
      send({
        type: 'failed',
        id: null,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return;
  }
  if (message.type === 'open') {
    if (loaded.recognizer === null) {
      send({ type: 'failed', id: message.id, message: 'Not loaded' });
      return;
    }
    const stream = loaded.recognizer.createStream();
    stream.acceptWaveform(SAMPLE_RATE, new Float32Array(PAD_SAMPLES));
    loaded.streams.set(message.id, { stream, last: '' });
    return;
  }
  if (message.type === 'audio') {
    hear(message.id, message.pcm);
    return;
  }
  if (message.type === 'finish') {
    finish(message.id);
    return;
  }
  loaded.streams.get(message.id)?.stream.free();
  loaded.streams.delete(message.id);
};

self.onmessage = (event: MessageEvent<ToRecognizerWorker>) => {
  try {
    handle(event.data);
  } catch (error) {
    send({
      type: 'failed',
      id: 'id' in event.data ? event.data.id : null,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
