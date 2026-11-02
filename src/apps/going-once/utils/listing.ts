import { formatCentsShort } from '@/utils/moneyUtils';
import {
  CO_SELLER_DELETE_WINDOW_MS,
  type ITEM_SORT_OPTIONS,
} from '@apps/going-once/constants';
import type { Item } from '@apps/going-once/types';

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
  item: Pick<Item, 'createdBy' | 'createdAt'>,
  { isSeller, uid, now }: { isSeller: boolean; uid: string; now: number },
): boolean {
  if (isSeller) return true;
  return (
    item.createdBy === uid && now - item.createdAt < CO_SELLER_DELETE_WINDOW_MS
  );
}

/** "You added it 4 minutes ago", the sub-line under a co-seller's Delete thing. */
export function formatAddedAgo(createdAt: number, now: number): string {
  const minutes = Math.floor((now - createdAt) / 60_000);
  if (minutes < 1) return 'You added it just now';
  return `You added it ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
}

/** What goes with a thing when it is deleted, for the confirm. Holds, inquiries and Sold totals join this list with the issues that add them. */
export function getDeleteEffects(item: Pick<Item, 'photos'>): string[] {
  const count = item.photos.length;
  if (count === 0) return [];
  return [
    `${count === 1 ? 'Its photo goes' : `Its ${count} photos go`} with it.`,
  ];
}

/** Things in the order asked for; newest first is the order they arrive in, a thing with no price goes last by price. */
export function sortItems(items: Item[], sort: ItemSort): Item[] {
  if (sort === 'newest') return items;
  if (sort === 'name')
    return [...items].sort((first, second) =>
      getItemName(first).localeCompare(getItemName(second)),
    );
  return [...items].sort(
    (first, second) =>
      (first.askingPriceCents ?? Infinity) -
      (second.askingPriceCents ?? Infinity),
  );
}

/** Whether a search matches a thing's name, description or brand or model. */
export function matchesSearch(item: Item, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [item.title, item.description, item.brandModel].some((text) =>
    text?.toLowerCase().includes(needle),
  );
}
