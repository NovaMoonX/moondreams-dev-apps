import type { DocumentData } from 'firebase/firestore';

import type { Item } from '@apps/going-once/types';

/** Reads a stored thing, defaulting what an older document may lack. */
export function toItem(id: string, saleId: string, data: DocumentData): Item {
  const item = data as Partial<Item>;
  return {
    id,
    saleId,
    title: item.title ?? '',
    condition: item.condition ?? null,
    askingPriceCents: item.askingPriceCents ?? null,
    floorPriceCents: item.floorPriceCents ?? null,
    photos: Array.isArray(item.photos) ? item.photos : [],
    status: item.status ?? 'AVAILABLE',
    createdBy: item.createdBy ?? '',
    createdAt: item.createdAt ?? 0,
    lastEditedAt: item.lastEditedAt ?? null,
    lastEditedBy: item.lastEditedBy ?? null,
  };
}
