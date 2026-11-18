import {
  startPcmCapture,
  PCM_SAMPLE_RATE,
} from '@/lib/speech/voice/pcmWorklet';
import type {
  CloudHeldReason,
  FrameSource,
  SttAdapter,
} from '@/lib/speech/voice/types';
import {
  describeThrown,
  recordSpeechEvent,
} from '@/lib/speech/speechDiagnostics';
import {
  CLOUD_LISTEN_STAGES,
  type CloudListenCause,
} from '@/lib/speech/voice/cloudListenStages';
import type { VoiceTokenAnswer } from '@/lib/speech/voice/voiceToken';

const LISTEN_URL = 'wss://api.deepgram.com/v1/listen';
const OPEN_WAIT_MS = 3000;
const CLOSE_WAIT_MS = 1500;
const KEEP_ALIVE_MS = 5000;
// A token lasts a minute, so a stream ends just inside it.
const UTTERANCE_MS = 59_000;
const BUFFER_FRAMES = 500;

type TokenOutcome =
  | VoiceTokenAnswer
  | { status: 'threw'; detail: string }
  | { status: 'timeout' };

const toTokenCause = (
  outcome: Exclude<TokenOutcome, { status: 'ready' }>,
  waitedMs: number,
): CloudListenCause => {
  if (outcome.status === 'threw') {
    return {
      stage: CLOUD_LISTEN_STAGES.tokenRequest,
      detail: outcome.detail,
      facts: [],
    };
  }
  if (outcome.status === 'timeout') {
    return {
      stage: CLOUD_LISTEN_STAGES.tokenTimeout,
      detail: `No token within ${waitedMs} ms`,
      facts: [`Waited: ${waitedMs} ms`],
    };
  }
  return outcome.reason === 'unavailable'
    ? { ...outcome.cause, facts: [] }
    : {
        stage: CLOUD_LISTEN_STAGES.tokenHeld,
        detail: `The server held this listen: ${outcome.reason}`,
        facts: [],
      };
};

const toCloseCause = (
  event: CloseEvent,
  hasErrored: boolean,
): CloudListenCause => ({
  stage: hasErrored
    ? CLOUD_LISTEN_STAGES.socketError
    : CLOUD_LISTEN_STAGES.socketClosed,
  detail: `Close code ${event.code}, reason ${event.reason === '' ? 'none' : `"${event.reason}"`}, ${event.wasClean ? 'clean' : 'not clean'}${hasErrored ? ', after an error event' : ''}`,
  facts: [
    `Close code: ${event.code}`,
    `Close reason: ${event.reason === '' ? 'none' : event.reason}`,
    `Closed cleanly: ${event.wasClean ? 'yes' : 'no'}`,
  ],
});

interface DeepgramSttOptions {
  lang: string;
  getToken: () => Promise<VoiceTokenAnswer>;
  tokenWaitMs?: number;
  /** A microphone already open (a speech gate that heard the person start): its pre-roll is sent first, then its live frames, and the stream releases it when it ends. Without one the stream opens the microphone itself. */
  source?: FrameSource | null;
  /** `reason` is the limit that held it, null for any other cause. */
  onUnavailable: (
    reason: CloudHeldReason | null,
    cause: CloudListenCause,
  ) => void;
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

// A constructor's own message can quote the subprotocol, which is the token, so only its name is kept.
const openSocket = (url: string, token: string) => {
  try {
    return { socket: new WebSocket(url, ['bearer', token]), errorName: '' };
  } catch (error) {
    return {
      socket: null,
      errorName: error instanceof Error ? error.name : 'Error',
    };
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
      const tokenRequest = getToken().catch((error: unknown): TokenOutcome => ({
        status: 'threw',
        detail: describeThrown(error),
      }));
      const releaseToken = () =>
        void tokenRequest.then((answer) => {
          if (answer.status === 'ready') onClosed(answer.mintId, 0);
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
              recordSpeechEvent(
                `Cloud listening, getUserMedia refused: ${describeThrown(error)}`,
              );
              const name = error instanceof DOMException ? error.name : '';
              if (name === 'NotAllowedError' || name === 'SecurityError') {
                options.onError('denied');
              } else if (name === 'NotFoundError') {
                options.onError('no-microphone');
              } else {
                onUnavailable(null, {
                  stage: CLOUD_LISTEN_STAGES.microphoneOpen,
                  detail: describeThrown(error),
                  facts: [],
                });
              }
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
        hasErrored: false,
        isClosing: false,
        openedAt: 0,
        mintId: '',
        socket: null as WebSocket | null,
        capture: null as { stop: () => void } | null,
        frames: [] as ArrayBuffer[],
        finals: [] as string[],
        interim: '',
        isHeard: false,
        lastText: '',
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
      const fail = (
        reason: CloudHeldReason | null,
        cause: CloudListenCause,
      ) => {
        if (state.isClosing) {
          deliver();
          return;
        }
        if (state.isDone) return;
        state.isDone = true;
        teardown();
        if (state.mintId) onClosed(state.mintId, 0);
        recordSpeechEvent(
          `Cloud listening failed, ${cause.stage}: ${cause.detail}`,
        );
        onUnavailable(reason, cause);
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
            fail(null, {
              stage: CLOUD_LISTEN_STAGES.microphoneCapture,
              detail: describeThrown(error),
              facts: [],
            });
          },
        );
      }

      const timeout = new Promise<TokenOutcome>((resolve) =>
        window.setTimeout(() => resolve({ status: 'timeout' }), tokenWaitMs),
      );
      const answer = await Promise.race([tokenRequest, timeout]);
      if (state.isDone || answer.status !== 'ready') releaseToken();
      if (state.isDone) return;
      if (answer.status !== 'ready') {
        fail(
          answer.status === 'held' && answer.reason !== 'unavailable'
            ? answer.reason
            : null,
          toTokenCause(answer, tokenWaitMs),
        );
        return;
      }

      state.mintId = answer.mintId;
      const opened = openSocket(
        toListenUrl(answer.model, lang, keyterms),
        answer.token,
      );
      if (opened.socket === null) {
        fail(null, {
          stage: CLOUD_LISTEN_STAGES.socketConstruct,
          detail: opened.errorName,
          facts: [],
        });
        return;
      }
      const { socket } = opened;
      state.socket = socket;
      state.openId = window.setTimeout(
        () =>
          fail(null, {
            stage: CLOUD_LISTEN_STAGES.socketOpenTimeout,
            detail: `Not open after ${OPEN_WAIT_MS} ms${state.hasErrored ? ', after an error event' : ''}`,
            facts: [`Waited: ${OPEN_WAIT_MS} ms`],
          }),
        OPEN_WAIT_MS,
      );
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
        state.hasErrored = true;
      };
      socket.onclose = (event: CloseEvent) =>
        state.isOpen
          ? deliver()
          : fail(null, toCloseCause(event, state.hasErrored));
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
        const text = read();
        if (text === state.lastText) return;
        state.lastText = text;
        options.onPartial(text);
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
