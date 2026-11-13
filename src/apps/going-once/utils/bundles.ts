import type { Bundle, BundleChange, Item } from '@apps/going-once/types';

/** A bundle's history with one more entry, keeping the last `limit` (oldest first). */
export const appendBundleChange = (
  history: BundleChange[],
  change: BundleChange,
  limit: number,
): BundleChange[] => [...history, change].slice(-limit);

export interface BundleParts {
  /** The things the bundle price covers now. */
  deal: Item[];
  /** Things that went on their own (held, sold or taken off by themselves). */
  gone: Item[];
  /** The deal's asking prices added up. */
  separateCents: number;
  /** Every thing's asking price added up, gone ones included. */
  originalCents: number;
  goneCents: number;
}

const askingOf = (item: Item) => item.askingPriceCents ?? 0;
const sumAsking = (items: Item[]) =>
  items.reduce((total, item) => total + askingOf(item), 0);

const isInDeal = (bundle: Bundle, item: Item) =>
  bundle.status === 'ACTIVE'
    ? item.status === 'AVAILABLE'
    : (bundle.dealItemIds ?? []).includes(item.id);

/** Splits a bundle's things into what its price covers now and what has gone on its own. */
export function getBundleParts(
  bundle: Bundle,
  itemsById: Record<string, Item>,
): BundleParts {
  const members = bundle.itemIds
    .map((id) => itemsById[id])
    .filter((item): item is Item => item !== undefined);
  const deal = members.filter((item) => isInDeal(bundle, item));
  const gone = members.filter((item) => !isInDeal(bundle, item));
  return {
    deal,
    gone,
    separateCents: sumAsking(deal),
    originalCents: sumAsking(members),
    goneCents: sumAsking(gone),
  };
}

/** The bundle price after a thing leaves (negative delta) or comes back, never below 0 nor above buying the deal separately. */
export const adjustBundlePrice = (
  priceCents: number,
  deltaCents: number,
  separateCents: number,
) => Math.max(0, Math.min(priceCents + deltaCents, separateCents));

/** Raises a bundle's price by each thing that came back while it was held, one THING_BACK history entry per thing; `separateCents` is the new offer's asking total. */
export const applyThingsBack = (
  bundle: Bundle,
  history: BundleChange[],
  came: Item[],
  separateCents: number,
  uid: string,
  now: number,
  limit: number,
) =>
  came.reduce(
    (result, item) => {
      const priceCents = adjustBundlePrice(
        result.priceCents,
        askingOf(item),
        separateCents,
      );
      return {
        ...result,
        priceCents,
        history: appendBundleChange(
          result.history,
          {
            kind: 'THING_BACK',
            byUid: uid,
            at: now,
            itemId: item.id,
            itemStatus: 'AVAILABLE',
            priceCents,
            fromPriceCents: result.priceCents,
          },
          limit,
        ),
      };
    },
    {
      priceCents: bundle.priceCents,
      history,
      keptAtGoneCount: came.length > 0 ? null : bundle.keptAtGoneCount,
    },
  );

/** Whether a thing can't be bought on its own right now: only while its bundle is on offer with two or more things. */
export const isSoloLocked = (
  item: Item,
  bundle: Bundle | null,
  dealCount: number,
) =>
  item.isBundleOnly &&
  bundle !== null &&
  bundle.status === 'ACTIVE' &&
  item.status === 'AVAILABLE' &&
  dealCount >= 2;

/** Suggest Unbundle once half the bundle's asking total is gone, one thing is left (also after the others were deleted) or the price reached 0; Keep the bundle quiets it until another thing goes. */
export function shouldSuggestUnbundle(
  bundle: Bundle,
  parts: BundleParts,
): boolean {
  if (bundle.status !== 'ACTIVE') return false;
  if (
    bundle.keptAtGoneCount !== null &&
    parts.gone.length <= bundle.keptAtGoneCount
  )
    return false;
  if (parts.gone.length === 0) return parts.deal.length === 1;
  return (
    parts.deal.length <= 1 ||
    parts.goneCents * 2 >= parts.originalCents ||
    (bundle.priceCents === 0 && parts.separateCents > 0)
  );
}

/** Splits what was paid across things by their asking prices to the cent (largest remainder); a free thing gets 0, and all-free shares go to the first. */
export function splitPaid(totalCents: number, askings: number[]): number[] {
  const weight = askings.reduce((sum, cents) => sum + cents, 0);
  if (askings.length === 0) return [];
  if (weight === 0)
    return askings.map((_, index) => (index === 0 ? totalCents : 0));
  const exact = askings.map((cents) => (totalCents * cents) / weight);
  const floors = exact.map(Math.floor);
  const left = totalCents - floors.reduce((sum, cents) => sum + cents, 0);
  const extra = new Set(
    exact
      .map((value, index) => ({ index, rest: value - floors[index] }))
      .sort((a, b) => b.rest - a.rest || a.index - b.index)
      .slice(0, left)
      .map(({ index }) => index),
  );
  return floors.map((cents, index) => cents + (extra.has(index) ? 1 : 0));
}

/** "Cat stuff (4 things)", the label an inquiry keeps of the bundle it asked about. */
export const toBundleLabel = (name: string, count: number) =>
  `${name} (${count} ${count === 1 ? 'thing' : 'things'})`;
