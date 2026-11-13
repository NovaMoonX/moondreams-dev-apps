import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import { PAYMENT_METHOD_LABELS } from '@apps/going-once/constants';
import type { Bundle, BundleChange, Item } from '@apps/going-once/types';
import { getItemName } from '@apps/going-once/utils/listing';
import { splitPaid, type BundleParts } from '@apps/going-once/utils/bundles';
import { formatChangeTime } from '@apps/going-once/utils/status';

/** What buyers save by buying the deal as a bundle; never below 0. */
export const getSaving = (priceCents: number, separateCents: number) =>
  Math.max(0, separateCents - priceCents);

/** "4 things", the bundle's size as a row says it. */
export const formatThingCount = (count: number) =>
  `${count} ${count === 1 ? 'thing' : 'things'}`;

/** "save $10", or `null` while the bundle saves nothing. */
export const formatSaveShort = (priceCents: number, separateCents: number) => {
  const saving = getSaving(priceCents, separateCents);
  return saving === 0 ? null : `save ${formatCentsShort(saving)}`;
};

/** "Separately $85 · buyers save $10" under the form's price. */
export function formatSeparatelyLine(
  priceCents: number,
  separateCents: number,
): string {
  const separately = `Separately ${formatCentsShort(separateCents)}`;
  if (priceCents > separateCents)
    return `${separately} · More than buying them one by one`;
  const saving = getSaving(priceCents, separateCents);
  return saving === 0
    ? `${separately} · No saving yet`
    : `${separately} · buyers save ${formatCentsShort(saving)}`;
}

/** "Split by asking price: Bed $40 · Tree $30". */
export function formatSplitLine(totalCents: number, deal: Item[]): string {
  const shares = splitPaid(
    totalCents,
    deal.map((item) => item.askingPriceCents ?? 0),
  );
  return `Split by asking price: ${deal
    .map(
      (item, index) =>
        `${getItemName(item)} ${formatCentsShort(shares[index])}`,
    )
    .join(' · ')}`;
}

/** The sentence under a sheet's price when the last change moved it because a thing left or came back. */
export function describePriceMove(
  bundle: Bundle,
  itemsById: Record<string, Item>,
): string | null {
  const last = bundle.history.at(-1);
  if (last === undefined || last.itemId === null) return null;
  if (last.kind !== 'THING_LEFT' && last.kind !== 'THING_BACK') return null;
  const thing = itemsById[last.itemId];
  const name = thing === undefined ? 'A thing' : getItemName(thing);
  const now = formatCentsShort(bundle.priceCents);
  return last.kind === 'THING_LEFT'
    ? `${name} ${describeLeaving(last)}, so the bundle is ${now} now`
    : `${name} came back, so the bundle is ${now} now`;
}

const describeLeaving = (change: BundleChange) => {
  if (change.itemStatus === 'SOLD') return 'sold on its own';
  if (change.itemStatus === 'PENDING') return 'is held on its own';
  if (change.itemStatus === 'WITHDRAWN') return 'was taken off the list';
  return 'left on its own';
};

export interface BundleWords {
  getName: (uid: string) => string;
  itemsById: Record<string, Item>;
}

/** What a bundle history row says happened, without who or when. */
export function describeBundleChange(
  change: BundleChange,
  { getName, itemsById }: BundleWords,
): string {
  const price =
    change.priceCents === null ? null : formatCentsShort(change.priceCents);
  const was =
    change.fromPriceCents === null
      ? ''
      : ` (was ${formatCentsShort(change.fromPriceCents)})`;
  const found = change.itemId === null ? undefined : itemsById[change.itemId];
  const thing = found === undefined ? 'A thing' : getItemName(found);
  const now = price === null ? '' : ` · now ${price}`;
  switch (change.kind) {
    case 'CREATE':
      return `${getName(change.byUid)} made the bundle${price === null ? '' : ` · ${price}`}`;
    case 'EDIT':
      return `${getName(change.byUid)} changed the bundle${price === null ? '' : ` · ${price}`}`;
    case 'SET_PRICE':
      return `Price set to ${price ?? '$0'}${was}`;
    case 'THING_LEFT':
      return `${thing} ${describeLeaving(change)}${now}`;
    case 'THING_BACK':
      return `${thing} came back${now}`;
    case 'MARK_PENDING':
      return 'Held for a buyer';
    case 'BACK_TO_AVAILABLE':
      return 'Back to available';
    case 'MARK_SOLD':
      return `Sold for ${price ?? '$0'}`;
    case 'CHANGE_PAID':
      return `Paid changed to ${price ?? '$0'}${was}`;
    case 'NOT_SOLD':
      return 'Not sold after all';
    case 'UNDO_SOLD':
      return 'Sale put back';
  }
}

/** Who and when after a history sentence; the two sentences that start with a name carry only the time. */
export function describeBundleChangeLine(
  change: BundleChange,
  words: BundleWords,
): string {
  const sentence = describeBundleChange(change, words);
  const time = formatChangeTime(change.at);
  return change.kind === 'CREATE' || change.kind === 'EDIT'
    ? `${sentence} · ${time}`
    : `${sentence} · ${words.getName(change.byUid)} · ${time}`;
}

/** "Sold $70 · Venmo · Oct 31". */
export function formatBundleSold(bundle: Bundle): string | null {
  const { sale } = bundle;
  if (sale === null) return null;
  return [
    `Sold ${formatCentsShort(sale.priceCents)}`,
    sale.method === null ? null : PAYMENT_METHOD_LABELS[sale.method],
    formatDateShortUTC(sale.soldOn),
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

/** The row's muted line after its status: "4 things · save $10", or the unbundle hint. */
export function formatBundleFacts(
  bundle: Bundle,
  parts: BundleParts,
  isSuggesting: boolean,
): string {
  const count =
    bundle.status === 'ACTIVE'
      ? parts.deal.length
      : (bundle.dealItemIds?.length ?? 0);
  return [
    formatThingCount(count),
    isSuggesting
      ? 'Most of it went on its own'
      : formatSaveShort(bundle.priceCents, parts.separateCents),
  ]
    .filter((part) => part !== null)
    .join(' · ');
}
