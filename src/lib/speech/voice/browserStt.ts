import {
  canUseSpeechCommands,
  createSpeechListener,
  type SpeechCommandsError,
} from '@/hooks/useSpeechCommands';
import { readWakePhrase } from '@/lib/speech/speechText';
import type { SttAdapter, SttErrorCode } from '@/lib/speech/voice/types';

const toErrorCode = (error: SpeechCommandsError): SttErrorCode =>
  error === 'idle' ? 'unavailable' : error;

/** Whether the browser can listen on this page. */
export const canUseBrowserStt = canUseSpeechCommands;

const refused = { arePhrasesRefused: false };

/** What a running listener had heard when it was handed over, with the phrase that opened the turn to take off the front of the words. */
export interface BrowserSttAdoption {
  listener: ReturnType<typeof createSpeechListener>;
  heard: { text: string; isFinal: boolean };
  spellings: readonly string[];
  looseNames: readonly string[];
}

/** Listens with the browser's speech recognition (Chrome sends this audio to its vendor's servers). `stop` delivers what was heard, finished phrases and the one still being said, once; a page that goes to the background stops the same way. An `adopt`ed listener is already running: it carries on as this listener, with no restart, and the phrase it heard first is left out of the words. */
export const createBrowserStt = ({
  lang,
  adopt = null,
  isFromTap = true,
  nameHints = null,
}: {
  lang: string;
  adopt?: BrowserSttAdoption | null;
  /** False when no tap caused this listen, so the browser's voice is not readied for it. */
  isFromTap?: boolean;
  nameHints?: string[] | null;
}): SttAdapter => {
  const run = { stop: null as (() => void) | null };
  return {
    id: 'browser',
    route: 'device',
    canStream: true,
    start: async (options) => {
      run.stop?.();
      if (!canUseSpeechCommands()) {
        options.onError('unavailable');
        return;
      }
      const heard = {
        finals: adopt?.heard.isFinal ? [adopt.heard.text] : [],
        interim: adopt && !adopt.heard.isFinal ? adopt.heard.text : '',
        isHeard: false,
      };
      const state = { isDone: false };
      const listener =
        adopt?.listener ??
        createSpeechListener(
          () => undefined,
          () => undefined,
        );
      const toWords = (text: string) => text.split(/\s+/).filter(Boolean);
      // When a revision no longer reads as the phrase ("hey no moss"), as many words as the phrase took are dropped instead.
      const phraseWords = adopt
        ? toWords(adopt.heard.text).length -
          toWords(
            readWakePhrase(adopt.heard.text, adopt.spellings, adopt.looseNames)
              ?.rests[0] ?? '',
          ).length
        : 0;
      const read = () => {
        const text = [...heard.finals, heard.interim].join(' ').trim();
        if (!adopt) return text;
        return (
          readWakePhrase(text, adopt.spellings, adopt.looseNames)?.rests[0] ??
          toWords(text).slice(phraseWords).join(' ')
        );
      };
      const hear = () => {
        if (read() === '') return;
        if (!heard.isHeard) options.onSpeechStart();
        heard.isHeard = true;
        options.onPartial(read());
      };
      const handleVisibility = () => {
        if (document.visibilityState === 'hidden') stop();
      };
      function stop() {
        if (state.isDone) return;
        state.isDone = true;
        document.removeEventListener('visibilitychange', handleVisibility);
        const text = read();
        listener.stop();
        listener.teardown();
        run.stop = null;
        options.onFinal(text);
      }
      listener.setOptions({
        lang,
        speechLang: lang,
        phrases: refused.arePhrasesRefused ? null : nameHints,
        onPhrasesRefused: () => {
          refused.arePhrasesRefused = true;
        },
        onHalt: (error) => options.onError(toErrorCode(error)),
        onFinalTranscript: (alternatives) => {
          heard.finals = [...heard.finals, alternatives[0]];
          heard.interim = '';
          hear();
          return true;
        },
        onInterimTranscript: (text) => {
          heard.interim = text;
          hear();
        },
      });
      document.addEventListener('visibilitychange', handleVisibility);
      run.stop = stop;
      if (adopt) hear();
      else listener.start({ isFromTap });
    },
    stop: () => run.stop?.(),
  };
};
