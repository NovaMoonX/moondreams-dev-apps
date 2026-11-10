export const PCM_SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 320;

const PROCESSOR_NAME = 'pcm-downsampler';

const PROCESSOR_SOURCE = `
class PcmDownsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${PCM_SAMPLE_RATE};
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.filled = 0;
    this.frame = new Int16Array(${FRAME_SAMPLES});
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      this.count += 1;
      this.phase += 1;
      if (this.phase < this.ratio) continue;
      this.phase -= this.ratio;
      const value = Math.max(-1, Math.min(1, this.sum / this.count));
      this.frame[this.filled++] = value < 0 ? value * 0x8000 : value * 0x7fff;
      this.sum = 0;
      this.count = 0;
      if (this.filled === ${FRAME_SAMPLES}) {
        const out = new Int16Array(this.frame);
        this.port.postMessage(out.buffer, [out.buffer]);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', PcmDownsampler);
`;

/** Turns a microphone stream into 16 kHz mono 16-bit little-endian frames of about 20 ms. */
export const startPcmCapture = async ({
  stream,
  onFrame,
}: {
  stream: MediaStream;
  onFrame: (frame: ArrayBuffer) => void;
}): Promise<{ stop: () => void }> => {
  const context = new AudioContext();
  const url = URL.createObjectURL(
    new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' }),
  );
  const release = () => {
    URL.revokeObjectURL(url);
    context.close().catch(() => undefined);
  };
  try {
    await context.audioWorklet.addModule(url);
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
    });
    const silence = context.createGain();
    silence.gain.value = 0;
    node.port.onmessage = (event: MessageEvent<ArrayBuffer>) =>
      onFrame(event.data);
    source.connect(node);
    node.connect(silence);
    silence.connect(context.destination);
    return {
      stop: () => {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        silence.disconnect();
        release();
      },
    };
  } catch (error) {
    release();
    throw error;
  }
};
