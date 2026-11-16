import type {
  SpeechHeldReason,
  SpeechPriority,
} from '@/lib/speech/voice/types';

export type SpeechFetch =
  | {
      status: 'ready';
      body: ReadableStream<Uint8Array>;
      provider: string;
      contentType: string;
    }
  | { status: 'held'; reason: SpeechHeldReason }
  | { status: 'unavailable'; detail?: string };

export interface SpeechVoice {
  voiceId: string | null;
  speed: number | null;
}

export interface SpeechSource {
  fetchSpeech: (
    text: string,
    priority: SpeechPriority,
    signal: AbortSignal,
    voice?: SpeechVoice,
  ) => Promise<SpeechFetch>;
}

const isHeldReason = (value: unknown): value is SpeechHeldReason =>
  value === 'speechLimit' || value === 'budgetReached';

/** Asks the app's speech endpoint for audio. */
export const createSpeechSource = ({
  appId,
  url,
  getHeaders,
  readVoice,
}: {
  appId: string;
  url: string;
  getHeaders: () => Promise<Record<string, string> | null>;
  readVoice?: () => SpeechVoice;
}): SpeechSource => ({
  fetchSpeech: async (text, priority, signal, voice) => {
    try {
      const headers = await getHeaders();
      if (headers === null) {
        return { status: 'unavailable', detail: 'No sign-in headers yet' };
      }
      const { voiceId, speed } = voice ??
        readVoice?.() ?? { voiceId: null, speed: null };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          appId,
          text,
          priority,
          voiceId,
          speed,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        signal,
      });
      if (response.status === 429) {
        const answer = (await response.json()) as { reason?: unknown };
        return isHeldReason(answer.reason)
          ? { status: 'held', reason: answer.reason }
          : { status: 'unavailable', detail: 'HTTP 429' };
      }
      if (!response.ok || response.body === null) {
        return {
          status: 'unavailable',
          detail: response.ok ? 'No body' : `HTTP ${response.status}`,
        };
      }
      return {
        status: 'ready',
        body: response.body,
        provider: response.headers.get('X-Voice-Provider') ?? 'unknown',
        contentType: response.headers.get('Content-Type') ?? '',
      };
    } catch (error) {
      return {
        status: 'unavailable',
        detail:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
      };
    }
  },
});

/** Whether the person picked a different voice or speed than the one a conversation is speaking with. */
export const isOtherVoice = (
  held: SpeechVoice | null,
  wanted: SpeechVoice | null,
) =>
  held !== null &&
  wanted !== null &&
  (held.voiceId !== wanted.voiceId || held.speed !== wanted.speed);

/** A source that always speaks with this voice and speed. */
export const withSpeechVoice = (
  source: SpeechSource,
  voice: SpeechVoice,
): SpeechSource => ({
  fetchSpeech: (text, priority, signal) =>
    source.fetchSpeech(text, priority, signal, voice),
});

interface CachedSpeech {
  chunks: Uint8Array[];
  provider: string;
  contentType: string;
}

/** The last few lines' audio, kept for the session so a replay costs no request. */
export const createSpeechCache = (limit = 10) => {
  const lines = new Map<string, CachedSpeech>();
  return {
    get: (key: string) => lines.get(key),
    set: (key: string, speech: CachedSpeech) => {
      lines.delete(key);
      lines.set(key, speech);
      [...lines.keys()]
        .slice(0, Math.max(0, lines.size - limit))
        .forEach((oldest) => lines.delete(oldest));
    },
  };
};

const toStream = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start: (controller) => {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });

/** A source that answers a line it has already fetched from `cache` (by voice and text) and keeps each answer it reads to the end. */
export const withSpeechCache = (
  source: SpeechSource,
  cache: ReturnType<typeof createSpeechCache>,
  voiceKey: string,
): SpeechSource => ({
  fetchSpeech: async (text, priority, signal, voice) => {
    const key = `${voiceKey}|${text}`;
    const hit = cache.get(key);
    if (hit) {
      return {
        status: 'ready',
        body: toStream(hit.chunks),
        provider: hit.provider,
        contentType: hit.contentType,
      };
    }
    const answer = await source.fetchSpeech(text, priority, signal, voice);
    if (answer.status !== 'ready') return answer;
    const chunks: Uint8Array[] = [];
    return {
      ...answer,
      body: answer.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform: (chunk, controller) => {
            chunks.push(chunk);
            controller.enqueue(chunk);
          },
          flush: () => {
            if (chunks.length > 0) {
              cache.set(key, {
                chunks,
                provider: answer.provider,
                contentType: answer.contentType,
              });
            }
          },
        }),
      ),
    };
  },
});
