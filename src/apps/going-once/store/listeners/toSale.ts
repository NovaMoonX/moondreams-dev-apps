import type { DocumentData } from 'firebase/firestore';

import type { Sale } from '@apps/going-once/types';

/** Reads a stored sale, defaulting what an older document may lack. */
export function toSale(id: string, data: DocumentData): Sale {
  const sale = data as Partial<Sale>;
  return {
    id,
    name: sale.name ?? '',
    pickupArea: sale.pickupArea ?? null,
    buyerNote: sale.buyerNote ?? null,
    currency: sale.currency ?? 'USD',
    ownerUid: sale.ownerUid ?? '',
    createdBy: sale.createdBy ?? '',
    members: sale.members ?? [],
    memberJoinedAt: sale.memberJoinedAt ?? {},
    createdAt: sale.createdAt ?? 0,
    lastEditedAt: sale.lastEditedAt ?? null,
  };
}
