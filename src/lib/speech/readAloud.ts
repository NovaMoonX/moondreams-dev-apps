import { reportFallback, type FallbackCause } from '@/lib/fallbacks/fallbacks';
import { getAudioContext } from '@/lib/speech/audioContext';
import {
  isNaturalVoiceLang,
  NATURAL_START_TIMEOUT_MS,
} from '@/lib/speech/naturalVoice/config';
import {
  cancelNaturalSynthesis,
  getNaturalVoiceState,
  NATURAL_VOICE_FALLBACK_KEY,
  isNaturalVoiceCancel,
  recordFastNaturalReading,
  recordSlowNaturalReading,
  synthesizeNaturalVoice,
} from '@/lib/speech/naturalVoice/naturalVoiceEngine';
import { splitSentences } from '@/lib/speech/naturalVoice/sentences';
import { describeThrown } from '@/lib/speech/speechDiagnostics';
import { toSpokenText } from '@/lib/speech/spokenText';
import { speakText } from '@/utils/speechUtils';

export interface ReadAloudOptions {
  lang: string;
  /** Use the natural voice when it is ready and speaks this language; the browser's voice is the fallback for anything else and for any failure. */
  isNatural?: boolean;
  onStart?: () => void;
  /** Runs once, when the reading ends, fails, is cancelled or outlasts a guard for its length. */
  onEnd?: () => void;
  /** Gives up the browser's voice when it hasn't started by then (`onNoStart`, then `onEnd`). */
  startTimeoutMs?: number;
  onNoStart?: () => void;
  onProgress?: (fraction: number) => void;
  onVoice?: (voice: 'natural' | 'system') => void;
}

const PROGRESS_MS = 150;

const reportBrowserVoice = (
  reason: string,
  cause: FallbackCause,
  facts: string[] = [],
) =>
  reportFallback({
    key: NATURAL_VOICE_FALLBACK_KEY,
    feature: 'Speaking',
    wanted: 'the natural voice',
    used: "the browser's voice",
    reason,
    cause,
    facts,
  });

const toNaturalBlock = (
  options: ReadAloudOptions,
  context: AudioContext | null,
) => {
  if (context === null) return 'audio is not available here';
  if (!isNaturalVoiceLang(options.lang)) {
    return "it doesn't speak this language";
  }
  const { status, problem } = getNaturalVoiceState();
  return status === 'ready'
    ? null
    : `it isn't ready (${status}${problem === null ? '' : `, ${problem}`})`;
};

interface Run {
  isStopped: boolean;
  isDone: boolean;
  isStarted: boolean;
  isEnded: boolean;
  playUntil: number;
  rest: string | null;
  restFrom: number;
  sources: Set<AudioBufferSourceNode>;
  startId: number;
  progressId: number;
  heard: { startAt: number; endAt: number; chars: number }[];
  stopFallback: (() => void) | null;
}

