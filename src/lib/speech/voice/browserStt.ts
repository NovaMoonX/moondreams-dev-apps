import {
  canUseSpeechCommands,
  createSpeechListener,
  type SpeechCommandsError,
} from '@/hooks/useSpeechCommands';
import type { SttAdapter, SttErrorCode } from '@/lib/speech/voice/types';

const toErrorCode = (error: SpeechCommandsError): SttErrorCode =>
  error === 'idle' ? 'unavailable' : error;

/** Whether the browser can listen on this page. */
export const canUseBrowserStt = canUseSpeechCommands;

const refused = { arePhrasesRefused: false };

/** Listens with the browser's speech recognition (Chrome sends this audio to its vendor's servers). `stop` delivers what was heard, finished phrases and the one still being said, once; a page that goes to the background stops the same way. */
export const createBrowserStt = ({
  lang,
  nameHints = null,
}: {
  lang: string;
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
      const heard = { finals: [] as string[], interim: '', isHeard: false };
      const state = { isDone: false };
      const listener = createSpeechListener(
        () => undefined,
        (error) => {
          if (error !== null) options.onError(toErrorCode(error));
        },
      );
      const read = () => [...heard.finals, heard.interim].join(' ').trim();
      const hear = () => {
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
      listener.start();
    },
    stop: () => run.stop?.(),
  };
};
