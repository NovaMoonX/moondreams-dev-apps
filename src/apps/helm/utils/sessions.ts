import { SESSION_IDLE_MS } from '@apps/helm/constants';
import type { OpenCapture } from '@apps/helm/types';

const DAY_MS = 24 * 60 * 60 * 1000;

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
