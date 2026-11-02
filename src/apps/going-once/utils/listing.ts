import { formatCentsShort } from '@/utils/moneyUtils';
import type { Item } from '@apps/going-once/types';

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
