import { TextToSpeechClient } from '@google-cloud/text-to-speech';

import { failedSpeech, type TtsProvider } from './types.js';

const SAMPLE_RATE = 24_000;

// gRPC status codes, answered as the HTTP-like statuses the rest of the voice code reads.
const STATUS_BY_CODE: Record<number, number> = {
  3: 400,
  7: 403,
  8: 429,
  14: 503,
  16: 401,
};
const CANCELLED = 1;

interface SynthesisRequest {
  streamingConfig?: {
    voice: { languageCode: string; name: string };
    streamingAudioConfig: {
      audioEncoding: 'PCM';
      sampleRateHertz: number;
      speakingRate: number;
    };
  };
  input?: { text: string };
}

/** The part of the duplex call the provider uses. */
export interface SynthesisCall {
  write(request: SynthesisRequest): unknown;
  end(): unknown;
  cancel(): void;
  on(
    event: 'data',
    listener: (response: { audioContent?: unknown }) => void,
  ): unknown;
  on(event: 'error', listener: (error: { code?: unknown }) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

export interface GoogleTtsClient {
  streamingSynthesize(): SynthesisCall;
}

const toBytes = (audio: unknown) =>
  audio instanceof Uint8Array
    ? audio
    : typeof audio === 'string'
      ? new Uint8Array(Buffer.from(audio, 'base64'))
      : new Uint8Array(0);

const toFailure = (error: { code?: unknown }) =>
  failedSpeech(
    'googleTts',
    typeof error.code === 'number' ? (STATUS_BY_CODE[error.code] ?? 500) : 500,
  );

export function createGoogleTts({
  projectId,
  client = new TextToSpeechClient({
    projectId,
    quotaProjectId: projectId,
  }) as unknown as GoogleTtsClient,
}: {
  projectId: string;
  client?: GoogleTtsClient;
}): TtsProvider {
  return {
    id: 'googleTts',
    // Streaming synthesis takes plain text and raw PCM only, so `format` is ignored.
    async speak({ text, voiceId, speed = 1, signal }) {
      const call = client.streamingSynthesize();
      const state = { isOver: false, carry: new Uint8Array(0) };
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const finish = (action: () => void) => {
            if (state.isOver) return;
            state.isOver = true;
            signal?.removeEventListener('abort', onAbort);
            action();
          };
          const onAbort = () =>
            finish(() => {
              call.cancel();
              controller.error(signal?.reason ?? new Error('Aborted'));
            });
          if (signal?.aborted) {
            onAbort();
            return;
          }
          signal?.addEventListener('abort', onAbort, { once: true });
          call.on('data', (response) => {
            if (state.isOver) return;
            const bytes = toBytes(response.audioContent);
            const joined = new Uint8Array(state.carry.length + bytes.length);
            joined.set(state.carry);
            joined.set(bytes, state.carry.length);
            // A response may end mid-sample; the odd byte waits for the next one.
            const whole = joined.length - (joined.length % 2);
            state.carry = joined.slice(whole);
            if (whole > 0) controller.enqueue(joined.slice(0, whole));
          });
          call.on('error', (error) =>
            finish(() =>
              error.code === CANCELLED
                ? controller.close()
                : controller.error(toFailure(error)),
            ),
          );
          call.on('end', () => finish(() => controller.close()));
          call.write({
            streamingConfig: {
              voice: { languageCode: 'en-US', name: voiceId },
              streamingAudioConfig: {
                audioEncoding: 'PCM',
                sampleRateHertz: SAMPLE_RATE,
                speakingRate: speed,
              },
            },
          });
          call.write({ input: { text } });
          call.end();
        },
        cancel() {
          state.isOver = true;
          call.cancel();
        },
      });
      return {
        stream,
        contentType: `audio/L16; rate=${SAMPLE_RATE}; channels=1`,
      };
    },
  };
}
