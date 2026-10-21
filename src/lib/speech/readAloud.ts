import { getAudioContext } from '@/lib/speech/audioContext';
import {
  isNaturalVoiceLang,
  NATURAL_START_TIMEOUT_MS,
} from '@/lib/speech/naturalVoice/config';
import {
  cancelNaturalSynthesis,
  getNaturalVoiceState,
  isNaturalVoiceCancel,
  recordFastNaturalReading,
  recordSlowNaturalReading,
  synthesizeNaturalVoice,
} from '@/lib/speech/naturalVoice/naturalVoiceEngine';
import { splitSentences } from '@/lib/speech/naturalVoice/sentences';
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
}

interface Run {
  isStopped: boolean;
  isDone: boolean;
  isStarted: boolean;
  isEnded: boolean;
  playUntil: number;
  rest: string | null;
  sources: Set<AudioBufferSourceNode>;
  startId: number;
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
    sources: new Set(),
    startId: 0,
    stopFallback: null,
  };

  const end = () => {
    if (run.isEnded) return;
    run.isEnded = true;
    window.clearTimeout(run.startId);
    options.onEnd?.();
  };

  const speakRest = (rest: string) => {
    run.stopFallback = speakText(rest, {
      lang: options.lang,
      startTimeoutMs: options.startTimeoutMs,
      onNoStart: options.onNoStart,
      onStart: () => {
        if (run.isStarted) return;
        run.isStarted = true;
        options.onStart?.();
      },
      onEnd: end,
    });
  };

  const settle = () => {
    if (!run.isDone || run.sources.size > 0 || run.isStopped || run.isEnded) {
      return;
    }
    if (run.rest === null) end();
    else speakRest(run.rest);
  };

  const play = (pcm: Float32Array, sampleRate: number) => {
    const buffer = context.createBuffer(1, pcm.length, sampleRate);
    buffer.copyToChannel(new Float32Array(pcm), 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.02, run.playUntil);
    run.playUntil = startAt + buffer.duration;
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
    options.onStart?.();
  };

  const giveUpOn = (from: number) => {
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
      play(audio.pcm, audio.sampleRate);
    } catch (error) {
      if (run.isStopped || isNaturalVoiceCancel(error)) return;
      console.error('The natural voice failed to read', error);
      giveUpOn(index);
      return;
    }
    await synthesizeFrom(index + 1);
  };

  run.startId = window.setTimeout(() => {
    if (run.isStarted || run.isStopped) return;
    cancelNaturalSynthesis();
    recordSlowNaturalReading();
    giveUpOn(0);
  }, NATURAL_START_TIMEOUT_MS);

  synthesizeFrom(0).catch((error: unknown) => {
    console.error('The natural voice failed to read', error);
    if (!run.isStopped) giveUpOn(0);
  });

  return () => {
    if (run.isStopped || run.isEnded) return;
    run.isStopped = true;
    window.clearTimeout(run.startId);
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
 * Reads `text` aloud, cancelling whatever was being read, and returns a function that stops it. With `isNatural` and the
 * natural voice ready it speaks sentence by sentence (the first is heard as soon as it is made); if that voice fails or
 * is too slow, the rest is read by the browser's voice, so a reading is never lost. Where no voice works it calls `onEnd`
 * at once.
 */
export function readAloud(text: string, options: ReadAloudOptions): () => void {
  const context = getAudioContext();
  const sentences = splitSentences(text);
  const canUseNatural =
    options.isNatural === true &&
    context !== null &&
    sentences.length > 0 &&
    isNaturalVoiceLang(options.lang) &&
    getNaturalVoiceState().status === 'ready';
  if (!canUseNatural) return speakText(text, options);
  return readNatural(sentences, context, options);
}
