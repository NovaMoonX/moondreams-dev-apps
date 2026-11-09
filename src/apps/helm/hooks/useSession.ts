import { useMemo } from 'react';

import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { SESSION_IDLE_MS } from '@apps/helm/constants';
import type { OpenCapture } from '@apps/helm/types';
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

type SentTurn = {
  sessionId: string;
  turnIndex: number;
  createdAt: number;
  /** The lead of the turn this message belongs to: itself when it started one. */
  leadId: string;
  joinedCount: number;
};

// A send isn't awaited, so the store lags the last turn by its snapshot; the next turn reads this too.
const lastSent: { uid: string | null; turn: SentTurn | null } = {
  uid: null,
  turn: null,
};

/** Keeps what the next Send needs before the snapshot arrives. `turn` is what `getNextTurn` gave this send. */
export const recordSentTurn = (
  uid: string,
  turn: {
    sessionId: string;
    turnIndex: number;
    createdAt: number;
    leadId: string | null;
    joinedCount: number;
  },
  captureId: string,
) => {
  lastSent.uid = uid;
  lastSent.turn = {
    sessionId: turn.sessionId,
    turnIndex: turn.turnIndex,
    createdAt: turn.createdAt,
    leadId: turn.leadId ?? captureId,
    joinedCount: turn.leadId === null ? 0 : turn.joinedCount + 1,
  };
};

/** Which session the next turn joins and its place in it, and the turn it joins (`leadId`, with how many joined it so far) while that turn's reply has not started and fewer than 9 joined. Read when the person taps Send, so a session that went quiet while they typed starts a new one. */
export function getNextTurn() {
  const state = store.getState();
  const captures = selectAllCaptures(state);
  const stored = captures.at(-1) ?? null;
  const pending = lastSent.uid === state.helm.uid ? lastSent.turn : null;
  const isPendingLast =
    pending !== null && (!stored || pending.createdAt > stored.createdAt);
  const last = isPendingLast ? pending : stored;
  if (last === null || Date.now() - last.createdAt >= SESSION_IDLE_MS) {
    return {
      sessionId: generateUuid(),
      turnIndex: 0,
      leadId: null as string | null,
      joinedCount: 0,
    };
  }
  const lead = isPendingLast
    ? { id: pending.leadId, count: pending.joinedCount, isWorking: true }
    : toStoredLead(captures, stored);
  const canJoin = lead.isWorking && lead.count < MAX_JOINED;
  return {
    sessionId: last.sessionId,
    turnIndex: last.turnIndex + 1,
    leadId: canJoin ? lead.id : null,
    joinedCount: lead.count,
  };
}

const MAX_JOINED = 9;

function toStoredLead(captures: OpenCapture[], last: OpenCapture | null) {
  const lead = last
    ? captures.find((entry) => entry.id === (last.turnLeadId ?? last.id))
    : undefined;
  return {
    id: lead?.id ?? '',
    count: lead?.joinedCaptureIds.length ?? 0,
    isWorking:
      lead !== undefined &&
      (lead.status === 'received' || lead.status === 'interpreting'),
  };
}
