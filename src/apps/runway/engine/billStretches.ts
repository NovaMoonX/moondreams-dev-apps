import type {
  BillSealed,
  BillVersion,
  FundingRule,
  OpenVersion,
  Priority,
  PriorityExtra,
} from '@apps/runway/types';

import type { DraftBillStretch } from './demands';
import { capEnding } from './endings';
import type { FundingRun } from './parts';
import { resolveCurrentOrNext, type Versioned } from './resolve';

type Own<P> = Versioned & { id: string; payload: P };

/** The runs of dates over which an item's version in force stays the same, the earliest reaching back to the item's first date. */
function getRuns<P>(own: readonly Own<P>[], itemId: string) {
  const edges = [
    ...new Set(
      own.flatMap((version) =>
        version.effectiveUntil === null
          ? [version.effectiveFrom]
          : [version.effectiveFrom, version.effectiveUntil],
      ),
    ),
  ].sort((a, b) => a - b);
  const result = [-Infinity, ...edges]
    .flatMap((start) => {
      const version = resolveCurrentOrNext(own, itemId, start);
      return version ? [{ start, version }] : [];
    })
    .filter(
      (entry, index, all) =>
        index === 0 || all[index - 1].version.id !== entry.version.id,
    )
    .map((entry, index) => ({
      from: index === 0 ? -Infinity : entry.start,
      version: entry.version,
    }));
  return result;
}

/** A bill's versions as the stretches a payment reads; `endedAt` stops every stretch's schedule. */
export function getBillStretches(
  own: readonly Own<BillSealed>[],
  itemId: string,
  endedAt: number | null,
): DraftBillStretch[] {
  const result = getRuns(own, itemId).map(
    ({ from, version }): DraftBillStretch => ({
      from,
      amount: version.payload.amount,
      stanceOverride: version.payload.stanceOverride ?? null,
      schedule: version.payload.timing.schedule,
      ending: capEnding(version.payload.ending, endedAt),
      fundedBy: version.payload.fundedBy,
      payOnDay: version.payload.payOnDay ?? null,
    }),
  );
  return result;
}

/** An envelope's or goal's funding as each run of its versions set it. */
export function getFundingRuns(
  own: readonly Own<{
    priority: Priority;
    funding: FundingRule;
    extras?: readonly PriorityExtra[] | null;
  }>[],
  itemId: string,
): FundingRun[] {
  const result = getRuns(own, itemId).map(({ from, version }): FundingRun => ({
    from,
    priority: version.payload.priority,
    funding: version.payload.funding,
    extras: version.payload.extras ?? null,
  }));
  return result;
}

interface Worked {
  byItem: Map<string, OpenVersion[]>;
  bills: Map<string, { endedAt: number | null; list: DraftBillStretch[] }>;
  funding: Map<string, FundingRun[]>;
}

const workedCache = new WeakMap<object, Worked>();

const getWorked = (versions: readonly OpenVersion[]): Worked => {
  const known = workedCache.get(versions);
  if (known) return known;
  const result: Worked = {
    byItem: versions.reduce((acc, version) => {
      acc.set(version.itemId, [...(acc.get(version.itemId) ?? []), version]);
      return acc;
    }, new Map<string, OpenVersion[]>()),
    bills: new Map(),
    funding: new Map(),
  };
  workedCache.set(versions, result);
  return result;
};

/** One bill's stretches from a plan's versions, worked out once per list of versions. */
export function getStretchesOf(
  versions: readonly OpenVersion[],
  item: { id: string; endedAt: number | null },
): DraftBillStretch[] {
  const worked = getWorked(versions);
  const seen = worked.bills.get(item.id);
  if (seen && seen.endedAt === item.endedAt) return seen.list;
  const list = getBillStretches(
    (worked.byItem.get(item.id) ?? []).filter(
      (version): version is BillVersion => version.kind === 'bill',
    ),
    item.id,
    item.endedAt,
  );
  worked.bills.set(item.id, { endedAt: item.endedAt, list });
  return list;
}

/** One envelope's or goal's funding runs from a plan's versions, worked out once per list of versions. */
export function getFundingRunsOf(
  versions: readonly OpenVersion[],
  itemId: string,
): FundingRun[] {
  const worked = getWorked(versions);
  const seen = worked.funding.get(itemId);
  if (seen) return seen;
  const list = getFundingRuns(
    (worked.byItem.get(itemId) ?? []).flatMap((version) =>
      version.kind === 'envelope' || version.kind === 'goal' ? [version] : [],
    ),
    itemId,
  );
  worked.funding.set(itemId, list);
  return list;
}
