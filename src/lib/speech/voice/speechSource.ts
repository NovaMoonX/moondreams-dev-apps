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
  | { status: 'unavailable' };

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
      if (headers === null) return { status: 'unavailable' };
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
          : { status: 'unavailable' };
      }
      if (!response.ok || response.body === null) {
        return { status: 'unavailable' };
      }
      return {
        status: 'ready',
        body: response.body,
        provider: response.headers.get('X-Voice-Provider') ?? 'unknown',
        contentType: response.headers.get('Content-Type') ?? '',
      };
    } catch {
      return { status: 'unavailable' };
    }
  },
});

/** A source that always speaks with this voice and speed. */
export const withSpeechVoice = (
  source: SpeechSource,
  voice: SpeechVoice,
): SpeechSource => ({
  fetchSpeech: (text, priority, signal) =>
    source.fetchSpeech(text, priority, signal, voice),
});
