import {
  clearFallback,
  reportFallback,
  type FallbackCause,
} from '@/lib/fallbacks/fallbacks';
import { getAudioContext, wakeAudioOutput } from '@/lib/speech/audioContext';
import { splitSentences } from '@/lib/speech/naturalVoice/sentences';
import { describeThrown } from '@/lib/speech/speechDiagnostics';
import { toSpokenText } from '@/lib/speech/spokenText';
import { getDuckBus } from '@/lib/speech/voice/duckBus';
import {
  createPcmSink,
  parsePcmFormat,
  type PcmFormat,
  type PcmSink,
} from '@/lib/speech/voice/pcmStream';
import {
  SPOKEN_CHARS_PER_SECOND,
  WHISPER_FALLBACK_KEY,
} from '@/lib/speech/voice/playbackQueue';
import type {
  SpeechFetch,
  SpeechSource,
} from '@/lib/speech/voice/speechSource';
import type { SpeechHeldReason, TtsAdapter } from '@/lib/speech/voice/types';

const MAX_CHARS = 600;
const RESUME_MS = 1000;
const DONE_GRACE_MS = 1000;
// The first byte waits on sign-in, App Check, a cold function and the first sound being made.
const FIRST_BYTE_MS = 5000;
const BODY_BASE_MS = 6000;
const BODY_MS_PER_CHAR = 30;
const PROGRESS_MS = 150;
export const CLOUD_VOICE_FALLBACK_KEY = 'speech:cloud-voice';

export interface CloudPlayer {
  /** Turns the audio into something `play` can start; throws when it can't. */
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  /** Starts the audio; resolves when it ends or `signal` aborts. */
  play: (
    audio: AudioBuffer,
    signal: AbortSignal,
    onStart: () => void,
    onProgress?: (fraction: number) => void,
    readyAt?: number,
  ) => Promise<void>;
  /** Opens a sink for raw PCM; throws when audio can't run. */
  openStream: (
    format: PcmFormat,
    onStart: () => void,
    readyAt?: number,
  ) => Promise<PcmSink>;
  /** Wakes the speakers when a line is asked for, so they are awake by the time its audio arrives. */
  wake?: () => { readyAt: number; release: () => void } | null;
}

const resumeContext = async (context: AudioContext) => {
  await Promise.race([
    context.resume().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, RESUME_MS)),
  ]);
};

