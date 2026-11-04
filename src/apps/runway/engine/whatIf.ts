import type { Draft } from './draft';
import { getCostNameKey } from './parts';
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
  /** What names the line in a day's names: the item's id, or the cost's own key for a Horizon cost line. */
  key: string;
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
    key: string;
    /** What the pay puts in toward the line, the same before and after. */
    putInCents: Cents;
    beforeShortCents: Cents;
    afterShortCents: Cents;
  }[];
}

const lineKey = (line: Draft['lines'][number]) =>
  line.costId ? getCostNameKey(line.itemId, line.costId) : line.itemId;

const itemOfKey = (draft: Draft, key: string) =>
  draft.lines.find((line) => lineKey(line) === key)?.itemId ?? key;

const sumByKey = (
  draft: Draft,
  pick: (line: Draft['lines'][number]) => Cents,
) =>
  draft.lines.reduce<Map<string, Cents>>(
    (acc, line) =>
      line.repaysFree
        ? acc
        : acc.set(lineKey(line), (acc.get(lineKey(line)) ?? 0) + pick(line)),
    new Map(),
  );

/** What differs between a day's draft without a change and with it; null when nothing about the day moves. */
export function compareDrafts(before: Draft, after: Draft): DayEffect | null {
  const itemOf = (key: string) =>
    itemOfKey(after, key) !== key
      ? itemOfKey(after, key)
      : itemOfKey(before, key);
  const was = sumByKey(before, (line) => line.cents);
  const now = sumByKey(after, (line) => line.cents);
  const lines = [...new Set([...was.keys(), ...now.keys()])]
    .map((key) => ({
      itemId: itemOf(key),
      key,
      beforeCents: was.get(key) ?? 0,
      afterCents: now.get(key) ?? 0,
    }))
    .filter((line) => line.beforeCents !== line.afterCents);
  const wasShort = sumByKey(before, (line) => line.shortBy);
  const nowShort = sumByKey(after, (line) => line.shortBy);
  const shortened = [...new Set([...wasShort.keys(), ...nowShort.keys()])]
    .map((key) => ({
      itemId: itemOf(key),
      key,
      putInCents: now.get(key) ?? 0,
      beforeShortCents: wasShort.get(key) ?? 0,
      afterShortCents: nowShort.get(key) ?? 0,
    }))
    .filter(
      (entry) =>
        entry.beforeShortCents !== entry.afterShortCents &&
        !lines.some((line) => line.key === entry.key),
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
