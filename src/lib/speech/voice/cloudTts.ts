import { getAudioContext } from '@/lib/speech/audioContext';
import { toSpokenText } from '@/lib/speech/spokenText';
import {
  createPcmSink,
  parsePcmFormat,
  type PcmFormat,
  type PcmSink,
} from '@/lib/speech/voice/pcmStream';
import type { SpeechSource } from '@/lib/speech/voice/speechSource';
import type { SpeechHeldReason, TtsAdapter } from '@/lib/speech/voice/types';

const MAX_CHARS = 600;
const RESUME_MS = 1000;

export interface CloudPlayer {
  /** Turns the audio into something `play` can start; throws when it can't. */
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  /** Starts the audio; resolves when it ends or `signal` aborts. */
  play: (
    audio: AudioBuffer,
    signal: AbortSignal,
    onStart: () => void,
  ) => Promise<void>;
  /** Opens a sink that plays raw PCM as it is pushed; `onStart` fires at the first scheduled sound. Throws when audio can't run. */
  openStream: (format: PcmFormat, onStart: () => void) => Promise<PcmSink>;
}

const resumeContext = async (context: AudioContext) => {
  await Promise.race([
    context.resume().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, RESUME_MS)),
  ]);
};

const webAudioPlayer: CloudPlayer = {
  openStream: async (format, onStart) => {
    const context = getAudioContext();
    if (context === null) throw new Error('Audio is not available');
    await resumeContext(context);
    if (context.state !== 'running') throw new Error('Audio could not start');
    return createPcmSink({ context, sampleRate: format.sampleRate, onStart });
  },
  decode: async (bytes) => {
    const context = getAudioContext();
    if (context === null) throw new Error('Audio is not available');
    return context.decodeAudioData(bytes);
  },
  play: async (audio, signal, onStart) => {
    const context = getAudioContext();
    if (context === null) throw new Error('Audio is not available');
    await resumeContext(context);
    if (context.state !== 'running' && !signal.aborted) {
      throw new Error('Audio could not start');
    }
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const node = context.createBufferSource();
      node.buffer = audio;
      node.connect(context.destination);
      const finish = () => {
        signal.removeEventListener('abort', abort);
        resolve();
      };
      function abort() {
        node.onended = null;
        try {
          node.stop();
        } catch {
          // Already stopped.
        }
        finish();
      }
      signal.addEventListener('abort', abort);
      node.onended = finish;
      node.start();
      onStart();
    });
  },
};

const readRest = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: Uint8Array[],
): Promise<Uint8Array[]> => {
  const next = await reader.read();
  return next.done ? chunks : readRest(reader, [...chunks, next.value]);
};

const concat = (chunks: Uint8Array[]) => {
  const bytes = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  chunks.reduce((offset, chunk) => {
    bytes.set(chunk, offset);
    return offset + chunk.length;
  }, 0);
  return bytes.buffer;
};

