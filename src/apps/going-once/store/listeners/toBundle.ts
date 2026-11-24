import type { DocumentData } from 'firebase/firestore';

import type {
  Bundle,
  BundleChange,
  BundleStatus,
} from '@apps/going-once/types';

const STATUSES: BundleStatus[] = ['ACTIVE', 'PENDING', 'SOLD'];

const toBundleChange = (data: Partial<BundleChange>): BundleChange => ({
  kind: data.kind ?? 'EDIT',
  byUid: data.byUid ?? '',
  at: data.at ?? 0,
  itemId: data.itemId ?? null,
  itemStatus: data.itemStatus ?? null,
  priceCents: data.priceCents ?? null,
  fromPriceCents: data.fromPriceCents ?? null,
});

const toStrings = (value: unknown[]): string[] =>
  value.filter((entry): entry is string => typeof entry === 'string');

/** Reads a stored bundle, defaulting what an older document may lack. */
export function toBundle(
  id: string,
  saleId: string,
  data: DocumentData,
): Bundle {
  const bundle = data as Partial<Bundle>;
  return {
    id,
    saleId,
    name: bundle.name ?? '',
    itemIds: Array.isArray(bundle.itemIds) ? toStrings(bundle.itemIds) : [],
    priceCents: bundle.priceCents ?? 0,
    status: STATUSES.includes(bundle.status as BundleStatus)
      ? (bundle.status as BundleStatus)
      : 'ACTIVE',
    dealItemIds: Array.isArray(bundle.dealItemIds)
      ? toStrings(bundle.dealItemIds)
      : null,
    sale: bundle.sale ?? null,
    keptAtGoneCount: bundle.keptAtGoneCount ?? null,
    history: Array.isArray(bundle.history)
      ? bundle.history.map(toBundleChange)
      : [],
    createdBy: bundle.createdBy ?? '',
    createdAt: bundle.createdAt ?? 0,
    lastEditedAt: bundle.lastEditedAt ?? null,
    lastEditedBy: bundle.lastEditedBy ?? null,
  };
}