const readNatural = (
  sentences: string[],
  context: AudioContext,
  options: ReadAloudOptions,
) => {
  const run: Run = {
    isStopped: false,
    isDone: false,
    isStarted: false,
    isEnded: false,
    playUntil: 0,
    rest: null,
    restFrom: 0,
    sources: new Set(),
    startId: 0,
    progressId: 0,
    heard: [],
    stopFallback: null,
  };
  const wholeChars = sentences.reduce((sum, line) => sum + line.length, 0);

  const end = () => {
    if (run.isEnded) return;
    run.isEnded = true;
    window.clearTimeout(run.startId);
    window.clearInterval(run.progressId);
    options.onEnd?.();
  };

  const speakRest = (rest: string, from: number) => {
    window.clearInterval(run.progressId);
    options.onVoice?.('system');
    const before = sentences
      .slice(0, from)
      .reduce((sum, line) => sum + line.length, 0);
    run.stopFallback = speakText(rest, {
      lang: options.lang,
      startTimeoutMs: options.startTimeoutMs,
      onNoStart: options.onNoStart,
      onProgress: options.onProgress
        ? (fraction) =>
            options.onProgress?.(
              (before + fraction * (wholeChars - before)) /
                Math.max(1, wholeChars),
            )
        : undefined,
      onStart: () => {
        if (run.isStarted) return;
        run.isStarted = true;
        options.onStart?.();
      },
      onEnd: end,
    });
  };

  const reportProgress = () => {
    const now = context.currentTime;
    const done = run.heard.reduce(
      (sum, part) =>
        sum +
        part.chars *
          Math.min(
            1,
            Math.max(0, (now - part.startAt) / (part.endAt - part.startAt)),
          ),
      0,
    );
    options.onProgress?.(done / Math.max(1, wholeChars));
  };

  const settle = () => {
    if (!run.isDone || run.sources.size > 0 || run.isStopped || run.isEnded) {
      return;
    }
    if (run.rest === null) end();
    else speakRest(run.rest, run.restFrom);
  };

  const play = (pcm: Float32Array, sampleRate: number, chars: number) => {
    const buffer = context.createBuffer(1, pcm.length, sampleRate);
    buffer.copyToChannel(new Float32Array(pcm), 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.02, run.playUntil);
    run.playUntil = startAt + buffer.duration;
    run.heard.push({ startAt, endAt: run.playUntil, chars });
    run.sources.add(source);
    source.onended = () => {
      run.sources.delete(source);
      settle();
    };
    source.start(startAt);
    if (run.isStarted) return;
    run.isStarted = true;
    window.clearTimeout(run.startId);
    recordFastNaturalReading();
    options.onVoice?.('natural');
    options.onStart?.();
    if (options.onProgress) {
      run.progressId = window.setInterval(reportProgress, PROGRESS_MS);
    }
  };

  const giveUpOn = (from: number) => {
    run.restFrom = from;
    run.rest = sentences.slice(from).join(' ');
    run.isDone = true;
    settle();
  };

  const synthesizeFrom = async (index: number): Promise<void> => {
    if (run.isStopped) return;
    if (index >= sentences.length) {
      run.isDone = true;
      settle();
      return;
    }
    try {
      const audio = await synthesizeNaturalVoice(sentences[index]);
      if (run.isStopped) return;
      play(audio.pcm, audio.sampleRate, sentences[index].length);
    } catch (error) {
      if (run.isStopped || isNaturalVoiceCancel(error)) return;
      console.error('The natural voice failed to read', error);
      reportBrowserVoice(
        'it failed while reading',
        { stage: 'natural voice synthesis', detail: describeThrown(error) },
        [`Sentence: ${index + 1} of ${sentences.length}`],
      );
      giveUpOn(index);
      return;
    }
    await synthesizeFrom(index + 1);
  };

  run.startId = window.setTimeout(() => {
    if (run.isStarted || run.isStopped) return;
    cancelNaturalSynthesis();
    recordSlowNaturalReading();
    if (getNaturalVoiceState().status !== 'failed') {
      reportBrowserVoice('it was too slow to start', {
        stage: 'natural voice start timed out',
        detail: `No sound within ${NATURAL_START_TIMEOUT_MS} ms`,
      });
    }
    giveUpOn(0);
  }, NATURAL_START_TIMEOUT_MS);

  synthesizeFrom(0).catch((error: unknown) => {
    console.error('The natural voice failed to read', error);
    if (run.isStopped) return;
    reportBrowserVoice('it failed while reading', {
      stage: 'natural voice reading',
      detail: describeThrown(error),
    });
    giveUpOn(0);
  });

  return () => {
    if (run.isStopped || run.isEnded) return;
    run.isStopped = true;
    window.clearTimeout(run.startId);
    window.clearInterval(run.progressId);
    cancelNaturalSynthesis();
    run.sources.forEach((source) => {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // A source that already ended cannot be stopped again.
      }
    });
    run.sources.clear();
    run.stopFallback?.();
    end();
  };
};

/**
 * Reads `text` aloud (measures, fractions and temperatures written out first, `toSpokenText`), cancelling whatever was being read, and returns a function that stops it. With `isNatural` and the
 * natural voice ready it speaks sentence by sentence (the first is heard as soon as it is made); if that voice fails or
 * is too slow, the rest is read by the browser's voice, so a reading is never lost. Where no voice works it calls `onEnd`
 * at once.
 */
export function readAloud(text: string, options: ReadAloudOptions): () => void {
  const context = getAudioContext();
  const spokenText = toSpokenText(text);
  const sentences = splitSentences(spokenText);
  const canUseNatural =
    options.isNatural === true &&
    context !== null &&
    sentences.length > 0 &&
    isNaturalVoiceLang(options.lang) &&
    getNaturalVoiceState().status === 'ready';
  if (!canUseNatural) {
    const block =
      options.isNatural === true && sentences.length > 0
        ? toNaturalBlock(options, context)
        : null;
    if (block !== null && getNaturalVoiceState().status !== 'failed') {
      reportBrowserVoice(block, {
        stage: 'natural voice not usable',
        detail: block,
      });
    }
    options.onVoice?.('system');
    return speakText(spokenText, options);
  }
  return readNatural(sentences, context, options);
}
