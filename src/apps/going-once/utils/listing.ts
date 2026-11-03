import { formatCentsShort } from '@/utils/moneyUtils';
import {
  CO_SELLER_DELETE_WINDOW_MS,
  CONDITION_LABELS,
  DID_NOT_SELL_LABEL,
  NOT_LISTED_LABEL,
  SALE_PAGE_PATH,
  type ITEM_SORT_OPTIONS,
} from '@apps/going-once/constants';
import type { Item } from '@apps/going-once/types';
import {
  formatCollectedChange,
  formatPickupWeekday,
} from '@apps/going-once/utils/status';

export type ItemSort = (typeof ITEM_SORT_OPTIONS)[number]['value'];

type Listable = Pick<Item, 'photos' | 'title' | 'askingPriceCents'>;

/** A thing buyers can be shown needs a photo, a name and a price; Free counts as a price. */
export function isListable(item: Listable): boolean {
  return (
    item.photos.length > 0 &&
    item.title.trim() !== '' &&
    item.askingPriceCents !== null
  );
}

/** The word an Available thing carries instead of "Available", or `undefined` while that word is right: "Not listed yet" while buyers can't be shown it, "Didn't sell" once the sale is finished. */
export function getAvailableLabel(
  item: Listable,
  isSaleFinished: boolean,
): string | undefined {
  if (!isListable(item)) return NOT_LISTED_LABEL;
  return isSaleFinished ? DID_NOT_SELL_LABEL : undefined;
}

/** "Free", "$150", or `null` while the thing has no price. */
export function formatAskingPrice(
  askingPriceCents: number | null,
): string | null {
  if (askingPriceCents === null) return null;
  return askingPriceCents === 0 ? 'Free' : formatCentsShort(askingPriceCents);
}

/** The text a seller pastes into another listing: only what buyers already see on the public page. Never the floor price, notes, where it was bought, the store's link or a hidden original price. */
export function listingText(
  item: Pick<
    Item,
    | 'title'
    | 'condition'
    | 'askingPriceCents'
    | 'description'
    | 'brandModel'
    | 'size'
    | 'originalPriceCents'
    | 'showOriginalPrice'
  >,
): string {
  const price = formatAskingPrice(item.askingPriceCents);
  const was =
    item.showOriginalPrice && item.originalPriceCents !== null
      ? `Was ${formatCentsShort(item.originalPriceCents)}`
      : null;
  const lines = [
    getItemName(item),
    [price, was].filter((part) => part !== null).join(' · '),
    item.condition === null
      ? ''
      : `Condition: ${CONDITION_LABELS[item.condition]}`,
    item.brandModel === null ? '' : `Brand or model: ${item.brandModel}`,
    item.size === null ? '' : `Size: ${item.size}`,
  ].filter((line) => line !== '');
  return [lines.join('\n'), item.description?.trim() ?? '']
    .filter((block) => block !== '')
    .join('\n\n');
}

/** What a thing is called on screen before it has a name. */
export function getItemName(item: Pick<Item, 'title'>): string {
  return item.title.trim() === '' ? 'Unnamed thing' : item.title.trim();
}

/** The seller can delete any thing; a co-seller only one they added within the last ten minutes. Mirrors `firestore.rules`, which has the last word. */
export function canDeleteItem(
  item: Pick<Item, 'createdBy' | 'createdAt'> &
    Partial<Record<'sale' | 'pending', unknown>>,
  { isSeller, uid, now }: { isSeller: boolean; uid: string; now: number },
): boolean {
  if (isSeller) return true;
  return (
    item.createdBy === uid &&
    now - item.createdAt < CO_SELLER_DELETE_WINDOW_MS &&
    (item.sale ?? null) === null &&
    (item.pending ?? null) === null
  );
}

/** "You added it 4 minutes ago", the sub-line under a co-seller's Delete thing. */
export function formatAddedAgo(createdAt: number, now: number): string {
  const minutes = Math.floor((now - createdAt) / 60_000);
  if (minutes < 1) return 'You added it just now';
  return `You added it ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
}

const describeAsked = ({ count, isAtLeast }: AskedCount) => {
  if (count === 0) return null;
  const people = count === 1 && !isAtLeast ? '1 person' : `${count} people`;
  const stays =
    count === 1 && !isAtLeast ? 'Their message stays' : 'Their messages stay';
  return `${isAtLeast ? 'At least ' : ''}${people} asked about it. ${stays} in the Inbox.`;
};

/** How many people asked about a thing, and whether that is only the most recent the Inbox has loaded. */
export interface AskedCount {
  count: number;
  isAtLeast: boolean;
}

/** What goes with a thing when it is deleted, for the confirm: its hold, the effect on Collected, its photos, and the people who asked about it (their messages stay). */
export function getDeleteEffects(
  item: Pick<Item, 'photos' | 'status' | 'pending' | 'sale'>,
  collectedCents: number,
  asked: AskedCount,
): string[] {
  const count = item.photos.length;
  const { pending, sale } = item;
  return [
    item.status === 'PENDING' && pending !== null
      ? `${pending.buyerName ?? 'Someone'} is set to pick this up${pending.pickupOn === null ? '' : ` ${formatPickupWeekday(pending.pickupOn)}`}.`
      : null,
    item.status === 'SOLD' && sale !== null
      ? `${formatCollectedChange(collectedCents, collectedCents - sale.priceCents)}.`
      : null,
    count === 0
      ? null
      : `${count === 1 ? 'Its photo goes' : `Its ${count} photos go`} with it.`,
    describeAsked(asked),
  ].filter((effect) => effect !== null);
}

/** Things in the order asked for; newest first is the order they arrive in, a thing with no price goes last by price. */
export function sortItems(items: Item[], sort: ItemSort): Item[] {
  if (sort === 'newest') return items;
  if (sort === 'name')
    return [...items].sort((first, second) =>
      getItemName(first).localeCompare(getItemName(second)),
    );
  const priceOf = (item: Item) => item.askingPriceCents ?? Infinity;
  return [...items].sort((first, second) => {
    if (priceOf(first) < priceOf(second)) return -1;
    return priceOf(first) > priceOf(second) ? 1 : 0;
  });
}

/** Whether a search matches a thing's name, description or brand or model. */
export function matchesSearch(item: Item, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [item.title, item.description, item.brandModel].some((text) =>
    text?.toLowerCase().includes(needle),
  );
}

/** The public page's address for one thing on it, which opens the page with that thing's drawer. */
export function getThingPagePath(linkId: string, thingId: string): string {
  return `${SALE_PAGE_PATH}${linkId}/${thingId}`;
}
