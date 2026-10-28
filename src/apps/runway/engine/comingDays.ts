import { LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import type {
  MoneyRange,
  OpenVersion,
  PayLineVersion,
  PlanItemDoc,
  SourceVersion,
} from '@apps/runway/types';

import { addUtcMonths, toDayKey } from './dates';
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
}

const isPayLine = (version: OpenVersion): version is PayLineVersion =>
  version.kind === 'payLine';
const isSource = (version: OpenVersion): version is SourceVersion =>
  version.kind === 'source';

/**
 * The income days from `today` through `LOOKAHEAD_MONTHS` ahead, computed from each pay line's
 * schedule and never stored. Each day takes its amount from the version in force on that date.
 */
export function buildComingDays(
  items: readonly PlanItemDoc[],
  versions: readonly OpenVersion[],
  today: number,
): ComingDay[] {
  const payLineVersions = versions.filter(isPayLine);
  const sourceVersions = versions.filter(isSource);
  const until = addUtcMonths(today, LOOKAHEAD_MONTHS);

  const result = items
    .filter((item) => item.kind === 'payLine' && item.archivedAt === null)
    .flatMap((item) => {
      const scheduled = resolveCurrentOrNext(payLineVersions, item.id, today);
      if (!scheduled) return [];
      const lastDay =
        item.endedAt === null ? until : Math.min(until, item.endedAt);
      const sourceName =
        item.parentId === null
          ? null
          : (resolveCurrentOrNext(sourceVersions, item.parentId, today)?.payload
              .name ?? null);
      return occurrences(
        scheduled.payload.schedule,
        scheduled.payload.ending,
        today,
        lastDay,
      ).map((on): ComingDay => {
        const inForce =
          resolveVersion(payLineVersions, item.id, on) ?? scheduled;
        return {
          dayKey: toDayKey(item.id, on),
          payLineId: item.id,
          sourceId: item.parentId,
          on,
          sourceName,
          payLineName: inForce.payload.name,
          amount: inForce.payload.amount,
        };
      });
    })
    .sort(
      (a, b) =>
        a.on - b.on || (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0),
    );
  return result;
}
