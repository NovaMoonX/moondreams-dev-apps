/** One file the on-device recognizer needs, as served from this site and checked before it is kept. */
export interface OnDeviceFile {
  url: string;
  bytes: number;
  sha256: string;
}

const BASE = '/speech/asr';

/** The speech engine (sherpa-onnx, speech recognition only, built for WebAssembly). */
export const ON_DEVICE_RUNTIME: OnDeviceFile = {
  url: `${BASE}/sherpa-onnx-asr.mjs`,
  bytes: 132_124,
  sha256: 'd21eea97383af5ae229403b6ebc5c312ffc5af778c1ef30758b8edf1e0c89c1e',
};

export const ON_DEVICE_BINARY: OnDeviceFile = {
  url: `${BASE}/sherpa-onnx-asr.wasm`,
  bytes: 13_453_942,
  sha256: 'edfe82144d736775251d17b7158c8eafee14bce9603dd59b367f0a4055de6eba',
};

/** The streaming English Zipformer transducer (int8) and its tokens, named as the recognizer reads them. */
export const ON_DEVICE_MODELS: (OnDeviceFile & { name: string })[] = [
  {
    name: 'encoder.int8.onnx',
    url: `${BASE}/encoder.int8.onnx`,
    bytes: 42_845_182,
    sha256: '3810755ce7c3ab26b42a8bcf39d191308fa27fb0f53358823ba46141d03b7eb3',
  },
  {
    name: 'decoder.int8.onnx',
    url: `${BASE}/decoder.int8.onnx`,
    bytes: 539_499,
    sha256: '21e2a2acd961b3ac72f55be2f10f1a285e1b0b0ba010d7c0b6eab141411b163c',
  },
  {
    name: 'joiner.int8.onnx',
    url: `${BASE}/joiner.int8.onnx`,
    bytes: 259_572,
    sha256: 'e085d73b593cf9b0707f370dbd656d58327d3fe36d80d849202ef81df02cb01e',
  },
  {
    name: 'tokens.txt',
    url: `${BASE}/tokens.txt`,
    bytes: 5_048,
    sha256: '49e3c2646595fd907228b3c6787069658f67b17377c60aeb8619c4551b2316fb',
  },
];

export const ON_DEVICE_FILES: OnDeviceFile[] = [
  ON_DEVICE_RUNTIME,
  ON_DEVICE_BINARY,
  ...ON_DEVICE_MODELS,
];

export const ON_DEVICE_TOTAL_BYTES = ON_DEVICE_FILES.reduce(
  (sum, file) => sum + file.bytes,
  0,
);

/** What the download weighs, in megabytes (millions of bytes), as shown before it starts. */
export const ON_DEVICE_SIZE_MB = Math.round(ON_DEVICE_TOTAL_BYTES / 1_000_000);

export const ON_DEVICE_CACHE_NAME = 'on-device-asr-zipformer-en-20m-v1';

/** The languages the model hears. */
export const isOnDeviceLang = (lang: string) =>
  lang.toLowerCase().startsWith('en');

/** The engine and the model, with their licences, as named where the download is offered. */
export const ON_DEVICE_CREDITS =
  'sherpa-onnx (Apache-2.0) with ONNX Runtime (MIT) and a Zipformer model trained on LibriSpeech (Apache-2.0)';
