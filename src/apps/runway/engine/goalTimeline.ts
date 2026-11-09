import type { GoalSealed, GoalVersion, PlanItemDoc } from '@apps/runway/types';

import { DAY_MS } from './dates';
import { isSavingFor, type PaceStretch } from './pace';
import { getVersionStretches } from './resolve';

/** A goal's version while it holds: `from` inclusive, `until` exclusive, null when it holds on. */
export interface GoalStretch {
  payload: GoalSealed;
  from: number;
  until: number | null;
}

/** The stretches from `today` over which one goal's version stays the same, cut at the day it ends (`endedAt` is its last day) or is archived; a gap with no version is not a stretch. */
export function getGoalStretches(
  versions: readonly { kind: string; itemId: string }[],
  header: Pick<PlanItemDoc, 'id' | 'endedAt' | 'archivedAt'>,
  today: number,
): GoalStretch[] {
  const own = versions.filter(
    (version): version is GoalVersion =>
      version.kind === 'goal' && version.itemId === header.id,
  );
  const cutoff = Math.min(
    header.endedAt === null ? Infinity : header.endedAt + DAY_MS,
    header.archivedAt ?? Infinity,
  );
  const cutAt = (until: number | null) => {
    if (until === null) return Number.isFinite(cutoff) ? cutoff : null;
    return Math.min(until, cutoff);
  };
  const result = getVersionStretches<GoalVersion, GoalSealed>(
    own,
    header.id,
    today,
  )
    .filter((stretch) => stretch.effectiveFrom < cutoff)
    .map((stretch) => ({
      payload: stretch.payload,
      from: stretch.effectiveFrom,
      until: cutAt(stretch.effectiveUntil),
    }));
  return result;
}

/** The goal's stretches as the pace reads them; `adjust` changes what a stretch asks (the priority dial's trimmed rule). */
export const toPaceStretches = (
  stretches: readonly GoalStretch[],
  adjust: (payload: GoalSealed) => Partial<GoalSealed> = () => ({}),
): PaceStretch[] =>
  stretches.map(({ payload, from, until }) => ({
    goal: { ...payload, ...adjust(payload) },
    from,
    until,
    isSaving: isSavingFor(payload),
  }));

/** The goal's stretches from `today` as the pace reads them; empty when it has ended or been archived, so it puts nothing in ahead. */
export const getGoalPaceStretches = (
  versions: readonly { kind: string; itemId: string }[],
  header: Pick<PlanItemDoc, 'id' | 'endedAt' | 'archivedAt'>,
  today: number,
  adjust?: (payload: GoalSealed) => Partial<GoalSealed>,
): PaceStretch[] =>
  toPaceStretches(getGoalStretches(versions, header, today), adjust);
