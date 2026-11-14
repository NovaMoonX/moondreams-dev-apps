import { useMemo } from 'react';

import { useNow } from '@/hooks/useNow';
import { store, useAppSelector } from '@/store';
import { generateUuid } from '@/utils';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import { SESSION_IDLE_MS } from '@apps/helm/constants';
import type { OpenCapture } from '@apps/helm/types';
import {
  getFreshFrom,
  getOpenSessionId,
  groupSessions,
} from '@apps/helm/utils/sessions';

/** Every loaded session, oldest first, which one is still in progress (a run of turns with no gap over `SESSION_IDLE_MS`, since the conversation last started fresh), if any, and when it last started fresh. */
export function useSession() {
  const captures = useAppSelector(selectAllCaptures);
  const profile = useAppSelector((state) => state.helm.profile);
  const now = useNow(30_000);

  const sessions = useMemo(() => groupSessions(captures), [captures]);
  const freshFrom = getFreshFrom(profile, now);
  const openSessionId = useMemo(
    () => getOpenSessionId(captures, now, freshFrom),
    [captures, now, freshFrom],
  );
  return { sessions, openSessionId, freshFrom };
}

type SentTurn = {
  captureId: string;
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
    captureId,
    sessionId: turn.sessionId,
    turnIndex: turn.turnIndex,
    createdAt: turn.createdAt,
    leadId: turn.leadId ?? captureId,
    joinedCount: turn.leadId === null ? 0 : turn.joinedCount + 1,
  };
};

/** Forgets a send whose write was rejected, so the next Send does not join a turn that was never saved. */
export const clearSentTurn = (uid: string, captureId: string) => {
  if (lastSent.uid === uid && lastSent.turn?.captureId === captureId) {
    lastSent.turn = null;
  }
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
  const now = Date.now();
  if (
    last === null ||
    now - last.createdAt >= SESSION_IDLE_MS ||
    last.createdAt < getFreshFrom(state.helm.profile, now)
  ) {
    return {
      sessionId: generateUuid(),
      turnIndex: 0,
      leadId: null as string | null,
      joinedCount: 0,
    };
  }
  const lead = isPendingLast
    ? toPendingLead(captures, pending)
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

function toPendingLead(captures: OpenCapture[], pending: SentTurn) {
  const stored = captures.find((entry) => entry.id === pending.leadId);
  return {
    id: pending.leadId,
    count: pending.joinedCount,
    isWorking:
      stored === undefined ||
      stored.status === 'received' ||
      stored.status === 'interpreting',
  };
}

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
