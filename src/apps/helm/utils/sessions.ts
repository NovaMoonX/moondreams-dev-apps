import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { DAY_MS, SESSION_IDLE_MS } from '@apps/helm/constants';
import type { HelmProfile, OpenCapture } from '@apps/helm/types';
import { toDayKey } from '@apps/helm/utils/planDays';

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

/** The moment the conversation last started fresh: the person's New conversation, or today's midnight in their zone while Start each day fresh is on, whichever is later; 0 when neither. A turn before it never carries into the next. */
export function getFreshFrom(
  profile: Pick<
    HelmProfile,
    'conversationFreshAt' | 'isDailyFreshOn' | 'timeZone'
  > | null,
  now: number,
) {
  if (!profile) return 0;
  const dayStart = profile.isDailyFreshOn
    ? zonedDateTimeToEpoch(
        toDayKey(now, profile.timeZone),
        '00:00',
        profile.timeZone,
      )
    : 0;
  return Math.max(profile.conversationFreshAt ?? 0, dayStart);
}

/** The session still open: the last turn's, while it is under the idle gap and came after the conversation last started fresh. */
export function getOpenSessionId(
  sorted: OpenCapture[],
  now: number,
  freshFrom: number,
) {
  const last = sorted.at(-1);
  return last &&
    now - last.createdAt < SESSION_IDLE_MS &&
    last.createdAt >= freshFrom
    ? last.sessionId
    : null;
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
