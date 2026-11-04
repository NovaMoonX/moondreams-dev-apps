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
  /** Items whose line holds the same money but comes up shorter or less short: the pay's plan for them moved though its money did not. */
  shortened: {
    itemId: string;
    beforeShortCents: Cents;
    afterShortCents: Cents;
  }[];
}

const sumByItem = (draft: Draft) =>
  draft.lines.reduce<Map<string, Cents>>(
    (acc, line) =>
      line.repaysFree
        ? acc
        : acc.set(line.itemId, (acc.get(line.itemId) ?? 0) + line.cents),
    new Map(),
  );

const shortByItem = (draft: Draft) =>
  draft.lines.reduce<Map<string, Cents>>(
    (acc, line) =>
      line.repaysFree
        ? acc
        : acc.set(line.itemId, (acc.get(line.itemId) ?? 0) + line.shortBy),
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
  const wasShort = shortByItem(before);
  const nowShort = shortByItem(after);
  const shortened = [...new Set([...wasShort.keys(), ...nowShort.keys()])]
    .map((itemId) => ({
      itemId,
      beforeShortCents: wasShort.get(itemId) ?? 0,
      afterShortCents: nowShort.get(itemId) ?? 0,
    }))
    .filter(
      (entry) =>
        entry.beforeShortCents !== entry.afterShortCents &&
        !lines.some((line) => line.itemId === entry.itemId),
    );
  const effect: DayEffect = {
    freeBeforeCents: before.freeToSpend.cents,
    freeAfterCents: after.freeToSpend.cents,
    moneyBeforeCents: before.moneyCents,
    moneyAfterCents: after.moneyCents,
    lines,
    shortened,
  };
  const isSame =
    lines.length === 0 &&
    shortened.length === 0 &&
    effect.freeBeforeCents === effect.freeAfterCents &&
    effect.moneyBeforeCents === effect.moneyAfterCents;
  return isSame ? null : effect;
}
