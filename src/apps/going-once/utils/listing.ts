import { formatCentsShort } from '@/utils/moneyUtils';
import {
  CO_SELLER_DELETE_WINDOW_MS,
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

/** "Free", "$150", or `null` while the thing has no price. */
export function formatAskingPrice(
  askingPriceCents: number | null,
): string | null {
  if (askingPriceCents === null) return null;
  return askingPriceCents === 0 ? 'Free' : formatCentsShort(askingPriceCents);
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

/** What goes with a thing when it is deleted, for the confirm: its hold, the effect on Collected, its photos, and the people who asked about it (their messages stay). */
export function getDeleteEffects(
  item: Pick<Item, 'photos' | 'status' | 'pending' | 'sale'>,
  collectedCents: number,
  inquiryCount: number,
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
    inquiryCount === 0
      ? null
      : `${inquiryCount === 1 ? '1 person asked about it. Their message stays' : `${inquiryCount} people asked about it. Their messages stay`} in the Inbox.`,
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
