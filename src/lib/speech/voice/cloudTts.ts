import { getAudioContext } from '@/lib/speech/audioContext';
import { splitSentences } from '@/lib/speech/naturalVoice/sentences';
import { toSpokenText } from '@/lib/speech/spokenText';
import { getDuckBus } from '@/lib/speech/voice/duckBus';
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
const DONE_GRACE_MS = 1000;
// The first byte waits on sign-in, App Check, a cold function and the first sound being made.
const FIRST_BYTE_MS = 5000;
const BODY_BASE_MS = 6000;
const BODY_MS_PER_CHAR = 30;
const PROGRESS_MS = 150;
const SPOKEN_CHARS_PER_SECOND = 14;

export interface CloudPlayer {
  /** Turns the audio into something `play` can start; throws when it can't. */
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  /** Starts the audio; resolves when it ends or `signal` aborts. */
  play: (
    audio: AudioBuffer,
    signal: AbortSignal,
    onStart: () => void,
    onProgress?: (fraction: number) => void,
  ) => Promise<void>;
  /** Opens a sink for raw PCM; throws when audio can't run. */
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
    return createPcmSink({
      context: {
        get currentTime() {
          return context.currentTime;
        },
        destination: getDuckBus(context),
        createBuffer: (channels, length, rate) =>
          context.createBuffer(channels, length, rate),
        createBufferSource: () => context.createBufferSource(),
      },
      sampleRate: format.sampleRate,
      onStart,
    });
  },
  decode: async (bytes) => {
    const context = getAudioContext();
    if (context === null) throw new Error('Audio is not available');
    return context.decodeAudioData(bytes);
  },
  play: async (audio, signal, onStart, onProgress) => {
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
      node.connect(getDuckBus(context));
      const progress = { id: 0 };
      const finish = () => {
        window.clearInterval(progress.id);
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
      const startedAt = context.currentTime;
      node.start();
      onStart();
      if (onProgress) {
        progress.id = window.setInterval(
          () =>
            onProgress(
              Math.min(1, (context.currentTime - startedAt) / audio.duration),
            ),
          PROGRESS_MS,
        );
      }
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

/** A line over the provider's cap is cut at sentence ends into pieces that each fit, packed as full as they go. */
const toPieces = (spoken: string) =>
  spoken.length <= MAX_CHARS
    ? [spoken]
    : splitSentences(spoken, { minChars: 0, maxChars: MAX_CHARS }).reduce<
        string[]
      >((pieces, sentence) => {
        const last = pieces[pieces.length - 1];
        return last !== undefined &&
          last.length + 1 + sentence.length <= MAX_CHARS
          ? [...pieces.slice(0, -1), `${last} ${sentence}`]
          : [...pieces, sentence];
      }, []);

type PieceOutcome = 'played' | 'failed' | 'aborted';

/** Speaks through the cloud voice, streamed when it is raw PCM, a line over the cap piece by piece in order; before any sound a slow, held or failed answer sends that piece and the rest to `fallback`. */
export const createCloudTts = ({
  source,
  fallback,
  firstByteMs = FIRST_BYTE_MS,
  bodyMs,
  gapMs = 4000,
  onHeld,
  onFallback,
  player = webAudioPlayer,
}: {
  source: SpeechSource;
  fallback: TtsAdapter;
  firstByteMs?: number;
  /** How long a whole buffered answer may take to arrive; by default it grows with the text's length. */
  bodyMs?: number;
  gapMs?: number;
  onHeld?: (reason: SpeechHeldReason) => void;
  onFallback?: () => void;
  player?: CloudPlayer;
}): TtsAdapter => {
  const live = { isSounding: false, isFallingBack: false };
  return {
    id: 'cloud',
    route: 'cloud',
    get isPlayingThroughWebAudio() {
      return live.isFallingBack
        ? fallback.isPlayingThroughWebAudio
        : live.isSounding;
    },
    speak: async (text, options) => {
      const { priority, signal, onStart, onProgress, onRouteChange } = options;
      const spoken = toSpokenText(text);
      const pieces = toPieces(spoken);
      const totalChars = pieces.reduce((sum, piece) => sum + piece.length, 0);
      const run = { playedBy: 'cloud', isStarted: false };
      const charsBefore = (index: number) =>
        pieces.slice(0, index).reduce((sum, piece) => sum + piece.length, 0);
      const toLine = (index: number, fraction: number) =>
        totalChars === 0
          ? 0
          : (charsBefore(index) + fraction * (pieces[index]?.length ?? 0)) /
            totalChars;
      const speakRest = async (index: number) => {
        live.isFallingBack = true;
        live.isSounding = false;
        onRouteChange?.();
        const rest = pieces.slice(index).join(' ');
        const restChars = rest.length;
        const before = charsBefore(index);
        return (
          (await fallback.speak(rest, {
            ...options,
            onStart: run.isStarted ? () => undefined : onStart,
            onProgress: onProgress
              ? (fraction) =>
                  onProgress(
                    totalChars === 0
                      ? 0
                      : (before + fraction * restChars) / totalChars,
                  )
              : undefined,
          })) ?? fallback.id
        );
      };
      const speakPiece = async (
        piece: string,
        report: (fraction: number) => void,
      ): Promise<PieceOutcome> => {
        if (signal.aborted) return 'aborted';
        const controller = new AbortController();
        const sinks: PcmSink[] = [];
        const abort = () => {
          controller.abort();
          sinks.forEach((sink) => sink.stop());
        };
        signal.addEventListener('abort', abort);
        const state = { isPlaying: false };
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
                reject(
                  error instanceof Error ? error : new Error(String(error)),
                );
              },
            );
          });
        const markSounding = () => {
          state.isPlaying = true;
          live.isSounding = true;
          onRouteChange?.();
          if (run.isStarted) return;
          run.isStarted = true;
          onStart();
        };
        const streamPcm = async (
          format: PcmFormat,
          reader: ReadableStreamDefaultReader<Uint8Array>,
          first: Uint8Array,
        ) => {
          const sink = await player.openStream(format, markSounding);
          sinks.push(sink);
          if (signal.aborted) {
            sink.stop();
            return;
          }
          const estimateMs = (piece.length / SPOKEN_CHARS_PER_SECOND) * 1000;
          timers.push(
            setInterval(() => {
              const { playedMs, scheduledMs, isEnded } = sink.getTiming();
              const wholeMs = isEnded
                ? scheduledMs
                : Math.max(scheduledMs, estimateMs);
              if (wholeMs > 0) report(Math.min(1, playedMs / wholeMs));
            }, PROGRESS_MS),
          );
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
            const wasPlaying = state.isPlaying;
            sink.end();
            if (!wasPlaying) throw error;
            if (!signal.aborted) {
              console.error('The cloud voice stopped partway', error);
            }
          }
          sink.end();
          if (!state.isPlaying && !signal.aborted) {
            throw new Error('The cloud voice sent no audio');
          }
          // A suspended context freezes its clock: wait while the audio still advances, give up once it stalls.
          await new Promise<void>((resolve) => {
            const wait = (before: number) => {
              const id = setTimeout(() => {
                const left = sink.remainingMs();
                if (left > 0 && left < before) wait(left);
                else resolve();
              }, before + DONE_GRACE_MS);
              timers.push(id);
            };
            wait(sink.remainingMs());
            void sink.done.then(resolve);
          });
          sink.stop();
        };
        const firstByteBy = Date.now() + firstByteMs;
        try {
          const answer = await within(
            source.fetchSpeech(piece, priority, controller.signal),
            firstByteMs,
          );
          if (signal.aborted) {
            controller.abort();
            return 'aborted';
          }
          if (answer === 'late' || answer.status === 'unavailable') {
            controller.abort();
            return 'failed';
          }
          if (answer.status === 'held') {
            onHeld?.(answer.reason);
            controller.abort();
            return 'failed';
          }
          run.playedBy = `cloud:${answer.provider}`;
          const reader = answer.body.getReader();
          readers.push(reader);
          const first = await within(
            reader.read(),
            Math.max(0, firstByteBy - Date.now()),
          );
          if (first === 'late' || signal.aborted) {
            controller.abort();
            return first === 'late' ? 'failed' : 'aborted';
          }
          const pcm = parsePcmFormat(answer.contentType);
          if (pcm !== null && !first.done) {
            await streamPcm(pcm, reader, first.value);
            return state.isPlaying ? 'played' : 'aborted';
          }
          const rest = await within(
            first.done
              ? Promise.resolve([] as Uint8Array[])
              : readRest(reader, [first.value]),
            bodyMs ?? BODY_BASE_MS + piece.length * BODY_MS_PER_CHAR,
          );
          if (signal.aborted) return 'aborted';
          if (rest === 'late') {
            controller.abort();
            return 'failed';
          }
          const audio = await player.decode(concat(rest));
          if (signal.aborted) return 'aborted';
          await player.play(audio, signal, markSounding, report);
          return 'played';
        } catch (error) {
          if (signal.aborted) return 'aborted';
          if (state.isPlaying) return 'played';
          console.error('The cloud voice failed to read', error);
          controller.abort();
          return 'failed';
        } finally {
          timers.forEach(clearTimeout);
          sinks.forEach((sink) => sink.stop());
          readers.forEach((reader) => reader.cancel().catch(() => undefined));
          signal.removeEventListener('abort', abort);
        }
      };
      const speakFrom = async (index: number): Promise<string | undefined> => {
        if (index >= pieces.length) return run.playedBy;
        if (signal.aborted) return index === 0 ? undefined : run.playedBy;
        const outcome = await speakPiece(pieces[index] ?? '', (fraction) =>
          onProgress?.(toLine(index, fraction)),
        );
        if (outcome === 'aborted')
          return index === 0 ? undefined : run.playedBy;
        if (outcome === 'failed') {
          onFallback?.();
          return speakRest(index);
        }
        return speakFrom(index + 1);
      };
      return speakFrom(0);
    },
  };
};
