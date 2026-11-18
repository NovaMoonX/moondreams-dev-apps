import {
  EXECUTION_KEEP_DAYS,
  OBSERVATION_KEEP_WEEKS,
  PATTERN_LIVE_CAP,
  PATTERN_OFF_CAP,
  PRUNE_RUN_CAP,
  REFLECTION_KEEP_DAYS,
  SEEN_AS_REMOVED_CAP,
  SEEN_AS_SHOWN_CAP,
} from '@apps/helm/constants';
import type { Pattern } from '@apps/helm/types';

const DAY_MS = 86_400_000;

export type PrunableCollection =
  'observations' | 'reflections' | 'executions' | 'patterns' | 'seenAs';

export interface PruneInput {
  observations: { id: string; at: number }[];
  patterns: {
    id: string;
    isLive: boolean;
    offReason: Pattern['offReason'];
    /** Lines and evidence already cleared down to the signature. */
    isCut: boolean;
    offAt: number | null;
    lastEvidenceAt: number | null;
    sourceKeys: string[];
    evidence: Pattern['evidence'];
  }[];
  reflections: { dayKey: string; seenAt: number | null }[];
  executions: { id: string; createdAt: number }[];
  seenAs: {
    id: string;
    status: 'shown' | 'corrected' | 'removed';
    isDerived: boolean;
    createdAt: number;
  }[];
  now: number;
}

export interface PruneResult {
  deletes: { collection: PrunableCollection; id: string }[];
  /** Stopped patterns to cut down to their signature. */
  cuts: string[];
  /** Live patterns past the cap to retire, their answer kept. */
  retires: string[];
}

const oldestFirst = <Item>(items: Item[], at: (item: Item) => number) =>
  [...items].sort((first, second) => at(first) - at(second));

const citedObservationIds = (patterns: PruneInput['patterns']) =>
  new Set(
    patterns
      .filter((pattern) => pattern.isLive)
      .flatMap((pattern) => [
        ...pattern.sourceKeys
          .filter((key) => key.startsWith('observations/'))
          .map((key) => key.slice('observations/'.length)),
        ...(pattern.evidence.kind === 'said'
          ? pattern.evidence.observationIds
          : []),
      ]),
  );

/** What the weekly clean-up removes, by kind, at most 400 steps a run (cuts and retires first, since they keep the cap honest). */
export function readPrunable(input: PruneInput): PruneResult {
  const { now } = input;
  const cited = citedObservationIds(input.patterns);
  const cuts = input.patterns
    .filter((pattern) => pattern.offReason !== null && !pattern.isCut)
    .map((pattern) => pattern.id);
  const live = input.patterns.filter((pattern) => pattern.isLive);
  const retires = oldestFirst(live, (pattern) => pattern.lastEvidenceAt ?? 0)
    .slice(0, Math.max(0, live.length - PATTERN_LIVE_CAP))
    .map((pattern) => pattern.id);
  const off = input.patterns.filter((pattern) => pattern.offReason !== null);
  const offDrops = oldestFirst(off, (pattern) => pattern.offAt ?? 0)
    .slice(0, Math.max(0, off.length - PATTERN_OFF_CAP))
    .map((pattern) => ({ collection: 'patterns' as const, id: pattern.id }));
  const observationDrops = input.observations
    .filter(
      (one) =>
        now - one.at > OBSERVATION_KEEP_WEEKS * 7 * DAY_MS &&
        !cited.has(one.id),
    )
    .map((one) => ({ collection: 'observations' as const, id: one.id }));
  const reflectionDrops = input.reflections
    .filter(
      (one) =>
        one.seenAt !== null && now - one.seenAt > REFLECTION_KEEP_DAYS * DAY_MS,
    )
    .map((one) => ({ collection: 'reflections' as const, id: one.dayKey }));
  const executionDrops = input.executions
    .filter((one) => now - one.createdAt > EXECUTION_KEEP_DAYS * DAY_MS)
    .map((one) => ({ collection: 'executions' as const, id: one.id }));
  const shown = input.seenAs.filter((line) => line.status !== 'removed');
  const removed = input.seenAs.filter((line) => line.status === 'removed');
  const derivedShown = oldestFirst(
    shown.filter((line) => line.status === 'shown' && line.isDerived),
    (line) => line.createdAt,
  );
  const seenAsDrops = [
    ...derivedShown.slice(0, Math.max(0, shown.length - SEEN_AS_SHOWN_CAP)),
    ...oldestFirst(removed, (line) => line.createdAt).slice(
      0,
      Math.max(0, removed.length - SEEN_AS_REMOVED_CAP),
    ),
  ].map((line) => ({ collection: 'seenAs' as const, id: line.id }));
  const steps = [
    ...cuts.map((id) => ({ kind: 'cut' as const, id })),
    ...retires.map((id) => ({ kind: 'retire' as const, id })),
    ...[
      ...observationDrops,
      ...reflectionDrops,
      ...executionDrops,
      ...offDrops,
      ...seenAsDrops,
    ].map((drop) => ({ kind: 'delete' as const, drop })),
  ].slice(0, PRUNE_RUN_CAP);
  return {
    cuts: steps.flatMap((step) => (step.kind === 'cut' ? [step.id] : [])),
    retires: steps.flatMap((step) => (step.kind === 'retire' ? [step.id] : [])),
    deletes: steps.flatMap((step) =>
      step.kind === 'delete' ? [step.drop] : [],
    ),
  };
}
