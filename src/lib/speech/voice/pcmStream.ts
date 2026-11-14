export interface PcmFormat {
  sampleRate: number;
}

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
  push: (bytes: Uint8Array) => void;
  end: () => void;
  remainingMs: () => number;
  stop: () => void;
  done: Promise<void>;
}

export const PCM_LEAD_SECONDS = 0.05;
export const PCM_PREBUFFER_SECONDS = 0.2;
const DEFAULT_RATE = 24000;

/** The format of a raw 16-bit mono `audio/L16` body; null for any other type. */
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

export const toFloatSamples = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from(
    { length: Math.floor(bytes.byteLength / 2) },
    (_, index) => view.getInt16(index * 2, true) / 32768,
  );
};

/** Plays 16-bit mono PCM as it arrives, after holding about 200 ms; `onStart` fires when the first sound is scheduled. */
export const createPcmSink = ({
  context,
  sampleRate,
  onStart,
  leadSeconds = PCM_LEAD_SECONDS,
  prebufferSeconds = PCM_PREBUFFER_SECONDS,
}: {
  context: PcmContext;
  sampleRate: number;
  onStart: () => void;
  leadSeconds?: number;
  prebufferSeconds?: number;
}): PcmSink => {
  const state = {
    carry: null as number | null,
    nextStartTime: 0,
    isStarted: false,
    isEnded: false,
    isStopped: false,
    held: [] as Float32Array[],
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

  const flushHeld = () => {
    const samples = new Float32Array(
      state.held.reduce((sum, part) => sum + part.length, 0),
    );
    state.held.reduce((offset, part) => {
      samples.set(part, offset);
      return offset + part.length;
    }, 0);
    state.held = [];
    if (samples.length > 0) schedule(samples);
  };

  return {
    push: (bytes) => {
      if (state.isStopped || state.isEnded) return;
      const samples = toFloatSamples(toEvenBytes(bytes));
      if (samples.length === 0) return;
      if (state.isStarted) {
        schedule(samples);
        return;
      }
      state.held.push(samples);
      const heldLength = state.held.reduce((sum, part) => sum + part.length, 0);
      if (heldLength >= prebufferSeconds * sampleRate) flushHeld();
    },
    end: () => {
      if (state.isStopped || state.isEnded) return;
      flushHeld();
      state.isEnded = true;
      settle();
    },
    remainingMs: () =>
      Math.max(0, state.nextStartTime - context.currentTime) * 1000,
    stop: () => {
      state.isStopped = true;
      state.isEnded = true;
      state.held = [];
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
