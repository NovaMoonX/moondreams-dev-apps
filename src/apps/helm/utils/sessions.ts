import { DAY_MS, SESSION_IDLE_MS } from '@apps/helm/constants';
import type { OpenCapture } from '@apps/helm/types';

export interface Session {
  sessionId: string;
  startedAt: number;
  turns: OpenCapture[];
}

/** The start of yesterday on this device: the eager window holds today's session and the one before it. */
export function getRecentWindowStart(now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.getTime() - DAY_MS;
}

/** The sessions in a list of turns, oldest first, each with its turns in order. */
export function groupSessions(captures: OpenCapture[]): Session[] {
  const bySession = captures.reduce((sessions, capture) => {
    const turns = sessions.get(capture.sessionId);
    if (turns) turns.push(capture);
    else sessions.set(capture.sessionId, [capture]);
    return sessions;
  }, new Map<string, OpenCapture[]>());
  return [...bySession.entries()]
    .map(([sessionId, entries]) => {
      const turns = [...entries].sort(
        (a, b) => a.turnIndex - b.turnIndex || a.createdAt - b.createdAt,
      );
      return { sessionId, startedAt: turns[0].createdAt, turns };
    })
    .sort((a, b) => a.startedAt - b.startedAt);
}

export interface TurnGroup {
  lead: OpenCapture;
  joined: OpenCapture[];
}

const isWaitingStatus = (status: OpenCapture['status']) =>
  status === 'received' || status === 'interpreting';

/** A session's turns as leads with the messages that joined them, in order; a joined message folds under its lead only while the lead is loaded and lists it, the message has no result of its own, and its status matches the lead's: received while the lead waits, sorted once the lead is sorted or asking. Any other stands as its own turn. */
export function groupTurns(turns: OpenCapture[]): TurnGroup[] {
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const leadOf = (turn: OpenCapture) => {
    const lead =
      turn.turnLeadId === null ? undefined : byId.get(turn.turnLeadId);
    return lead &&
      lead.joinedCaptureIds.includes(turn.id) &&
      turn.executionIds.length === 0 &&
      ((isWaitingStatus(lead.status) && turn.status === 'received') ||
        ((lead.status === 'sorted' || lead.status === 'needsYou') &&
          turn.status === 'sorted'))
      ? lead
      : undefined;
  };
  return turns
    .filter((turn) => leadOf(turn) === undefined)
    .map((lead) => ({
      lead,
      joined: turns.filter((turn) => leadOf(turn)?.id === lead.id),
    }));
}

/** The messages groupTurns folds under this lead, in order. */
export const getJoinedOf = (lead: OpenCapture, captures: OpenCapture[]) =>
  groupTurns(captures).find((group) => group.lead.id === lead.id)?.joined ?? [];

/** The session still open: the last turn's, while it is under the idle gap. */
export function getOpenSessionId(sorted: OpenCapture[], now: number) {
  const last = sorted.at(-1);
  return last && now - last.createdAt < SESSION_IDLE_MS ? last.sessionId : null;
}

/** Sessions as runs of one calendar day (local), in order, for the day dividers. */
export function groupSessionsByDay(sessions: Session[]) {
  return sessions.reduce<{ dayStart: number; sessions: Session[] }[]>(
    (days, session) => {
      const day = new Date(session.startedAt);
      day.setHours(0, 0, 0, 0);
      const dayStart = day.getTime();
      const last = days.at(-1);
      return last && last.dayStart === dayStart
        ? [
            ...days.slice(0, -1),
            { dayStart, sessions: [...last.sessions, session] },
          ]
        : [...days, { dayStart, sessions: [session] }];
    },
    [],
  );
}
