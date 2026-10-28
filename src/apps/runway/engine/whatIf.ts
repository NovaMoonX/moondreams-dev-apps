import type { Draft } from './draft';
import type { Cents } from '@apps/runway/types';

export const WHAT_IF_VERSION_ID = 'what-if';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A version that exists only in memory: it is made after every real one, so it wins wherever it covers. */
export function layerVersion<
  V extends { id: string; itemId: string; createdAt: number },
>(
  versions: readonly V[],
  virtual: DistributiveOmit<V, 'id' | 'createdAt'>,
): V[] {
  const layered = {
    ...virtual,
    id: WHAT_IF_VERSION_ID,
    createdAt: Number.MAX_SAFE_INTEGER,
  } as V;
  return [...versions, layered];
}

export interface LineEffect {
  itemId: string;
  beforeCents: Cents;
  afterCents: Cents;
}

export interface DayEffect {
  freeBeforeCents: Cents;
  freeAfterCents: Cents;
  moneyBeforeCents: Cents;
  moneyAfterCents: Cents;
  lines: LineEffect[];
}

const sumByItem = (draft: Draft) =>
  draft.lines.reduce<Map<string, Cents>>(
    (acc, line) =>
      acc.set(line.itemId, (acc.get(line.itemId) ?? 0) + line.cents),
    new Map(),
  );

/** What differs between a day's draft without a change and with it; null when nothing about the day moves. */
export function compareDrafts(before: Draft, after: Draft): DayEffect | null {
  const was = sumByItem(before);
  const now = sumByItem(after);
  const lines = [...new Set([...was.keys(), ...now.keys()])]
    .map((itemId) => ({
      itemId,
      beforeCents: was.get(itemId) ?? 0,
      afterCents: now.get(itemId) ?? 0,
    }))
    .filter((line) => line.beforeCents !== line.afterCents);
  const effect: DayEffect = {
    freeBeforeCents: before.freeToSpend.cents,
    freeAfterCents: after.freeToSpend.cents,
    moneyBeforeCents: before.moneyCents,
    moneyAfterCents: after.moneyCents,
    lines,
  };
  const isSame =
    lines.length === 0 &&
    effect.freeBeforeCents === effect.freeAfterCents &&
    effect.moneyBeforeCents === effect.moneyAfterCents;
  return isSame ? null : effect;
}
