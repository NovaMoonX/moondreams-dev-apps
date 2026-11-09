import { useMemo } from 'react';

import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { getOpenSessionId, groupSessions } from '@apps/helm/utils/sessions';

/** Every loaded session, oldest first, and which one is still in progress (a run of turns with no gap over `SESSION_IDLE_MS`), if any. */
export function useSession() {
  const captures = useAppSelector(selectAllCaptures);
  const now = useNow(30_000);

  return useMemo(
    () => ({
      sessions: groupSessions(captures),
      openSessionId: getOpenSessionId(captures, now),
    }),
    [captures, now],
  );
}

/** Which session the next turn joins and its place in it. Read when the person taps Send, so a session that went quiet while they typed starts a new one. */
export function getNextTurn() {
  const captures = selectAllCaptures(store.getState());
  const last = captures.at(-1);
  const openSessionId = getOpenSessionId(captures, Date.now());
  const result =
    openSessionId && last
      ? { sessionId: openSessionId, turnIndex: last.turnIndex + 1 }
      : { sessionId: generateUuid(), turnIndex: 0 };
  return result;
}