/** Speaks through the cloud voice: a raw PCM answer plays as it arrives, any other audio once it has all arrived. Before any sound, a slow, held, failed or undecodable answer is spoken by `fallback` instead; once sound has started, a failure ends the line quietly. `onFallback` hears each time the device voice stands in. */
export const createCloudTts = ({
  source,
  fallback,
  firstByteMs = 2500,
  bodyMs = 8000,
  gapMs = 4000,
  onHeld,
  onFallback,
  player = webAudioPlayer,
}: {
  source: SpeechSource;
  fallback: TtsAdapter;
  firstByteMs?: number;
  bodyMs?: number;
  /** The longest a streamed body may go without a chunk. */
  gapMs?: number;
  onHeld?: (reason: SpeechHeldReason) => void;
  onFallback?: () => void;
  player?: CloudPlayer;
}): TtsAdapter => ({
  id: 'cloud',
  route: 'cloud',
  isPlayingThroughWebAudio: true,
  speak: async (text, options) => {
    const { priority, signal, onStart } = options;
    const speakFallback = async () =>
      (await fallback.speak(text, options)) ?? fallback.id;
    const spoken = toSpokenText(text);
    if (spoken.length > MAX_CHARS) return speakFallback();
    if (signal.aborted) return;
    const controller = new AbortController();
    const sinks: PcmSink[] = [];
    const abort = () => {
      controller.abort();
      sinks.forEach((sink) => sink.stop());
    };
    signal.addEventListener('abort', abort);
    const state = { isPlaying: false, playedBy: 'cloud' };
    const timers: ReturnType<typeof setTimeout>[] = [];
    const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
    const within = <T>(work: Promise<T>, ms: number) =>
      new Promise<T | 'late'>((resolve, reject) => {
        const id = setTimeout(() => resolve('late'), ms);
        timers.push(id);
        work.then(
          (value) => {
            clearTimeout(id);
            resolve(value);
          },
          (error: unknown) => {
            clearTimeout(id);
            reject(error instanceof Error ? error : new Error(String(error)));
          },
        );
      });
    const toFallback = () => {
      controller.abort();
      if (signal.aborted) return undefined;
      onFallback?.();
      return speakFallback();
    };
    const streamPcm = async (
      format: PcmFormat,
      reader: ReadableStreamDefaultReader<Uint8Array>,
      first: Uint8Array,
    ) => {
      const sink = await player.openStream(format, () => {
        state.isPlaying = true;
        onStart();
      });
      sinks.push(sink);
      if (signal.aborted) {
        sink.stop();
        return;
      }
      sink.push(first);
      const pump = async (): Promise<void> => {
        const next = await within(reader.read(), gapMs);
        if (next === 'late' || next.done || signal.aborted) return;
        sink.push(next.value);
        return pump();
      };
      try {
        await pump();
      } catch (error) {
        if (!state.isPlaying) throw error;
        console.error('The cloud voice stopped partway', error);
      }
      if (!state.isPlaying && !signal.aborted) {
        throw new Error('The cloud voice sent no audio');
      }
      sink.end();
      await sink.done;
    };
    const firstByteBy = Date.now() + firstByteMs;
    try {
      const answer = await within(
        source.fetchSpeech(spoken, priority, controller.signal),
        firstByteMs,
      );
      if (signal.aborted) {
        controller.abort();
        return;
      }
      if (answer === 'late' || answer.status === 'unavailable') {
        return await toFallback();
      }
      if (answer.status === 'held') {
        onHeld?.(answer.reason);
        return await toFallback();
      }
      state.playedBy = `cloud:${answer.provider}`;
      const reader = answer.body.getReader();
      readers.push(reader);
      const first = await within(
        reader.read(),
        Math.max(0, firstByteBy - Date.now()),
      );
      if (first === 'late' || signal.aborted) {
        if (signal.aborted) controller.abort();
        return first === 'late' ? await toFallback() : undefined;
      }
      const pcm = parsePcmFormat(answer.contentType);
      if (pcm !== null && !first.done) {
        await streamPcm(pcm, reader, first.value);
        return state.isPlaying ? state.playedBy : undefined;
      }
      const rest = await within(
        first.done
          ? Promise.resolve([] as Uint8Array[])
          : readRest(reader, [first.value]),
        bodyMs,
      );
      if (signal.aborted) return;
      if (rest === 'late') return await toFallback();
      const audio = await player.decode(concat(rest));
      if (signal.aborted) return;
      await player.play(audio, signal, () => {
        state.isPlaying = true;
        onStart();
      });
      return state.playedBy;
    } catch (error) {
      if (signal.aborted || state.isPlaying) return state.playedBy;
      console.error('The cloud voice failed to read', error);
      return await toFallback();
    } finally {
      timers.forEach(clearTimeout);
      sinks.forEach((sink) => sink.stop());
      readers.forEach((reader) => reader.cancel().catch(() => undefined));
      signal.removeEventListener('abort', abort);
    }
  },
});
