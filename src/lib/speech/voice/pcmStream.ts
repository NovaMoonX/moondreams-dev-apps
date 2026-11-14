export interface PcmFormat {
  sampleRate: number;
}

/** What the player needs of an `AudioContext`; the real one satisfies it. */
export interface PcmContext {
  readonly currentTime: number;
  readonly destination: AudioNode;
  createBuffer: (
    channels: number,
    length: number,
    sampleRate: number,
  ) => AudioBuffer;
  createBufferSource: () => AudioBufferSourceNode;
}

export interface PcmSink {
  /** Plays these bytes after what was already given; an odd trailing byte waits for the next call. */
  push: (bytes: Uint8Array) => void;
  /** No more bytes are coming; `done` resolves once what was scheduled has played. */
  end: () => void;
  /** Cuts every scheduled sound at once and resolves `done`. */
  stop: () => void;
  /** Resolves when the last sound ends (after `end`) or `stop` is called. */
  done: Promise<void>;
}

/** Seconds of margin before a chunk's start so the next one is queued ahead of the one playing. */
export const PCM_LEAD_SECONDS = 0.05;
const DEFAULT_RATE = 24000;

/** The format of a raw 16-bit little-endian mono body (`audio/L16; rate=24000; channels=1`); null for any other type. */
export const parsePcmFormat = (contentType: string): PcmFormat | null => {
  const [type = '', ...params] = contentType.split(';').map((p) => p.trim());
  if (type.toLowerCase() !== 'audio/l16') return null;
  const read = (name: string) =>
    Number(
      params
        .map((param) => param.split('='))
        .find(([key]) => key?.trim().toLowerCase() === name)?.[1],
    );
  const channels = read('channels');
  const rate = read('rate');
  if (Number.isFinite(channels) && channels !== 1) return null;
  return {
    sampleRate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_RATE,
  };
};

/** Int16 little-endian samples to floats in -1..1. */
export const toFloatSamples = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from(
    { length: Math.floor(bytes.byteLength / 2) },
    (_, index) => view.getInt16(index * 2, true) / 32768,
  );
};

/** Plays 16-bit mono PCM as it arrives: each chunk becomes a buffer scheduled right after the one before, and `onStart` fires when the first is scheduled. */
export const createPcmSink = ({
  context,
  sampleRate,
  onStart,
  leadSeconds = PCM_LEAD_SECONDS,
}: {
  context: PcmContext;
  sampleRate: number;
  onStart: () => void;
  leadSeconds?: number;
}): PcmSink => {
  const state = {
    carry: null as number | null,
    nextStartTime: 0,
    isStarted: false,
    isEnded: false,
    isStopped: false,
    nodes: new Set<AudioBufferSourceNode>(),
    resolve: () => undefined as void,
  };
  const done = new Promise<void>((resolve) => {
    state.resolve = resolve;
  });
  const settle = () => {
    if (state.isEnded && state.nodes.size === 0) state.resolve();
  };

  const toEvenBytes = (bytes: Uint8Array) => {
    const joined =
      state.carry === null ? bytes : Uint8Array.from([state.carry, ...bytes]);
    const isOdd = joined.length % 2 === 1;
    state.carry = isOdd ? (joined[joined.length - 1] ?? null) : null;
    return isOdd ? joined.subarray(0, joined.length - 1) : joined;
  };

  const schedule = (samples: Float32Array) => {
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    const startAt = Math.max(
      state.nextStartTime,
      context.currentTime + leadSeconds,
    );
    state.nextStartTime = startAt + buffer.duration;
    state.nodes.add(node);
    node.onended = () => {
      state.nodes.delete(node);
      settle();
    };
    node.start(startAt);
    if (!state.isStarted) {
      state.isStarted = true;
      onStart();
    }
  };

  return {
    push: (bytes) => {
      if (state.isStopped || state.isEnded) return;
      const samples = toFloatSamples(toEvenBytes(bytes));
      if (samples.length > 0) schedule(samples);
    },
    end: () => {
      state.isEnded = true;
      settle();
    },
    stop: () => {
      state.isStopped = true;
      state.isEnded = true;
      state.nodes.forEach((node) => {
        node.onended = null;
        try {
          node.stop();
        } catch {
          // Already stopped.
        }
      });
      state.nodes.clear();
      state.resolve();
    },
    done,
  };
};
