import type { ModelUsageCounts } from '@/lib/speech/assistant/assistantTypes';

/** What a streamed assistant turn sends back, in order: words as they are written, a lookup starting, a tap to make on the screen, then the end. */
export type AssistantTurnEvent =
  | { type: 'text'; text: string }
  | { type: 'searching' }
  | { type: 'action'; id: string; name: string; input: unknown }
  | {
      type: 'done';
      user: string;
      assistant: string;
      endedBy: 'answered' | 'refused' | 'limit' | 'aborted';
      searches: number;
      usage: ModelUsageCounts;
      ms: number;
    }
  | { type: 'error'; code: string };

export type AssistantTurnResult =
  | { status: 'done'; done: Extract<AssistantTurnEvent, { type: 'done' }> }
  | { status: 'held'; reason: string }
  | { status: 'failed'; code: string };

const readEvent = (chunk: string): AssistantTurnEvent | null => {
  const data = chunk
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (data === '') return null;
  try {
    const event: unknown = JSON.parse(data);
    return typeof event === 'object' &&
      event !== null &&
      typeof (event as { type?: unknown }).type === 'string'
      ? (event as AssistantTurnEvent)
      : null;
  } catch {
    return null;
  }
};

const readRefusal = async (
  response: Response,
): Promise<AssistantTurnResult> => {
  const body = (await response.json().catch(() => ({}))) as {
    error?: unknown;
    reason?: unknown;
  };
  if (response.status === 429) {
    return {
      status: 'held',
      reason: typeof body.reason === 'string' ? body.reason : 'held',
    };
  }
  return {
    status: 'failed',
    code:
      typeof body.error === 'string' ? body.error : `http${response.status}`,
  };
};

/** Posts one turn to a streamed assistant endpoint and hands each event on as it arrives; resolves once the stream ends, with how it ended. */
export async function streamAssistantTurn({
  url,
  headers,
  body,
  signal,
  onEvent,
}: {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal: AbortSignal;
  onEvent: (event: AssistantTurnEvent) => void;
}): Promise<AssistantTurnResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  }).catch((error: unknown) => error);
  if (!(response instanceof Response)) {
    return {
      status: 'failed',
      code: signal.aborted ? 'aborted' : 'network',
    };
  }
  if (!response.ok || response.body === null) return readRefusal(response);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = {
    buffer: '',
    result: null as AssistantTurnResult | null,
  };
  const take = (event: AssistantTurnEvent) => {
    onEvent(event);
    if (event.type === 'done') state.result = { status: 'done', done: event };
    if (event.type === 'error') {
      state.result = { status: 'failed', code: event.code };
    }
  };
  const pump = async (): Promise<void> => {
    const { done, value } = await reader.read();
    state.buffer += decoder.decode(value, { stream: !done });
    const chunks = state.buffer.split('\n\n');
    state.buffer = done ? '' : (chunks.pop() ?? '');
    chunks
      .map(readEvent)
      .filter((event): event is AssistantTurnEvent => event !== null)
      .forEach(take);
    if (!done) await pump();
  };
  await pump().catch(() => undefined);
  return (
    state.result ?? {
      status: 'failed',
      code: signal.aborted ? 'aborted' : 'cut',
    }
  );
}
