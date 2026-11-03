import type { DocumentData } from 'firebase/firestore';

import type {
  Item,
  ItemStatus,
  StatusChange,
  StatusChangeKind,
} from '@apps/going-once/types';

const getLegacyKind = (
  status: ItemStatus,
  change: Partial<StatusChange>,
): StatusChangeKind => {
  if (status === 'SOLD')
    return change.fromPriceCents == null ? 'MARK_SOLD' : 'CHANGE_PAID';
  if (status === 'PENDING') return 'MARK_PENDING';
  if (status === 'WITHDRAWN') return 'TAKE_OFF';
  return 'BACK_TO_AVAILABLE';
};

const toStatusChange = (data: Partial<StatusChange>): StatusChange => {
  const status = data.status ?? 'AVAILABLE';
  return {
    kind: data.kind ?? getLegacyKind(status, data),
    status,
    byUid: data.byUid ?? '',
    at: data.at ?? 0,
    priceCents: data.priceCents ?? null,
    fromPriceCents: data.fromPriceCents ?? null,
    buyerName: data.buyerName ?? null,
    pickupOn: data.pickupOn ?? null,
  };
};

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
    showBoughtUrl: item.showBoughtUrl ?? false,
    notes: item.notes ?? null,
    isDraft: item.isDraft ?? false,
    photos: Array.isArray(item.photos) ? item.photos : [],
    status: item.status ?? 'AVAILABLE',
    pending: item.pending
      ? { ...item.pending, inquiryId: item.pending.inquiryId ?? null }
      : null,
    sale: item.sale ?? null,
    statusHistory: Array.isArray(item.statusHistory)
      ? item.statusHistory.map(toStatusChange)
      : [],
    listingCopiedAt: item.listingCopiedAt ?? null,
    listingCopiedBy: item.listingCopiedBy ?? null,
    createdBy: item.createdBy ?? '',
    createdAt: item.createdAt ?? 0,
    lastEditedAt: item.lastEditedAt ?? null,
    lastEditedBy: item.lastEditedBy ?? null,
  };
}
