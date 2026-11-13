import type {
  SpeechHeldReason,
  SpeechPriority,
} from '@/lib/speech/voice/types';

export type SpeechFetch =
  | {
      status: 'ready';
      body: ReadableStream<Uint8Array>;
      provider: string;
    }
  | { status: 'held'; reason: SpeechHeldReason }
  | { status: 'unavailable' };

export interface SpeechSource {
  fetchSpeech: (
    text: string,
    priority: SpeechPriority,
    signal: AbortSignal,
  ) => Promise<SpeechFetch>;
}

const isHeldReason = (value: unknown): value is SpeechHeldReason =>
  value === 'speechLimit' || value === 'budgetReached';

/** Asks the app's speech endpoint for audio; `getHeaders` supplies the credentials, or null when there are none. */
export const createSpeechSource = ({
  appId,
  url,
  getHeaders,
}: {
  appId: string;
  url: string;
  getHeaders: () => Promise<Record<string, string> | null>;
}): SpeechSource => ({
  fetchSpeech: async (text, priority, signal) => {
    try {
      const headers = await getHeaders();
      if (headers === null) return { status: 'unavailable' };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          appId,
          text,
          priority,
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
      };
    } catch {
      return { status: 'unavailable' };
    }
  },
});
