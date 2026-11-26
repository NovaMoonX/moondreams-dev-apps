import { useCallback, useEffect, useRef, useState } from 'react';

import {
  streamAssistantTurn,
  type AssistantTurnEvent,
} from '@/lib/speech/assistant/streamAssistantTurn';
import {
  recordTurn,
  type TurnLogData,
  type TurnLogKind,
} from '@/lib/speech/turnLog';
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

export type PepperTrace = {
  at: number;
  text: string;
  kind: TurnLogKind;
  data: TurnLogData | null;
};

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
  /** A turn that got no answer: `held` is the server's reason when a limit stopped it, null when it failed. */
  onProblem: (held: string | null) => void;
  onTrace?: (entry: PepperTrace) => void;
};

const ENDPOINT = 'pepperTurn';
// A warm-up this recent still holds, so the next one is skipped.
const WARM_FRESH_MS = 9 * 60_000;
const ENDS_WITH_QUESTION = /\?["'”’)]*\s*$/;

type Turn = { aborter: AbortController; key: number };

/** One cook's conversation with Pepper: sends each spoken question with the history so far, says the answer as it streams and hands each on-screen action to the caller. */
export function usePepper({
  speak,
  onAction,
  onProblem,
  onTrace,
}: PepperOptions) {
  const [status, setStatus] = useState<PepperStatus>('idle');
  const history = useRef<PepperLine[]>([]);
  const turn = useRef<Turn | null>(null);
  const lastKey = useRef(0);
  const warmedAt = useRef(0);
  const isWarming = useRef(false);
  const latest = useRef({ speak, onAction, onProblem, onTrace });
  useEffect(() => {
    latest.current = { speak, onAction, onProblem, onTrace };
  });

  const trace = useCallback(
    (
      kind: TurnLogKind,
      text: string,
      data: TurnLogData | null = null,
      isLogged = true,
    ) => {
      if (isLogged) recordTurn(kind, text, data);
      latest.current.onTrace?.({ at: Date.now(), text, kind, data });
    },
    [],
  );

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
    if (isWarming.current || Date.now() - warmedAt.current < WARM_FRESH_MS) {
      return true;
    }
    isWarming.current = true;
    const headers = await getSignedHeaders().catch(() => null);
    const response =
      headers === null
        ? null
        : await fetch(getHttpFunctionUrl(ENDPOINT), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ warm: true }),
          }).catch(() => null);
    isWarming.current = false;
    if (response?.ok !== true) return false;
    warmedAt.current = Date.now();
    return true;
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
      trace('request', `asked Pepper: “${heard}”`, {
        alternatives,
        historyPairs: history.current.length / 2,
        standingChars: standing.length,
        screenChars: screen.length,
      });

      const headers = await getSignedHeaders().catch(() => null);
      if (!isCurrent()) return;
      if (headers === null) {
        trace('error', 'could not sign the request: no signed-in session');
        setStatus('failed');
        latest.current.onProblem(null);
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
            trace('latency', 'first text', { ms: Date.now() - startedAt });
          }
          state.text += event.text;
          feed.push(event.text);
        }
        if (event.type === 'searching') trace('note', 'Pepper is searching');
        if (event.type === 'action') {
          trace('action', event.name, null, false);
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
        trace('reply', done.assistant);
        trace('done', done.endedBy, {
          ms: done.ms,
          searches: done.searches,
          in: done.usage.inputTokens,
          out: done.usage.outputTokens,
          cacheRead: done.usage.cacheReadTokens,
          cacheWrite: done.usage.cacheWriteTokens,
          model: done.model ?? null,
          isStandIn: done.isStandIn === true,
          isCurrent: isCurrent(),
        });
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
        trace('held', result.reason);
        setStatus('held');
        latest.current.onProblem(result.reason);
        return;
      }
      trace('failed', result.code, {
        cause: result.cause === undefined ? null : String(result.cause),
      });
      setStatus('failed');
      latest.current.onProblem(null);
    },
    [trace],
  );

  return { ask, warm, cancel, reset, status };
}
