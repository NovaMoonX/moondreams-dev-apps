import {
  startPcmCapture,
  PCM_SAMPLE_RATE,
} from '@/lib/speech/voice/pcmWorklet';
import type {
  CloudHeldReason,
  FrameSource,
  SttAdapter,
} from '@/lib/speech/voice/types';
import type { VoiceTokenAnswer } from '@/lib/speech/voice/voiceToken';

const LISTEN_URL = 'wss://api.deepgram.com/v1/listen';
const OPEN_WAIT_MS = 3000;
const CLOSE_WAIT_MS = 1500;
const KEEP_ALIVE_MS = 5000;
// A token lasts a minute, so a stream ends just inside it.
const UTTERANCE_MS = 59_000;
const BUFFER_FRAMES = 500;

interface DeepgramSttOptions {
  lang: string;
  getToken: () => Promise<VoiceTokenAnswer>;
  tokenWaitMs?: number;
  /** A microphone already open (a speech gate that heard the person start): its pre-roll is sent first, then its live frames, and the stream releases it when it ends. Without one the stream opens the microphone itself. */
  source?: FrameSource | null;
  /** The cloud could not take this listen; `reason` is the limit that held it, null for any other cause. Nothing was delivered. */
  onUnavailable: (reason: CloudHeldReason | null) => void;
  /** A minted stream has ended, after `ms` open (0 when it never opened). */
  onClosed: (mintId: string, ms: number) => void;
  /** Set once when the stream connects, never changed mid-stream. */
  keyterms?: string[] | null;
}

interface Heard {
  isFinal: boolean;
  text: string;
}

const readHeard = (data: unknown): Heard | null => {
  try {
    const message: unknown = JSON.parse(String(data));
    if (typeof message !== 'object' || message === null) return null;
    const {
      type,
      is_final: isFinal,
      channel,
    } = message as {
      type?: unknown;
      is_final?: unknown;
      channel?: { alternatives?: { transcript?: unknown }[] };
    };
    if (type !== 'Results') return null;
    const text = channel?.alternatives?.[0]?.transcript;
    return {
      isFinal: isFinal === true,
      text: typeof text === 'string' ? text : '',
    };
  } catch {
    return null;
  }
};

export const toListenUrl = (
  model: string,
  lang: string,
  keyterms: string[] | null,
) => {
  const params = new URLSearchParams({
    model,
    language: lang,
    encoding: 'linear16',
    sample_rate: String(PCM_SAMPLE_RATE),
    channels: '1',
    interim_results: 'true',
    smart_format: 'true',
    endpointing: '300',
    mip_opt_out: 'true',
  });
  if (model.startsWith('nova-3')) {
    keyterms?.forEach((term) => params.append('keyterm', term));
  }
  return `${LISTEN_URL}?${params.toString()}`;
};

