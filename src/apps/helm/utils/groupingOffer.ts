import {
  selectGroupingOffer,
  type GroupingRecord,
} from '@apps/helm/engine/grouping';

/** What this app open has already shown, so a second offer never follows the first until the app is opened again. */
export interface GroupingSession {
  offeredId: string | null;
  filedId: string | null;
}

export const createGroupingSession = (): GroupingSession => ({
  offeredId: null,
  filedId: null,
});

/** One offer per app open: the first one chosen stays the only one, answered or not. */
export function pickGroupingOffer<T extends GroupingRecord>(
  session: GroupingSession,
  groupings: readonly T[],
  now: number,
  liveKeys: ReadonlySet<string>,
): T | null {
  if (session.offeredId !== null)
    return selectGroupingOffer(
      groupings.filter((grouping) => grouping.id === session.offeredId),
      now,
      liveKeys,
    );
  const offer = selectGroupingOffer(groupings, now, liveKeys);
  if (offer) session.offeredId = offer.id;
  return offer;
}

/** The filed grouping not yet told, held for the rest of the open once chosen so marking it told does not take the line away while it is read. */
export function pickFiledLine<T extends GroupingRecord>(
  session: GroupingSession,
  groupings: readonly T[],
): T | null {
  if (session.filedId !== null)
    return (
      groupings.find(
        (grouping) =>
          grouping.id === session.filedId && grouping.state === 'filed',
      ) ?? null
    );
  const next =
    groupings
      .filter(
        (grouping) =>
          grouping.state === 'filed' &&
          grouping.toldAt === null &&
          grouping.executionId !== null &&
          grouping.parentId !== null,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
  if (next) session.filedId = next.id;
  return next;
}

export type HomeCard = 'day' | 'grouping' | 'filedLine';

export const HOME_CARDS_MAX = 3;

/** The cards home draws, in order: the day, then an offer or, when there is none, the quiet line about what was linked. Never more than three. */
export const pickHomeCards = (input: {
  hasDay: boolean;
  hasOffer: boolean;
  hasFiled: boolean;
}): HomeCard[] =>
  [
    ...(input.hasDay ? (['day'] as const) : []),
    ...(input.hasOffer ? (['grouping'] as const) : []),
    ...(!input.hasOffer && input.hasFiled ? (['filedLine'] as const) : []),
  ].slice(0, HOME_CARDS_MAX);
