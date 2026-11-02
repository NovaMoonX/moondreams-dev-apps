import { LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import type {
  DayOverrideSealed,
  MoneyRange,
  OpenVersion,
  Pairing,
  PayLineVersion,
  PlanItemDoc,
  SourceVersion,
  Stance,
} from '@apps/runway/types';

import { addUtcMonths, DAY_MS, toDayKey } from './dates';
import { percentOf } from './money';
import { resolveCurrentOrNext, resolveVersion } from './resolve';
import { effectiveStance, pick } from './stance';
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

const oneTimeCache = new WeakMap<object, ReadonlySet<string>>();

/** The pay lines that pay once (a freelance payment, a bonus), by id, one set per list of versions. */
export function getOneTimePayLineIds(
  versions: readonly OpenVersion[],
): ReadonlySet<string> {
  const known = oneTimeCache.get(versions);
  if (known) return known;
  const result = new Set(
    versions
      .filter(isPayLine)
      .filter((version) => version.payload.schedule.kind === 'once')
      .map((version) => version.itemId),
  );
  oneTimeCache.set(versions, result);
  return result;
}

const pairedCache = new WeakMap<
  object,
  {
    versions: object;
    openDays: object;
    stance: Stance;
    result: Map<string, Record<string, number>>;
  }
>();

/**
 * What each coming pay's "pay these first" set asks of each bill, by bill id and then day key: the
 * day's own set, else its pay line's, else its source's. Only a fixed figure or a share of the
 * day's money is known ahead, counted only as far as the day's money reaches once its other
 * pairings have theirs; a share of what remains or the rest of the day is left out.
 */
export function getPairedByBill(
  versions: readonly OpenVersion[],
  openDays: readonly {
    id: string;
    override: Pick<DayOverrideSealed, 'pairings'>;
  }[],
  days: readonly ComingDay[],
  stance: Stance,
): Map<string, Record<string, number>> {
  const known = pairedCache.get(days);
  if (
    known &&
    known.versions === versions &&
    known.openDays === openDays &&
    known.stance === stance
  )
    return known.result;
  const payLines = versions.filter(isPayLine);
  const sources = versions.filter(isSource);
  const overrides = new Map(
    openDays.map((day) => [day.id, day.override.pairings]),
  );
  const pairingsOf = (day: ComingDay): readonly Pairing[] => {
    const own = overrides.get(day.dayKey);
    if (own) return own;
    const line =
      resolveCurrentOrNext(payLines, day.payLineId, day.on)?.payload.pairings ??
      [];
    if (line.length > 0 || day.sourceId === null) return line;
    return (
      resolveCurrentOrNext(sources, day.sourceId, day.on)?.payload.pairings ??
      []
    );
  };
  const result = days.reduce((acc, day) => {
    const money = pick(
      effectiveStance(stance, day.stanceOverride),
      day.amount,
      'income',
    );
    const asks = pairingsOf(day).map(({ targetItemId, amount }) => ({
      targetItemId,
      cents:
        amount.kind === 'exact'
          ? amount.cents
          : amount.kind === 'percent' && amount.of === 'dayMoney'
            ? percentOf(money, amount.bps)
            : null,
    }));
    const asked = asks.reduce((sum, ask) => sum + (ask.cents ?? 0), 0);
    asks.forEach(({ targetItemId, cents }) => {
      if (cents === null || acc.get(targetItemId)?.[day.dayKey] !== undefined)
        return;
      const fundable = Math.min(cents, Math.max(0, money - (asked - cents)));
      acc.set(targetItemId, {
        ...acc.get(targetItemId),
        [day.dayKey]: fundable,
      });
    });
    return acc;
  }, new Map<string, Record<string, number>>());
  pairedCache.set(days, { versions, openDays, stance, result });
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
