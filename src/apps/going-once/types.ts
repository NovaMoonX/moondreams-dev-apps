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

export type ItemStatus = 'AVAILABLE';

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
  photos: ItemPhoto[];
  status: ItemStatus;
  createdBy: string;
  createdAt: number;
  lastEditedAt: number | null;
  lastEditedBy: string | null;
}
