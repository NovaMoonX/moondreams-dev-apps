import { getLocalClock } from '../../notifications/localClock.js';
import { isSameStore } from './storeNames.js';

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

/** Counts what the screen lists. Pending money in is on its way and never counts. A pending purchase never pairs, so it is never the other side of a possible move: a posted money in that only a pending charge matches is not counted, as the screen holds it (on a card too). Money in counts when a charge of its amount waits within three days (a possible move). A refund of a purchase that went to an envelope is skipped, since that purchase is not in the query and merchants and lines are worked out in the app; a card refund of anything else is simply counted in Free to Spend and never waits. A deposit offered a pay day is skipped, since pay days are sealed and worked out in the app. A charge counts unless "I'm not sorting yet" quiets it (no switch means every charge counts), and a quiet charge still counts when money in of its amount waits within three days. Accounts and status are not compared, so either side may count one the screen hides. Lost pairs, lost deposits and history that may be in twice are not in the query. A move the bank flagged (it waits under Account moves) is counted, since its category is sealed. */
export function countWaiting(
  purchases: {
    createdAt: number;
    date: number;
    amountCents: number;
    isPending: boolean;
  }[],
  sorting: SortingState | null,
) {
  const near = (
    amountCents: number,
    date: number,
    sign: 1 | -1,
    isPending = false,
  ) =>
    purchases.some(
      (entry) =>
        entry.isPending === isPending &&
        entry.amountCents * sign > 0 &&
        Math.abs(entry.amountCents) === Math.abs(amountCents) &&
        Math.abs(entry.date - date) <= PAIR_WINDOW_MS,
    );
  return purchases.filter(({ createdAt, date, amountCents, isPending }) =>
    amountCents < 0
      ? !isPending && near(amountCents, date, 1)
      : amountCents === 0 ||
        sorting === null ||
        (!sorting.isPaused && createdAt >= sorting.from) ||
        near(amountCents, date, -1),
  ).length;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Mirror `EMAIL_MATCH_DAYS_BEFORE` and `EMAIL_MATCH_DAYS_AFTER` in the app's constants; `check:runway-notify-text` fails when they drift. */
export const EMAIL_MATCH_DAYS_BEFORE = 2;
export const EMAIL_MATCH_DAYS_AFTER = 7;
/** Mirror `MAX_SPLIT_CHARGES` and `MAX_SPLIT_POOL` in the app's `engine/emailTwins.ts`; `check:runway-notify-text` fails when they drift. */
export const MAX_SPLIT_CHARGES = 4;
export const MAX_SPLIT_POOL = 8;

export interface TwinRow {
  id: string;
  date: number;
  source: string | null;
  amountCents: number;
  accountId: string | null;
  paidByCardId: string | null;
  emailWaiting: boolean;
  notSameAs: string[];
  pairedWithId: string | null;
  /** The merchant, or else the label, as the person reads it; null when it has neither. */
  name: string | null;
  /** The email was read from a store's order confirmation. */
  isOrder: boolean;
}

const isSameSide = (email: TwinRow, bank: TwinRow) =>
  email.paidByCardId !== null
    ? email.paidByCardId === bank.paidByCardId
    : email.accountId !== null &&
      email.accountId === bank.accountId &&
      bank.paidByCardId === null;

const isWindowDay = (email: TwinRow, bank: TwinRow) =>
  bank.date >= email.date - EMAIL_MATCH_DAYS_BEFORE * DAY_MS &&
  bank.date <= email.date + EMAIL_MATCH_DAYS_AFTER * DAY_MS;

const getCombinations = <T>(items: readonly T[], size: number): T[][] =>
  size === 0
    ? [[]]
    : items.flatMap((item, index) =>
        getCombinations(items.slice(index + 1), size - 1).map((rest) => [
          item,
          ...rest,
        ]),
      );

/** The sets of 2 to 4 charges from one store, on the order's side and in its window, that add up to its amount; none when the pool is too big to tell. */
function findSplitSets(
  order: TwinRow,
  banks: readonly TwinRow[],
  taken: ReadonlySet<string>,
): string[][] {
  const pool = banks.filter(
    (bank) =>
      bank.amountCents > 0 &&
      !taken.has(bank.id) &&
      isSameSide(order, bank) &&
      isWindowDay(order, bank) &&
      !order.notSameAs.includes(bank.id) &&
      isSameStore(order.name, bank.name),
  );
  if (order.amountCents <= 0 || pool.length > MAX_SPLIT_POOL) return [];
  return Array.from({ length: MAX_SPLIT_CHARGES - 1 }, (_, index) => index + 2)
    .flatMap((size) => getCombinations(pool, size))
    .filter(
      (set) =>
        set.reduce((sum, bank) => sum + bank.amountCents, 0) ===
        order.amountCents,
    )
    .map((set) => set.map((bank) => bank.id).sort());
}

/** The charges of each waiting store order that posted as several, as `findEmailTwins` in the app decides: exactly one set of charges adds up to it and no other waiting email from that store could be it or take one of the charges. */
function findSplitChargeIds(
  emails: readonly TwinRow[],
  banks: readonly TwinRow[],
  candidates: ReadonlyMap<string, string[]>,
): Set<string> {
  const taken = new Set([...candidates.values()].flat());
  const sets = emails
    .filter(
      (email) => email.isOrder && (candidates.get(email.id) ?? []).length === 0,
    )
    .map((email): [TwinRow, string[][]] => [
      email,
      findSplitSets(email, banks, taken),
    ])
    .filter(([, found]) => found.length > 0);
  return new Set(
    sets.flatMap(([email, found]) => {
      const isRivaled =
        sets.some(
          ([other, otherSets]) =>
            other.id !== email.id &&
            otherSets.some((set) => set.some((id) => found[0].includes(id))),
        ) ||
        emails.some(
          (other) =>
            other.id !== email.id &&
            other.amountCents === email.amountCents &&
            isSameSide(email, other) &&
            isSameStore(email.name, other.name),
        );
      return found.length === 1 && !isRivaled ? found[0] : [];
    }),
  );
}

/** Drops each waiting emailed purchase that is clearly a bank charge also waiting, so the pair counts once (the bank's side stays): the same amount on the same card (or the same account for money out of an account), the bank dated from two days before to seven days after the email, and the only candidate both ways, as `findEmailTwins` in the app decides. An ambiguous email stays counted. A store order that posted as several charges stays and its charges are dropped, as the screen hides them; skipped: the screen shows those charges again when one is link history or the merge's tries are spent, which the push cannot see, so it drops them anyway. */
export function withoutEmailTwins<T extends TwinRow>(rows: readonly T[]) {
  const emails = rows.filter(
    (row) => row.source === 'email' && row.emailWaiting,
  );
  const banks = rows.filter(
    (row) => row.source === 'link' && row.pairedWithId === null,
  );
  const candidates = new Map(
    emails.map((email) => [
      email.id,
      banks
        .filter(
          (bank) =>
            bank.amountCents === email.amountCents &&
            isSameSide(email, bank) &&
            bank.date >= email.date - EMAIL_MATCH_DAYS_BEFORE * DAY_MS &&
            bank.date <= email.date + EMAIL_MATCH_DAYS_AFTER * DAY_MS &&
            !email.notSameAs.includes(bank.id),
        )
        .map((bank) => bank.id),
    ]),
  );
  const claims = [...candidates.values()]
    .flat()
    .reduce(
      (counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1),
      new Map<string, number>(),
    );
  const split = findSplitChargeIds(emails, banks, candidates);
  return rows.filter((row) => {
    const ids = candidates.get(row.id);
    return (
      !(ids?.length === 1 && claims.get(ids[0]) === 1) && !split.has(row.id)
    );
  });
}
