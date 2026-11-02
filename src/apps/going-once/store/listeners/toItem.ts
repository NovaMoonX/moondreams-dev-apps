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
    description: item.description ?? null,
    brandModel: item.brandModel ?? null,
    size: item.size ?? null,
    originalPriceCents: item.originalPriceCents ?? null,
    showOriginalPrice: item.showOriginalPrice ?? false,
    boughtFrom: item.boughtFrom ?? null,
    boughtOn: item.boughtOn ?? null,
    boughtUrl: item.boughtUrl ?? null,
    boughtUrlPreview: item.boughtUrlPreview ?? null,
    notes: item.notes ?? null,
    photos: Array.isArray(item.photos) ? item.photos : [],
    status: item.status ?? 'AVAILABLE',
    pending: item.pending ?? null,
    sale: item.sale ?? null,
    statusHistory: Array.isArray(item.statusHistory) ? item.statusHistory : [],
    createdBy: item.createdBy ?? '',
    createdAt: item.createdAt ?? 0,
    lastEditedAt: item.lastEditedAt ?? null,
    lastEditedBy: item.lastEditedBy ?? null,
  };
}
