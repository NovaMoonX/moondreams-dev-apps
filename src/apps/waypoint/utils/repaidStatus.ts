import type { RepaidLogEntry, RepaidStatus, TripExpense } from '@apps/waypoint/types';

const MAX_REPAID_LOG = 20;

export const emptyRepaidStatus = (): RepaidStatus => ({ isPaid: false, paidAt: null, markedByUid: null, log: [] });

/** A member's mark, with the keys older documents lack filled in. */
export function getRepaidStatus(expense: Pick<TripExpense, 'paidMemberStatus'>, uid: string): RepaidStatus {
  const stored = (expense.paidMemberStatus ?? {})[uid];
  return {
    isPaid: stored?.isPaid ?? false,
    paidAt: stored?.paidAt ?? null,
    markedByUid: stored?.markedByUid ?? null,
    log: stored?.log ?? [],
  };
}

/** The status after `actorUid` flips it, with the flip added to the history. */
export function flipRepaidStatus(current: RepaidStatus, actorUid: string, now: number): RepaidStatus {
  const isPaid = !current.isPaid;
  return {
    isPaid,
    paidAt: isPaid ? now : null,
    markedByUid: isPaid ? actorUid : null,
    log: [...current.log, { isPaid, byUid: actorUid, at: now }].slice(-MAX_REPAID_LOG),
  };
}

/** Every flip on an expense, newest first, each with who it replaced. */
export function getRepaidHistory(expense: Pick<TripExpense, 'paidMemberStatus'>) {
  return Object.entries(expense.paidMemberStatus ?? {})
    .flatMap(([debtorUid]) => {
      const { log } = getRepaidStatus(expense, debtorUid);
      return log.map((entry: RepaidLogEntry, index) => ({
        debtorUid,
        entry,
        previous: index > 0 ? log[index - 1] : null,
      }));
    })
    .sort((first, second) => second.entry.at - first.entry.at);
}
