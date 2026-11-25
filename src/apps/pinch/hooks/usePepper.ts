import { useCallback, useEffect, useRef, useState } from 'react';

import {
  streamAssistantTurn,
  type AssistantTurnEvent,
} from '@/lib/speech/assistant/streamAssistantTurn';
import { createSentenceFeed } from '@/lib/speech/assistant/sentenceFeed';
import {
  getHttpFunctionUrl,
  getSignedHeaders,
} from '@/lib/firebase/httpFunction';
import {
  appendExchange,
  trimHistory,
  type PepperLine,
} from '@apps/pinch/utils/pepperHistory';

export type PepperStatus = 'idle' | 'thinking' | 'speaking' | 'held' | 'failed';

export type PepperAction = Extract<AssistantTurnEvent, { type: 'action' }>;

export type PepperTrace = { at: number; text: string };

export type PepperQuestion = {
  standing: string;
  screen: string;
  heard: string;
  alternatives: string[];
};

type PepperOptions = {
  /** Says one line under the turn's key; `canAnswer` is true on the last line of a reply that asks a question. */
  speak: (
    text: string,
    options: { turnKey: number; canAnswer: boolean },
  ) => Promise<unknown> | void;
  onAction: (action: PepperAction) => void;
  onTrace?: (entry: PepperTrace) => void;
};

const ENDPOINT = 'pepperTurn';
const ENDS_WITH_QUESTION = /\?["'”’)]*\s*$/;

type Turn = { aborter: AbortController; key: number };

/** One cook's conversation with Pepper: sends each spoken question with the history so far, says the answer as it streams and hands each on-screen action to the caller. */
export function usePepper({ speak, onAction, onTrace }: PepperOptions) {
  const [status, setStatus] = useState<PepperStatus>('idle');
  const history = useRef<PepperLine[]>([]);
  const turn = useRef<Turn | null>(null);
  const lastKey = useRef(0);
  const isWarmed = useRef(false);
  const latest = useRef({ speak, onAction, onTrace });
  useEffect(() => {
    latest.current = { speak, onAction, onTrace };
  });

  const trace = useCallback((text: string) => {
    latest.current.onTrace?.({ at: Date.now(), text });
  }, []);

  const cancel = useCallback(() => {
    turn.current?.aborter.abort();
    turn.current = null;
    setStatus('idle');
  }, []);

  useEffect(
    () => () => {
      turn.current?.aborter.abort();
    },
    [],
  );

  const reset = useCallback(() => {
    history.current = [];
  }, []);

  const warm = useCallback(async () => {
    if (isWarmed.current) return;
    isWarmed.current = true;
    const headers = await getSignedHeaders().catch(() => null);
    if (headers === null) return;
    await fetch(getHttpFunctionUrl(ENDPOINT), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ warm: true }),
    }).catch(() => undefined);
  }, []);

  const ask = useCallback(
    async ({ standing, screen, heard, alternatives }: PepperQuestion) => {
      turn.current?.aborter.abort();
      const current: Turn = {
        aborter: new AbortController(),
        key: Math.max(Date.now(), lastKey.current + 1),
      };
      lastKey.current = current.key;
      turn.current = current;
      const isCurrent = () => turn.current === current;
      const startedAt = Date.now();
      setStatus('thinking');
      trace(`asked: ${heard}`);

      const headers = await getSignedHeaders().catch(() => null);
      if (!isCurrent()) return;
      if (headers === null) {
        trace('failed: signin');
        setStatus('failed');
        return;
      }

      const spoken: Promise<unknown>[] = [];
      const state = {
        text: '',
        isFirstText: true,
        isSpeaking: false,
        isFlushing: false,
      };
      const feed = createSentenceFeed((line) => {
        if (!isCurrent()) return;
        if (!state.isSpeaking) {
          state.isSpeaking = true;
          setStatus('speaking');
        }
        const result = latest.current.speak(line, {
          turnKey: current.key,
          // A sentence only ends a push when more text follows it, so the reply's last line is the one the flush emits.
          canAnswer: state.isFlushing && ENDS_WITH_QUESTION.test(state.text),
        });
        if (result) spoken.push(result);
      });
      const onEvent = (event: AssistantTurnEvent) => {
        if (!isCurrent()) return;
        if (event.type === 'text') {
          if (state.isFirstText) {
            state.isFirstText = false;
            trace(`first text: ${Date.now() - startedAt} ms`);
          }
          state.text += event.text;
          feed.push(event.text);
        }
        if (event.type === 'searching') trace('searching');
        if (event.type === 'action') {
          trace(`action: ${event.name}`);
          latest.current.onAction(event);
        }
        if (event.type === 'done') {
          state.isFlushing = true;
          feed.flush();
        }
      };

      const result = await streamAssistantTurn({
        url: getHttpFunctionUrl(ENDPOINT),
        headers,
        body: {
          standing,
          screen,
          heard,
          alternatives,
          history: history.current,
        },
        signal: current.aborter.signal,
        onEvent,
      });

      if (result.status === 'done') {
        const { done } = result;
        // A turn a newer question cut off was never heard in full, so it stays out of what Pepper remembers saying.
        if (isCurrent()) {
          history.current = trimHistory(appendExchange(history.current, done));
        }
        trace(
          `done: ${done.endedBy}, ${done.ms} ms, ${done.searches} lookups, in ${done.usage.inputTokens} out ${done.usage.outputTokens} cached ${done.usage.cacheReadTokens}`,
        );
        await Promise.allSettled(spoken);
        if (isCurrent()) {
          turn.current = null;
          setStatus('idle');
        }
        return;
      }
      if (!isCurrent()) return;
      turn.current = null;
      if (result.status === 'held') {
        trace(`held: ${result.reason}`);
        setStatus('held');
        return;
      }
      trace(
        `failed: ${result.code}${result.cause === undefined ? '' : `, ${String(result.cause)}`}`,
      );
      setStatus('failed');
    },
    [trace],
  );

  return { ask, warm, cancel, reset, status };
}
