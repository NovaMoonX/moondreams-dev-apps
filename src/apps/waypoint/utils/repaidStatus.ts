import type { RepaidLogEntry, RepaidStatus, TripExpense } from '@apps/waypoint/types';

const MAX_REPAID_LOG = 10;

export const emptyRepaidStatus = (): RepaidStatus => ({ isPaid: false, paidAt: null, markedByUid: null, log: [] });

/** A member's mark, with the keys older documents lack filled in. */
export function getRepaidStatus(expense: Pick<TripExpense, 'paidMemberStatus'>, uid: string): RepaidStatus {
  const stored = (expense.paidMemberStatus ?? {})[uid];
  const isPaid = stored?.isPaid ?? false;
  const paidAt = stored?.paidAt ?? null;
  // Before marks were attributed only the person who owed could make one, so a mark with no record was theirs.
  const isUnrecordedMark = isPaid && stored?.log === undefined;
  return {
    isPaid,
    paidAt,
    markedByUid: stored?.markedByUid ?? (isUnrecordedMark ? uid : null),
    log:
      stored?.log ??
      (isUnrecordedMark && paidAt !== null ? [{ isPaid: true, byUid: uid, at: paidAt, isReset: false }] : []),
  };
}

const addToLog = (log: RepaidLogEntry[], entry: RepaidLogEntry) => [...log, entry].slice(-MAX_REPAID_LOG);

/** The status after `actorUid` flips it, with the flip added to the history. */
export function flipRepaidStatus(current: RepaidStatus, actorUid: string, now: number): RepaidStatus {
  const isPaid = !current.isPaid;
  return {
    isPaid,
    paidAt: isPaid ? now : null,
    markedByUid: isPaid ? actorUid : null,
    log: addToLog(current.log, { isPaid, byUid: actorUid, at: now, isReset: false }),
  };
}

/** The status after the whole expense is put back to expected: the mark is cleared and the history says why. */
export function resetRepaidStatus(current: RepaidStatus, actorUid: string, now: number): RepaidStatus {
  return {
    isPaid: false,
    paidAt: null,
    markedByUid: null,
    log: addToLog(current.log, { isPaid: false, byUid: actorUid, at: now, isReset: true }),
  };
}

export type RepaidHistoryItem =
  | { kind: 'flip'; debtorUid: string; entry: RepaidLogEntry; previous: RepaidLogEntry | null }
  | { kind: 'reset'; byUid: string; at: number; count: number };

/** Every flip on an expense, newest first; the marks one "put back to expected" cleared are one line. */
export function getRepaidHistory(expense: Pick<TripExpense, 'paidMemberStatus'>): RepaidHistoryItem[] {
  const flips = Object.keys(expense.paidMemberStatus ?? {}).flatMap((debtorUid) => {
    const { log } = getRepaidStatus(expense, debtorUid);
    return log.map((entry, index) => ({ debtorUid, entry, previous: index > 0 ? log[index - 1] : null }));
  });
  const resets = flips
    .filter(({ entry }) => entry.isReset === true)
    .reduce((groups, { entry }) => {
      const key = `${entry.at}-${entry.byUid}`;
      return groups.set(key, { kind: 'reset' as const, byUid: entry.byUid, at: entry.at, count: (groups.get(key)?.count ?? 0) + 1 });
    }, new Map<string, Extract<RepaidHistoryItem, { kind: 'reset' }>>());
  const marks = flips
    .filter(({ entry }) => entry.isReset !== true)
    .map((flip) => ({ kind: 'flip' as const, ...flip }));
  return [...marks, ...resets.values()].sort((first, second) => (second.kind === 'flip' ? second.entry.at : second.at) - (first.kind === 'flip' ? first.entry.at : first.at));
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** For a share someone else marked not paid back after it had been marked paid: the line that tells the person it changed. */
export function describeReversal(
  expense: Pick<TripExpense, 'paidMemberStatus'>,
  debtorUid: string,
  viewerUid: string,
  label: (uid: string) => string,
): string | null {
  const { isPaid, log } = getRepaidStatus(expense, debtorUid);
  const last = log.at(-1);
  if (isPaid || !last || last.isPaid || last.isReset === true || last.byUid === debtorUid) {
    return null;
  }
  const who = (uid: string) => (uid === viewerUid ? 'you' : label(uid));
  const previous = log.at(-2);
  if (previous?.isPaid && previous.byUid === last.byUid) {
    return `${sentence(who(last.byUid))} marked this paid back, then not paid back.`;
  }
  const was = previous?.isPaid ? ` ${sentence(who(previous.byUid))} had marked it paid back.` : '';
  return `${sentence(who(last.byUid))} marked this not paid back.${was}`;
}
