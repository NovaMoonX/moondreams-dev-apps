import type { DateOnly, OpenVersion, PlanItemDoc } from '@apps/runway/types';

import { DAY_MS } from './dates';
import { isSameValue, resolveVersion } from './resolve';

/** The items whose changes people look ahead for: what a pay brings in and what goes out of it. */
const CHANGE_KINDS: readonly PlanItemDoc['kind'][] = [
  'payLine',
  'bill',
  'envelope',
  'goal',
];

export interface PlanChange {
  /** The later of the two days compared: the day a calendar marks, or the income day that is different. */
  on: DateOnly;
  /** The day the new amount starts, or the day after a stretch the earlier amount returns on. */
  startsOn: DateOnly;
  itemId: string;
  kind: OpenVersion['kind'];
  /** A stretch ran out and the earlier version is back; nothing was written for it. */
  isReturn: boolean;
  before: OpenVersion;
  after: OpenVersion;
}

const isLive = (item: PlanItemDoc, on: DateOnly) =>
  (item.archivedAt === null || on < item.archivedAt) &&
  (item.endedAt === null || on <= item.endedAt);

/**
 * What differs for one item between two days because a version starts or ends in between. Null
 * when the item had nothing in force on the earlier day (its first version is a start, not a
 * change), or when both days read the same.
 */
const compareDays = (
  own: readonly OpenVersion[],
  item: PlanItemDoc,
  previousDay: DateOnly,
  day: DateOnly,
): PlanChange | null => {
  const before = resolveVersion(own, item.id, previousDay);
  const after = resolveVersion(own, item.id, day);
  if (
    !before ||
    !after ||
    before.id === after.id ||
    isSameValue(before.payload, after.payload)
  ) {
    return null;
  }
  const isReturn =
    before.effectiveUntil !== null &&
    before.effectiveUntil > previousDay &&
    before.effectiveUntil <= day &&
    after.createdAt < before.createdAt;
  const result: PlanChange = {
    on: day,
    startsOn: isReturn
      ? (before.effectiveUntil ?? day)
      : Math.max(after.effectiveFrom, previousDay + DAY_MS),
    itemId: item.id,
    kind: after.kind,
    isReturn,
    before,
    after,
  };
  return result;
};

const byDayThenItem = (a: PlanChange, b: PlanChange) =>
  a.on - b.on || a.itemId.localeCompare(b.itemId);

/**
 * The days from `from` through `to` on which a version of a pay, bill, envelope or goal takes effect
 * and what is planned for it differs from the day before, among them the day a stretch ends and the
 * earlier version returns. Callers pass a `from` after today so what already happened is left out.
 */
export function listPlanChangeDays(
  versions: readonly OpenVersion[],
  items: readonly PlanItemDoc[],
  from: DateOnly,
  to: DateOnly,
): PlanChange[] {
  const result = items
    .filter((item) => CHANGE_KINDS.includes(item.kind))
    .flatMap((item) => {
      const own = versions.filter((version) => version.itemId === item.id);
      const days = [
        ...new Set(
          own
            .flatMap((version) => [
              version.effectiveFrom,
              version.effectiveUntil,
            ])
            .filter(
              (on): on is number => on !== null && on >= from && on <= to,
            ),
        ),
      ];
      return days.flatMap((on) => {
        const change = isLive(item, on)
          ? compareDays(own, item, on - DAY_MS, on)
          : null;
        return change ? [change] : [];
      });
    })
    .sort(byDayThenItem);
  return result;
}

/**
 * What a coming income day plans differently from the income day before it of the same pay, because
 * a version started or ended between them. Day choices and bill timing are never versions, so they
 * never count; the pay's own amount is the day's headline, so `exceptItemId` leaves it out.
 */
export function listChangesBetweenIncomeDays(
  versions: readonly OpenVersion[],
  items: readonly PlanItemDoc[],
  previousOn: DateOnly,
  on: DateOnly,
  exceptItemId: string | null,
): PlanChange[] {
  const result = items
    .filter(
      (item) =>
        CHANGE_KINDS.includes(item.kind) &&
        item.id !== exceptItemId &&
        isLive(item, on),
    )
    .flatMap((item) => {
      const change = compareDays(
        versions.filter((version) => version.itemId === item.id),
        item,
        previousOn,
        on,
      );
      return change ? [change] : [];
    })
    .sort(byDayThenItem);
  return result;
}
