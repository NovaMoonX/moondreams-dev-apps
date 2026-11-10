import { getLocalClock } from '../../notifications/localClock.js';

export const DEFAULT_NOTIFY_HOUR = 19;

export interface DigestSettings {
  hour: number;
  zone: string | null;
}

/** Reads the person's chosen hour and zone from opened sealed fields; a plan sealed before the settings existed lacks both keys. */
export function readDigestSettings(
  sealed: Record<string, unknown>,
): DigestSettings {
  const hour = sealed.notifyHour;
  const zone = sealed.notifyTimeZone;
  return {
    hour:
      typeof hour === 'number' &&
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23
        ? hour
        : DEFAULT_NOTIFY_HOUR,
    zone: typeof zone === 'string' && zone !== '' ? zone : null,
  };
}

/** The local date to claim when `now` falls in the person's chosen hour, else null. */
export function getDigestDay(now: number, settings: DigestSettings) {
  const clock = getLocalClock(now, settings.zone);
  return clock.hour === settings.hour ? clock.date : null;
}

export const claimPath = (uid: string, date: string) =>
  `apps/runway/server/${uid}/notified/needsHome_${date}`;

export interface SortingState {
  isPaused: boolean;
  from: number;
}

/** Reads the plan's readable sorting switch; anything malformed is null, so every charge waits. */
export function readSorting(value: unknown): SortingState | null {
  if (typeof value !== 'object' || value === null) return null;
  const { isPaused, from } = value as Record<string, unknown>;
  return typeof isPaused === 'boolean' && typeof from === 'number'
    ? { isPaused, from }
    : null;
}

const PAIR_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** Counts what the screen lists. Pending money in is on its way and never counts. A pending purchase never pairs, so it is never the other side of a possible move: a posted money in that only a pending charge matches is not counted, as the screen holds it. Money in counts when it is on a card, or when a charge of its amount waits within three days (a possible move). A deposit offered a pay day is skipped, since pay days are sealed and worked out in the app. A charge counts unless "I'm not sorting yet" quiets it (no switch means every charge counts), and a quiet charge still counts when money in of its amount waits within three days. Accounts and status are not compared, so either side may count one the screen hides. Lost pairs, lost deposits and history that may be in twice are not in the query. A move the bank flagged (it waits under Account moves) is counted, since its category is sealed. */
export function countWaiting(
  purchases: {
    createdAt: number;
    date: number;
    amountCents: number;
    isOnCard: boolean;
    isPending: boolean;
  }[],
  sorting: SortingState | null,
) {
  const near = (amountCents: number, date: number, sign: 1 | -1) =>
    purchases.some(
      (entry) =>
        !entry.isPending &&
        entry.amountCents * sign > 0 &&
        Math.abs(entry.amountCents) === Math.abs(amountCents) &&
        Math.abs(entry.date - date) <= PAIR_WINDOW_MS,
    );
  return purchases.filter(
    ({ createdAt, date, amountCents, isOnCard, isPending }) =>
      amountCents < 0
        ? !isPending && (isOnCard || near(amountCents, date, 1))
        : amountCents === 0 ||
          sorting === null ||
          (!sorting.isPaused && createdAt >= sorting.from) ||
          near(amountCents, date, -1),
  ).length;
}