const webAudioPlayer: CloudPlayer = {
  wake: () => {
    const context = getAudioContext();
    return context === null ? null : wakeAudioOutput(context);
  },
  openStream: async (format, onStart, readyAt = 0) => {
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
      firstStartAt: readyAt,
    });
  },
  decode: async (bytes) => {
    const context = getAudioContext();
    if (context === null) throw new Error('Audio is not available');
    return context.decodeAudioData(bytes);
  },
  play: async (audio, signal, onStart, onProgress, readyAt = 0) => {
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
      const progress = { id: 0, startId: 0 };
      const finish = () => {
        window.clearTimeout(progress.startId);
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
      const startedAt = Math.max(context.currentTime, readyAt);
      node.start(startedAt);
      progress.startId = window.setTimeout(
        onStart,
        (startedAt - context.currentTime) * 1000,
      );
      if (onProgress) {
        progress.id = window.setInterval(
          () =>
            onProgress(
              Math.min(
                1,
                Math.max(0, (context.currentTime - startedAt) / audio.duration),
              ),
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

// `cut`: it sounded, then stalled or broke, so some of its tail was never said.
type PieceOutcome = 'played' | 'cut' | 'failed' | 'aborted';

/** Speaks through the cloud voice, with `fallback` covering a slow or failed answer before any sound. */
export const createCloudTts = ({
  source,
  fallback,
  firstByteMs = FIRST_BYTE_MS,
  bodyMs,
  gapMs = 4000,
  onHeld,
  onFallback,
  onCut,
  onPlayed,
  player = webAudioPlayer,
  reportsFallback = true,
}: {
  source: SpeechSource;
  fallback: TtsAdapter;
  firstByteMs?: number;
  bodyMs?: number;
  gapMs?: number;
  onHeld?: (reason: SpeechHeldReason) => void;
  onFallback?: (cause: FallbackCause) => void;
  onCut?: (cause: FallbackCause) => void;
  onPlayed?: () => void;
  player?: CloudPlayer;
  /** False for a sample or preview, so a failed one reports nothing. */
  reportsFallback?: boolean;
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
    get isFallingBack() {
      return live.isFallingBack;
    },
    speak: async (text, options) => {
      const wake = player.wake?.() ?? null;
      try {
        return await speakLine(text, options, wake?.readyAt ?? 0);
      } finally {
        wake?.release();
      }
    },
  };
  async function speakLine(
    text: string,
    options: Parameters<TtsAdapter['speak']>[1],
    readyAt: number,
  ) {
    const { priority, delivery, signal, onStart, onProgress, onRouteChange } =
      options;
    const spoken = toSpokenText(text);
    const pieces = toPieces(spoken);
    const totalChars = pieces.reduce((sum, piece) => sum + piece.length, 0);
    const run = {
      playedBy: 'cloud',
      isStarted: false,
      isCut: false,
      failure: {
        reason: '',
        cause: { stage: '', detail: '' } as FallbackCause,
      },
    };
    const fail = (reason: string, stage: string, detail: string) => {
      run.failure = { reason, cause: { stage, detail } };
    };
    const reportFailure = (index: number, isCut: boolean) =>
      reportsFallback &&
      (delivery !== undefined
        ? reportFallback({
            key: WHISPER_FALLBACK_KEY,
            feature: 'Speaking',
            wanted: 'a whispered line',
            used: isCut
              ? 'the part that played'
              : 'nothing: a whispered line is never said in the device voice',
            reason: run.failure.reason,
            cause: run.failure.cause,
            facts: [
              `Failed part: ${index + 1} of ${pieces.length}`,
              `Line: ${totalChars} characters, ${priority}`,
              `First-byte limit: ${firstByteMs} ms`,
            ],
          })
        : reportFallback({
            key: CLOUD_VOICE_FALLBACK_KEY,
            feature: 'Speaking',
            wanted: isCut
              ? 'the whole line in your chosen voice'
              : 'your chosen voice',
            used: isCut ? 'the part that played' : "this device's voice",
            reason: run.failure.reason,
            cause: run.failure.cause,
            facts: [
              `Failed part: ${index + 1} of ${pieces.length}`,
              `Line: ${totalChars} characters, ${priority}`,
              `Stood in: ${fallback.id}`,
              `First-byte limit: ${firstByteMs} ms`,
            ],
          }));
    const prefetch = {
      index: -1,
      isTaken: false,
      controller: null as AbortController | null,
      answer: null as Promise<SpeechFetch> | null,
    };
    const startPrefetch = (index: number) => {
      const piece = pieces[index];
      if (piece === undefined || prefetch.index === index || signal.aborted) {
        return;
      }
      const controller = new AbortController();
      const answer = source.fetchSpeech(
        piece,
        priority,
        controller.signal,
        undefined,
        delivery,
      );
      answer.catch(() => undefined);
      Object.assign(prefetch, {
        index,
        isTaken: false,
        controller,
        answer,
      });
    };
    const dropPrefetch = () => {
      if (!prefetch.isTaken) prefetch.controller?.abort();
    };
    signal.addEventListener('abort', dropPrefetch);
    const charsBefore = (index: number) =>
      pieces.slice(0, index).reduce((sum, piece) => sum + piece.length, 0);
    const toLine = (index: number, fraction: number) =>
      totalChars === 0
        ? 0
        : (charsBefore(index) + fraction * (pieces[index]?.length ?? 0)) /
          totalChars;
    const speakRest = async (index: number) => {
      // A whispered line is never said in the device's voice: the queue reports it as failed instead.
      if (delivery !== undefined) {
        throw new Error('The cloud voice could not whisper this line');
      }
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
      index: number,
      report: (fraction: number) => void,
    ): Promise<PieceOutcome> => {
      if (signal.aborted) return 'aborted';
      const piece = pieces[index] ?? '';
      const isPrefetched = prefetch.index === index;
      if (isPrefetched) prefetch.isTaken = true;
      const controller =
        (isPrefetched ? prefetch.controller : null) ?? new AbortController();
      const sinks: PcmSink[] = [];
      const abort = () => {
        controller.abort();
        sinks.forEach((sink) => sink.stop());
      };
      signal.addEventListener('abort', abort);
      const state = { isPlaying: false, isCut: false };
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
      // Sound can be scheduled and still be waiting on waking speakers, so "has sound" never waits for it to be heard.
      const hasSound = () =>
        state.isPlaying ||
        sinks.some((sink) => sink.getTiming().scheduledMs > 0);
      const markSounding = () => {
        state.isPlaying = true;
        live.isSounding = true;
        onRouteChange?.();
        startPrefetch(index + 1);
        if (run.isStarted) return;
        run.isStarted = true;
        onStart();
      };
      const streamPcm = async (
        format: PcmFormat,
        reader: ReadableStreamDefaultReader<Uint8Array>,
        first: Uint8Array,
      ) => {
        const sink = await player.openStream(format, markSounding, readyAt);
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
        startPrefetch(index + 1);
        const pump = async (): Promise<void> => {
          const next = await within(reader.read(), gapMs);
          if (next === 'late' && !signal.aborted) {
            state.isCut = true;
            fail(
              'the voice stopped partway',
              'audio gap',
              `No audio for ${gapMs} ms`,
            );
          }
          if (next === 'late' || next.done || signal.aborted) return;
          sink.push(next.value);
          return pump();
        };
        try {
          await pump();
        } catch (error) {
          if (!hasSound()) {
            sink.stop();
            throw error;
          }
          sink.end();
          if (!signal.aborted) {
            state.isCut = true;
            fail(
              'the voice stopped partway',
              'audio stream read',
              describeThrown(error),
            );
            console.error('The cloud voice stopped partway', error);
          }
        }
        sink.end();
        if (!hasSound() && !signal.aborted) {
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
          (isPrefetched ? prefetch.answer : null) ??
            source.fetchSpeech(
              piece,
              priority,
              controller.signal,
              undefined,
              delivery,
            ),
          firstByteMs,
        );
        if (signal.aborted) {
          controller.abort();
          return 'aborted';
        }
        if (answer === 'late') {
          fail(
            "the voice service didn't answer in time",
            'speech request timed out',
            `No response within ${firstByteMs} ms`,
          );
          controller.abort();
          return 'failed';
        }
        if (answer.status === 'unavailable') {
          fail(
            "the voice service couldn't be reached",
            'speech request',
            answer.detail,
          );
          controller.abort();
          return 'failed';
        }
        if (answer.status === 'held') {
          fail(
            "today's cloud voice allowance is used up",
            'allowance held',
            `Held: ${answer.reason}`,
          );
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
          if (first === 'late') {
            fail(
              'the voice service sent no sound in time',
              'first audio timed out',
              `No audio within ${firstByteMs} ms of the request`,
            );
          }
          controller.abort();
          return first === 'late' ? 'failed' : 'aborted';
        }
        const pcm = parsePcmFormat(answer.contentType);
        if (pcm !== null && !first.done) {
          await streamPcm(pcm, reader, first.value);
          if (!state.isPlaying && (signal.aborted || !hasSound())) {
            return 'aborted';
          }
          return state.isCut ? 'cut' : 'played';
        }
        const bodyLimitMs =
          bodyMs ?? BODY_BASE_MS + piece.length * BODY_MS_PER_CHAR;
        const rest = await within(
          first.done
            ? Promise.resolve([] as Uint8Array[])
            : readRest(reader, [first.value]),
          bodyLimitMs,
        );
        if (signal.aborted) return 'aborted';
        if (rest === 'late') {
          fail(
            'the voice audio took too long to arrive',
            'audio body timed out',
            `Audio incomplete after ${bodyLimitMs} ms`,
          );
          controller.abort();
          return 'failed';
        }
        const audio = await player.decode(concat(rest));
        if (signal.aborted) return 'aborted';
        await player.play(audio, signal, markSounding, report, readyAt);
        return signal.aborted && !state.isPlaying ? 'aborted' : 'played';
      } catch (error) {
        if (signal.aborted) return 'aborted';
        if (hasSound()) {
          fail(
            'the voice stopped partway',
            'audio playback',
            describeThrown(error),
          );
          return 'cut';
        }
        fail(
          "the voice audio couldn't be played",
          'audio decode or playback',
          describeThrown(error),
        );
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
      if (index >= pieces.length) {
        if (!run.isCut) {
          if (reportsFallback) {
            clearFallback(
              delivery === undefined
                ? CLOUD_VOICE_FALLBACK_KEY
                : WHISPER_FALLBACK_KEY,
            );
          }
          onPlayed?.();
        }
        return run.playedBy;
      }
      if (signal.aborted) return index === 0 ? undefined : run.playedBy;
      const outcome = await speakPiece(index, (fraction) =>
        onProgress?.(toLine(index, fraction)),
      );
      if (outcome === 'aborted') return index === 0 ? undefined : run.playedBy;
      if (outcome === 'failed') {
        reportFailure(index, false);
        if (delivery === undefined) onFallback?.(run.failure.cause);
        return speakRest(index);
      }
      if (outcome === 'cut') {
        run.isCut = true;
        reportFailure(index, true);
        onCut?.(run.failure.cause);
      }
      return speakFrom(index + 1);
    };
    try {
      return await speakFrom(0);
    } finally {
      dropPrefetch();
      signal.removeEventListener('abort', dropPrefetch);
    }
  }
};
