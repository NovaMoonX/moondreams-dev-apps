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

/** What a running listener had heard when it was handed over, with the phrase that opened the turn to take off the front of the words. */
export interface BrowserSttAdoption {
  listener: ReturnType<typeof createSpeechListener>;
  heard: { text: string; isFinal: boolean };
  spellings: readonly string[];
}

/** Listens with the browser's speech recognition (Chrome sends this audio to its vendor's servers). `stop` delivers what was heard, finished phrases and the one still being said, once; a page that goes to the background stops the same way. An `adopt`ed listener is already running: it carries on as this listener, with no restart, and the phrase it heard first is left out of the words. */
export const createBrowserStt = ({
  lang,
  adopt = null,
  isFromTap = true,
}: {
  lang: string;
  adopt?: BrowserSttAdoption | null;
  /** False when no tap caused this listen, so the browser's voice is not readied for it. */
  isFromTap?: boolean;
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
      const read = () => {
        const text = [...heard.finals, heard.interim].join(' ').trim();
        return adopt
          ? (readWakePhrase(text, adopt.spellings)?.rests[0] ?? text)
          : text;
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