/** Listens by streaming the microphone to Deepgram with a token minted for this stream. Nothing said while the socket opens is lost. `stop` (or a minute, or a page that goes to the background) delivers what was heard once, finished phrases and the one still being said. */
export const createDeepgramStt = ({
  lang,
  getToken,
  tokenWaitMs = 1500,
  source = null,
  onUnavailable,
  onClosed,
  keyterms = null,
}: DeepgramSttOptions): SttAdapter => {
  const run = {
    stop: null as (() => void) | null,
    cancel: null as (() => void) | null,
    asked: null as 'stop' | 'cancel' | null,
  };
  return {
    id: 'deepgram',
    route: 'cloud',
    canStream: true,
    start: async (options) => {
      run.asked = null;
      const tokenRequest = getToken().catch(() => null);
      const releaseToken = () =>
        void tokenRequest.then((answer) => {
          if (answer?.status === 'ready') onClosed(answer.mintId, 0);
        });
      const stream = source
        ? null
        : await navigator.mediaDevices
            .getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1,
              },
            })
            .catch((error: unknown) => {
              const name = error instanceof DOMException ? error.name : '';
              if (name === 'NotAllowedError' || name === 'SecurityError') {
                options.onError('denied');
              } else if (name === 'NotFoundError') {
                options.onError('no-microphone');
              } else onUnavailable(null);
              return null;
            });
      if (!source && !stream) {
        releaseToken();
        return;
      }
      if (run.asked !== null) {
        stream?.getTracks().forEach((track) => track.stop());
        source?.stop();
        releaseToken();
        options.onFinal('');
        return;
      }

      const state = {
        isDone: false,
        isOpen: false,
        isClosing: false,
        openedAt: 0,
        mintId: '',
        socket: null as WebSocket | null,
        capture: null as { stop: () => void } | null,
        frames: [] as ArrayBuffer[],
        finals: [] as string[],
        interim: '',
        isHeard: false,
        openId: 0,
        closeId: 0,
        keepAliveId: 0,
        limitId: 0,
      };
      const read = () => [...state.finals, state.interim].join(' ').trim();
      const releaseMicrophone = () => {
        stream?.getTracks().forEach((track) => track.stop());
        source?.stop();
        state.capture?.stop();
        state.capture = null;
      };
      const handleVisibility = () => {
        if (document.visibilityState === 'hidden') stop();
      };
      const teardown = () => {
        run.stop = null;
        run.cancel = null;
        document.removeEventListener('visibilitychange', handleVisibility);
        window.clearTimeout(state.openId);
        window.clearTimeout(state.closeId);
        window.clearTimeout(state.limitId);
        window.clearInterval(state.keepAliveId);
        releaseMicrophone();
        const { socket } = state;
        state.socket = null;
        if (socket) {
          socket.onopen = null;
          socket.onerror = null;
          socket.onclose = null;
          socket.onmessage = null;
          socket.close();
        }
      };
      const fail = (reason: CloudHeldReason | null) => {
        if (state.isClosing) {
          deliver();
          return;
        }
        if (state.isDone) return;
        state.isDone = true;
        teardown();
        if (state.mintId) onClosed(state.mintId, 0);
        onUnavailable(reason);
      };
      const deliver = () => {
        if (state.isDone) return;
        state.isDone = true;
        const text = read();
        teardown();
        if (state.mintId) {
          onClosed(
            state.mintId,
            state.isOpen ? Date.now() - state.openedAt : 0,
          );
        }
        options.onFinal(text);
      };
      const cancel = () => {
        if (state.isDone) return;
        state.isDone = true;
        teardown();
        if (state.mintId) {
          onClosed(
            state.mintId,
            state.isOpen ? Date.now() - state.openedAt : 0,
          );
        }
        options.onFinal('');
      };
      function stop() {
        if (state.isDone || state.isClosing) return;
        state.isClosing = true;
        releaseMicrophone();
        if (!state.isOpen) return;
        state.socket?.send(JSON.stringify({ type: 'CloseStream' }));
        state.closeId = window.setTimeout(deliver, CLOSE_WAIT_MS);
      }
      const send = (frame: ArrayBuffer) => {
        if (state.isOpen && !state.isClosing) state.socket?.send(frame);
        else if (!state.isOpen) {
          state.frames = [...state.frames, frame].slice(-BUFFER_FRAMES);
        }
      };

      document.addEventListener('visibilitychange', handleVisibility);
      run.stop = stop;
      run.cancel = cancel;
      if (source) {
        source.preRoll.forEach(send);
        source.subscribe(send);
      } else if (stream) {
        startPcmCapture({ stream, onFrame: send }).then(
          (capture) => {
            if (state.isDone || state.isClosing) capture.stop();
            else state.capture = capture;
          },
          (error: unknown) => {
            console.error('Microphone capture did not start', error);
            fail(null);
          },
        );
      }

      const timeout = new Promise<null>((resolve) =>
        window.setTimeout(() => resolve(null), tokenWaitMs),
      );
      const answer = await Promise.race([tokenRequest, timeout]);
      if (state.isDone || answer === null) releaseToken();
      if (state.isDone) return;
      if (answer === null || answer.status === 'held') {
        fail(
          answer?.status === 'held' && answer.reason !== 'unavailable'
            ? answer.reason
            : null,
        );
        return;
      }

      state.mintId = answer.mintId;
      const socket = new WebSocket(toListenUrl(answer.model, lang, keyterms), [
        'bearer',
        answer.token,
      ]);
      state.socket = socket;
      state.openId = window.setTimeout(() => fail(null), OPEN_WAIT_MS);
      socket.onopen = () => {
        window.clearTimeout(state.openId);
        state.isOpen = true;
        state.openedAt = Date.now();
        state.frames.forEach((frame) => socket.send(frame));
        state.frames = [];
        if (state.isClosing) {
          socket.send(JSON.stringify({ type: 'CloseStream' }));
          state.closeId = window.setTimeout(deliver, CLOSE_WAIT_MS);
          return;
        }
        state.keepAliveId = window.setInterval(
          () => socket.send(JSON.stringify({ type: 'KeepAlive' })),
          KEEP_ALIVE_MS,
        );
        state.limitId = window.setTimeout(stop, UTTERANCE_MS);
      };
      socket.onerror = () => {
        if (!state.isOpen) fail(null);
      };
      socket.onclose = () => (state.isOpen ? deliver() : fail(null));
      socket.onmessage = (event: MessageEvent) => {
        const heard = readHeard(event.data);
        if (!heard || state.isDone) return;
        if (heard.text === '' && !state.isHeard) return;
        if (heard.isFinal) {
          state.finals = heard.text
            ? [...state.finals, heard.text]
            : state.finals;
          state.interim = '';
        } else state.interim = heard.text;
        if (!state.isHeard) options.onSpeechStart();
        state.isHeard = true;
        options.onPartial(read());
      };
    },
    stop: () => {
      if (run.stop) run.stop();
      else run.asked = 'stop';
    },
    cancel: () => {
      if (run.cancel) run.cancel();
      else run.asked = 'cancel';
    },
  };
};
