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
