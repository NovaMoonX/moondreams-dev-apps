import { LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import type {
  MoneyRange,
  OpenVersion,
  PayLineVersion,
  PlanItemDoc,
  SourceVersion,
  Stance,
} from '@apps/runway/types';

import { addUtcMonths, DAY_MS, toDayKey } from './dates';
import { resolveCurrentOrNext, resolveVersion } from './resolve';
import { occurrences } from './schedule';

export interface ComingDay {
  dayKey: string;
  payLineId: string;
  sourceId: string | null;
  on: number;
  sourceName: string | null;
  payLineName: string;
  amount: MoneyRange;
  /** The pay line's own stance; null means the plan's applies. */
  stanceOverride: Stance | null;
}

const isPayLine = (version: OpenVersion): version is PayLineVersion =>
  version.kind === 'payLine';
const isSource = (version: OpenVersion): version is SourceVersion =>
  version.kind === 'source';

/**
 * Splits `from`..`to` where an item's version in force can change, so a schedule that changes from a
 * date ahead applies from that date and the old one stops the day before.
 */
function getSegments(
  versions: readonly { effectiveFrom: number; effectiveUntil: number | null }[],
  from: number,
  to: number,
) {
  const starts = [
    ...new Set([
      from,
      ...versions
        .flatMap((entry) => [entry.effectiveFrom, entry.effectiveUntil])
        .filter(
          (date): date is number => date !== null && date > from && date <= to,
        ),
    ]),
  ].sort((a, b) => a - b);
  const result = starts.map((start, index) => ({
    start,
    end: index + 1 < starts.length ? starts[index + 1] - DAY_MS : to,
  }));
  return result;
}

/**
 * The income days from `today` through `LOOKAHEAD_MONTHS` ahead, computed from each pay line's
 * schedule and never stored. Each day takes its amount from the version in force on that date.
 */
export function buildComingDays(
  items: readonly PlanItemDoc[],
  versions: readonly OpenVersion[],
  today: number,
  from: number = today,
): ComingDay[] {
  const payLineVersions = versions.filter(isPayLine);
  const sourceVersions = versions.filter(isSource);
  const until = addUtcMonths(today, LOOKAHEAD_MONTHS);

  const result = items
    .filter((item) => item.kind === 'payLine' && item.archivedAt === null)
    .flatMap((item) => {
      const own = payLineVersions.filter((entry) => entry.itemId === item.id);
      const lastDay =
        item.endedAt === null ? until : Math.min(until, item.endedAt);
      const sourceName =
        item.parentId === null
          ? null
          : (resolveCurrentOrNext(sourceVersions, item.parentId, from)?.payload
              .name ?? null);
      return getSegments(own, from, lastDay).flatMap(({ start, end }) => {
        const scheduled = resolveCurrentOrNext(own, item.id, start);
        if (!scheduled) return [];
        return occurrences(
          scheduled.payload.schedule,
          scheduled.payload.ending,
          start,
          end,
        ).map((on): ComingDay => {
          const inForce = resolveVersion(own, item.id, on) ?? scheduled;
          return {
            dayKey: toDayKey(item.id, on),
            payLineId: item.id,
            sourceId: item.parentId,
            on,
            sourceName,
            payLineName: inForce.payload.name,
            amount: inForce.payload.amount,
            stanceOverride: inForce.payload.stanceOverride ?? null,
          };
        });
      });
    })
    .sort(
      (a, b) =>
        a.on - b.on || (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0),
    );
  return result;
}

/** A day that has a document, described from the plan as it stood on its date; null when its pay line no longer resolves. */
export function describeDay(
  versions: readonly OpenVersion[],
  day: { payLineId: string; sourceId: string | null; expectedOn: number },
): ComingDay | null {
  const payLine = resolveCurrentOrNext(
    versions.filter(isPayLine),
    day.payLineId,
    day.expectedOn,
  );
  if (!payLine) return null;
  const sourceVersion =
    day.sourceId === null
      ? null
      : resolveCurrentOrNext(
          versions.filter(isSource),
          day.sourceId,
          day.expectedOn,
        );
  const result: ComingDay = {
    dayKey: toDayKey(day.payLineId, day.expectedOn),
    payLineId: day.payLineId,
    sourceId: day.sourceId,
    on: day.expectedOn,
    sourceName: sourceVersion?.payload.name ?? null,
    payLineName: payLine.payload.name,
    amount: payLine.payload.amount,
    stanceOverride: payLine.payload.stanceOverride ?? null,
  };
  return result;
}
