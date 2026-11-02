import type { LinkPreview } from '@/lib/linkMetadata/types';
import type { GOING_ONCE_TABS } from '@apps/going-once/constants';

export type GoingOnceTab = (typeof GOING_ONCE_TABS)[number];

export type SaleCurrency = 'USD';

/** A sale, the container its things belong to (`apps/going-once/sales/{saleId}`). */
export interface Sale {
  id: string;
  name: string;
  /** An area, never an address. */
  pickupArea: string | null;
  buyerNote: string | null;
  currency: SaleCurrency;
  /** The seller; never changes. */
  ownerUid: string;
  createdBy: string;
  /** The seller and any co-sellers; every rule keys off it. */
  members: string[];
  createdAt: number;
  lastEditedAt: number | null;
}

export type ItemCondition = 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR' | 'WELL_USED';

export type ItemStatus = 'AVAILABLE' | 'PENDING' | 'SOLD' | 'WITHDRAWN';

export type PaymentMethod = 'CASH' | 'VENMO' | 'ZELLE' | 'OTHER';

/** Who is set to pick a thing up (`pending`); cleared on Back to available and on Sold. */
export interface ItemPendingRecord {
  /** Set by the inquiry rows that arrive with the inbox. */
  inquiryId: string | null;
  /** A typed name; the buyer's personal data. */
  buyerName: string | null;
  /** A date-only value (UTC midnight). */
  pickupOn: number | null;
  markedBy: string;
  markedAt: number;
}

/** What a thing sold for (`sale`); cleared by Not sold after all. */
export interface ItemSaleRecord {
  priceCents: number;
  method: PaymentMethod | null;
  /** A date-only value (UTC midnight). */
  soldOn: number;
  /** Carried over from the hold it was sold from; the buyer's personal data. */
  buyerName: string | null;
  markedBy: string;
  markedAt: number;
}

/** One entry of a thing's status history; a corrected price carries the figure it replaced. */
export interface StatusChange {
  status: ItemStatus;
  byUid: string;
  at: number;
  priceCents: number | null;
  fromPriceCents: number | null;
}

/** One stored listing-size photo; array order is display order and the first is the cover. */
export interface ItemPhoto {
  id: string;
  /** Storage path of the one stored file. */
  path: string;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: number;
}

/** A thing for sale (`apps/going-once/sales/{saleId}/items/{itemId}`). */
export interface Item {
  id: string;
  saleId: string;
  /** Empty until the person names it. */
  title: string;
  condition: ItemCondition | null;
  /** `0` is Free; `null` is no price yet. */
  askingPriceCents: number | null;
  /** Private: the lowest price the sellers will take. */
  floorPriceCents: number | null;
  description: string | null;
  brandModel: string | null;
  size: string | null;
  /** Private unless `showOriginalPrice`. */
  originalPriceCents: number | null;
  showOriginalPrice: boolean;
  /** Private: where it was bought. */
  boughtFrom: string | null;
  /** Private: a date-only value (UTC midnight). */
  boughtOn: number | null;
  /** Private: the store's page. */
  boughtUrl: string | null;
  boughtUrlPreview: LinkPreview | null;
  /** Private. */
  notes: string | null;
  photos: ItemPhoto[];
  status: ItemStatus;
  pending: ItemPendingRecord | null;
  sale: ItemSaleRecord | null;
  /** The last 50 status changes, oldest first. */
  statusHistory: StatusChange[];
  createdBy: string;
  createdAt: number;
  lastEditedAt: number | null;
  lastEditedBy: string | null;
}
