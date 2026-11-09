import { useMemo } from 'react';

import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { SESSION_IDLE_MS } from '@apps/helm/constants';
import { getOpenSessionId, groupSessions } from '@apps/helm/utils/sessions';

/** Every loaded session, oldest first, and which one is still in progress (a run of turns with no gap over `SESSION_IDLE_MS`), if any. */
export function useSession() {
  const captures = useAppSelector(selectAllCaptures);
  const now = useNow(30_000);

  const sessions = useMemo(() => groupSessions(captures), [captures]);
  const openSessionId = useMemo(
    () => getOpenSessionId(captures, now),
    [captures, now],
  );
  return { sessions, openSessionId };
}

type Turn = { sessionId: string; turnIndex: number; createdAt: number };

// A send isn't awaited, so the store lags the last turn by its snapshot; the next turn reads this too.
const lastSent: { uid: string | null; turn: Turn | null } = {
  uid: null,
  turn: null,
};

export const recordSentTurn = (uid: string, turn: Turn) => {
  lastSent.uid = uid;
  lastSent.turn = turn;
};

/** Which session the next turn joins and its place in it. Read when the person taps Send, so a session that went quiet while they typed starts a new one. */
export function getNextTurn() {
  const stored = selectAllCaptures(store.getState()).at(-1) ?? null;
  const pending =
    lastSent.uid === store.getState().helm.uid ? lastSent.turn : null;
  const last =
    pending && (!stored || pending.createdAt > stored.createdAt)
      ? pending
      : stored;
  const isOpen = last !== null && Date.now() - last.createdAt < SESSION_IDLE_MS;
  const result = isOpen
    ? { sessionId: last.sessionId, turnIndex: last.turnIndex + 1 }
    : { sessionId: generateUuid(), turnIndex: 0 };
  return result;
}
