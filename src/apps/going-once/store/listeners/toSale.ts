import type { DocumentData } from 'firebase/firestore';

import { FINISHED_SALE_STATUS } from '@apps/going-once/constants';
import type { Sale } from '@apps/going-once/types';

/** Reads a stored sale, defaulting what an older document may lack. */
export function toSale(id: string, data: DocumentData): Sale {
  const sale = data as Partial<Sale>;
  return {
    id,
    name: sale.name ?? '',
    pickupArea: sale.pickupArea ?? null,
    buyerNote: sale.buyerNote ?? null,
    paymentMethods: Array.isArray(sale.paymentMethods)
      ? sale.paymentMethods.filter((method) => typeof method === 'string')
      : [],
    currency: sale.currency ?? 'USD',
    timeZone: sale.timeZone ?? null,
    ownerUid: sale.ownerUid ?? '',
    createdBy: sale.createdBy ?? '',
    members: sale.members ?? [],
    memberJoinedAt: sale.memberJoinedAt ?? {},
    publicLinkId: sale.publicLinkId ?? null,
    publicLinkChangedAt: sale.publicLinkChangedAt ?? null,
    status:
      sale.status === FINISHED_SALE_STATUS ? FINISHED_SALE_STATUS : 'OPEN',
    finishedAt: sale.finishedAt ?? null,
    finishedBy: sale.finishedBy ?? null,
    contactsClearAt: sale.contactsClearAt ?? null,
    contactsClearedAt: sale.contactsClearedAt ?? null,
    createdAt: sale.createdAt ?? 0,
    lastEditedAt: sale.lastEditedAt ?? null,
  };
}
